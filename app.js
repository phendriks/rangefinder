/**
 * app.js — Range Finder main application
 *
 * All tuneable values live in constants.js (C.*).
 *
 * Responsibilities:
 *  - Leaflet map setup and tile layer
 *  - Mode / terrain / time / distance UI and sliders
 *  - Nominatim geocoding (forward + reverse)
 *  - Spawning range-worker.js and routing its messages
 *  - Rendering land grid dots, numbered endpoint markers, range polygons
 */

'use strict';

// C is loaded via <script src="constants.js"> in index.html before this file.


// ═══════════════════════════════════════════════════════════════════
// HELPERS — country lookup
// ═══════════════════════════════════════════════════════════════════

/**
 * Return the smallest bounding box in C.COUNTRY_DB that contains (lat, lng),
 * or null if the point is outside all known countries.
 * Smallest box = most specific (avoids large countries swallowing small neighbours).
 */
function countryAt(lat, lng) {
  const hits = C.COUNTRY_DB.filter(
    c => lat >= c[1] && lat <= c[2] && lng >= c[3] && lng <= c[4]
  );
  if (!hits.length) return null;
  hits.sort((a, b) => ((a[2]-a[1]) * (a[4]-a[3])) - ((b[2]-b[1]) * (b[4]-b[3])));
  return { name: hits[0][0], highway: hits[0][5], terrain: hits[0][6] };
}


// ═══════════════════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════════════════

const map = L.map('map', { center: [48, 10], zoom: 5, zoomControl: false });
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Canvas renderer for the land grid — much faster than SVG for hundreds of dots
const canvasRenderer = L.canvas({ padding: 0.5 });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

document.getElementById('map').style.marginLeft = '300px';
map.invalidateSize();


// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

let coords        = null;  // { lat, lng } of current pin
let pin           = null;  // Leaflet Marker for the start pin
let mapLayers     = [];    // polygon / GeoJSON layers (cleared between runs)
let gridMarkers   = [];    // land grid circle markers
let epMarkers     = [];    // numbered endpoint markers
let useDist       = false; // false = time mode, true = distance mode
let activeModeKey = 'drive';
let worker        = null;  // active Web Worker instance (or null)
let searchTimer   = null;  // geocode debounce timer ID
let lastQuery     = '';    // last query sent to Nominatim


// ═══════════════════════════════════════════════════════════════════
// MODE BUTTONS
// ═══════════════════════════════════════════════════════════════════

document.querySelectorAll('.mb').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mb').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeModeKey = btn.dataset.mode;
    document.getElementById('sn').textContent = C.MODE_NOTE[activeModeKey];
    updateTable();
    clearOverlay();
  });
});


// ═══════════════════════════════════════════════════════════════════
// CONTEXT PANEL — terrain dropdown + factor table
// ═══════════════════════════════════════════════════════════════════

document.getElementById('ctx-terrain').addEventListener('change', () => {
  updateTable();
  clearOverlay();
});

function updateTable() {
  const speed   = C.MODE_SPEED_KMH[activeModeKey];
  const modeTau = C.MODE_TORTUOSITY[activeModeKey];
  const terrTau = C.TERRAIN_TORTUOSITY[document.getElementById('ctx-terrain').value];
  const total   = +(modeTau * terrTau).toFixed(3);
  const effSpd  = +(speed / total).toFixed(1);

  document.getElementById('ft-m').textContent   = modeTau.toFixed(2);
  document.getElementById('ft-t').textContent   = terrTau.toFixed(2);
  document.getElementById('ft-tot').textContent = total.toFixed(2);
  document.getElementById('ft-spd').textContent = effSpd + ' km/h';
}

function showCtx(country, terrainOverride) {
  document.getElementById('ctx').classList.add('vis');

  if (country) {
    document.getElementById('ctx-country').textContent = country.name;
    document.getElementById('ctx-limit').textContent   = `max ${country.highway} km/h`;
  } else {
    document.getElementById('ctx-country').textContent = '—';
    document.getElementById('ctx-limit').textContent   = '';
  }

  if (terrainOverride) {
    document.getElementById('ctx-terrain').value = terrainOverride;
  }

  updateTable();
}


// ═══════════════════════════════════════════════════════════════════
// SLIDERS — time
// ═══════════════════════════════════════════════════════════════════

const mih = document.getElementById('mih'), mah = document.getElementById('mah');
const mis = document.getElementById('mis'), mas = document.getElementById('mas');

function sMin(v) { v = Math.max(0.5, Math.min(+mah.value - 0.5, +v)); mih.value = mis.value = v; }
function sMax(v) { v = Math.min(24,  Math.max(+mih.value + 0.5, +v)); mah.value = mas.value = v; }

mih.addEventListener('change', e => sMin(e.target.value));
mis.addEventListener('input',  e => sMin(e.target.value));
mah.addEventListener('change', e => sMax(e.target.value));
mas.addEventListener('input',  e => sMax(e.target.value));


// ═══════════════════════════════════════════════════════════════════
// SLIDERS — distance
// ═══════════════════════════════════════════════════════════════════

const mid  = document.getElementById('mid'),  mad  = document.getElementById('mad');
const mids = document.getElementById('mids'), mads = document.getElementById('mads');

function sdMin(v) { v = Math.max(10,   Math.min(+mad.value - 10, +v)); mid.value = mids.value = v; }
function sdMax(v) { v = Math.min(5000, Math.max(+mid.value + 10, +v)); mad.value = mads.value = v; }

mid.addEventListener('change',  e => sdMin(e.target.value));
mids.addEventListener('input',  e => sdMin(e.target.value));
mad.addEventListener('change',  e => sdMax(e.target.value));
mads.addEventListener('input',  e => sdMax(e.target.value));


// ═══════════════════════════════════════════════════════════════════
// TOGGLE — time vs distance
// ═══════════════════════════════════════════════════════════════════

document.getElementById('dtg').addEventListener('change', function () {
  useDist = this.checked;
  document.getElementById('tp').style.display = useDist ? 'none'  : 'flex';
  document.getElementById('dp').style.display = useDist ? 'flex'  : 'none';
  document.getElementById('lt').style.cssText = useDist
    ? 'color:var(--mt)'
    : 'font-weight:600;color:var(--tx)';
  document.getElementById('ld').style.cssText = useDist
    ? 'font-weight:600;color:var(--tx)'
    : 'color:var(--mt)';
  clearOverlay();
});

// Set initial state
document.getElementById('tp').style.display = 'flex';
document.getElementById('dp').style.display = 'none';


// ═══════════════════════════════════════════════════════════════════
// VISIBILITY TOGGLES — grid dots + endpoint markers
// ═══════════════════════════════════════════════════════════════════

document.getElementById('show-grid').addEventListener('change', function () {
  gridMarkers.forEach(m => this.checked ? map.addLayer(m) : map.removeLayer(m));
});

document.getElementById('show-pts').addEventListener('change', function () {
  epMarkers.forEach(m => this.checked ? map.addLayer(m) : map.removeLayer(m));
});


// ═══════════════════════════════════════════════════════════════════
// GEOCODING — Nominatim, debounce from C.GEOCODE_DEBOUNCE_MS
// ═══════════════════════════════════════════════════════════════════

const locEl = document.getElementById('loc');
const sugEl = document.getElementById('sug');

locEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = locEl.value.trim();
  if (q.length < 3) { hideSug(); return; }
  if (q === lastQuery) return;
  searchTimer = setTimeout(() => { lastQuery = q; doSearch(q); }, C.GEOCODE_DEBOUNCE_MS);
});

locEl.addEventListener('keydown', e => { if (e.key === 'Escape') hideSug(); });
document.addEventListener('click', e => { if (!e.target.closest('#lw')) hideSug(); });

function hideSug() { sugEl.style.display = 'none'; sugEl.innerHTML = ''; }

async function doSearch(q) {
  try {
    const url  = `${C.NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(q)}&limit=${C.GEOCODE_MAX_RESULTS}&addressdetails=1`;
    const data = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'RangeFinderApp/1.0' }
    }).then(r => r.json());

    if (locEl.value.trim() !== q) return; // stale — user typed more
    renderSug(data);
  } catch { hideSug(); }
}

function renderSug(results) {
  sugEl.innerHTML = '';
  if (!results.length) { hideSug(); return; }

  results.slice(0, C.GEOCODE_MAX_RESULTS).forEach(r => {
    const d     = document.createElement('div');
    d.className = 'si';
    const parts = r.display_name.split(', ');
    const main  = esc(parts.slice(0, 2).join(', '));
    const sub   = parts.length > 2 ? esc(parts.slice(2).join(', ')) : '';
    d.innerHTML = `<div class="sm">${main}</div>${sub ? `<div class="ss">${sub}</div>` : ''}`;

    d.addEventListener('click', () => {
      locEl.value = r.display_name; lastQuery = r.display_name; hideSug();
      placePin(+r.lat, +r.lon);
      map.setView([+r.lat, +r.lon], 10);
      applyAddress(+r.lat, +r.lon);
    });

    sugEl.appendChild(d);
  });

  sugEl.style.display = 'block';
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ═══════════════════════════════════════════════════════════════════
// MAP CLICK — reverse geocode with C.REVERSE_GEOCODE_MAX_DISTANCE_M threshold
// ═══════════════════════════════════════════════════════════════════

map.on('click', async e => {
  const { lat, lng } = e.latlng;
  placePin(lat, lng);
  locEl.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; lastQuery = locEl.value;
  hideSug();

  try {
    const url  = `${C.NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const d    = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'RangeFinderApp/1.0' }
    }).then(r => r.json());

    if (!d?.lat) return;

    const dist = turf.distance(
      turf.point([lng, lat]),
      turf.point([+d.lon, +d.lat]),
      { units: 'meters' }
    );

    if (dist <= C.REVERSE_GEOCODE_MAX_DISTANCE_M && d.display_name) {
      locEl.value = d.display_name; lastQuery = d.display_name;
    }

    applyAddress(lat, lng);
  } catch {}
});

function applyAddress(lat, lng) {
  const country = countryAt(lat, lng);
  showCtx(country, country ? country.terrain : null);
}


// ═══════════════════════════════════════════════════════════════════
// PIN
// ═══════════════════════════════════════════════════════════════════

function placePin(lat, lng) {
  coords = { lat, lng };
  if (pin) map.removeLayer(pin);
  pin = L.marker([lat, lng]).addTo(map);
  clearOverlay();
}


// ═══════════════════════════════════════════════════════════════════
// CALCULATE — spawn (or restart) the Web Worker
// ═══════════════════════════════════════════════════════════════════

document.getElementById('calc').addEventListener('click', () => {
  if (!coords) { alert('Please select a starting location first.'); return; }

  if (worker) { worker.terminate(); worker = null; }

  const speed   = C.MODE_SPEED_KMH[activeModeKey];
  const modeTau = C.MODE_TORTUOSITY[activeModeKey];
  const terrTau = C.TERRAIN_TORTUOSITY[document.getElementById('ctx-terrain').value];
  const total   = modeTau * terrTau;
  const effSpd  = speed / total;

  let outerKm, innerKm, legOTxt, legITxt;

  if (!useDist) {
    const minH = +mih.value, maxH = +mah.value;
    outerKm = effSpd * maxH;
    innerKm = effSpd * minH;
    legOTxt = `Outer: ~${fmt(outerKm)} km (${maxH} hr)`;
    legITxt = `Inner: ~${fmt(innerKm)} km (${minH} hr)`;
  } else {
    const minD = +mid.value, maxD = +mad.value;
    outerKm = maxD / total;
    innerKm = minD / total;
    legOTxt = `Outer: ~${fmt(outerKm)} km (${maxD} km road)`;
    legITxt = `Inner: ~${fmt(innerKm)} km (${minD} km road)`;
  }

  const meta = { effSpd, total, speed, modeTau, terrTau, outerKm, innerKm };

  clearOverlay(false);

  // Show progress UI
  document.getElementById('calc').disabled = true;
  document.getElementById('status-area').classList.add('vis');
  setStatus('Initialising…', 0);

  // Start worker
  worker = new Worker('range-worker.js');

  worker.onmessage = function (evt) {
    const msg = evt.data;
    switch (msg.type) {
      case 'status':
        setStatus(msg.msg, null);
        break;
      case 'progress':
        setStatus(`Walking vectors… ${msg.pct}%`, msg.pct);
        break;
      case 'grid':
        renderGrid(msg.pts);
        break;
      case 'done':
        worker = null;
        document.getElementById('status-area').classList.remove('vis');
        document.getElementById('calc').disabled = false;
        renderResults(msg, meta, legOTxt, legITxt);
        break;
      case 'error':
        worker = null;
        document.getElementById('status-area').classList.remove('vis');
        document.getElementById('calc').disabled = false;
        alert(`Error: ${msg.msg}`);
        break;
    }
  };

  worker.onerror = function (e) {
    worker = null;
    document.getElementById('status-area').classList.remove('vis');
    document.getElementById('calc').disabled = false;
    alert(`Worker error: ${e.message}`);
  };

  worker.postMessage({ clat: coords.lat, clng: coords.lng, outerKm, innerKm });
});

function setStatus(msg, pct) {
  document.getElementById('status-msg').textContent = msg;
  if (pct !== null) document.getElementById('progress-bar').style.width = pct + '%';
}


// ═══════════════════════════════════════════════════════════════════
// RENDER — land grid dots
// ═══════════════════════════════════════════════════════════════════

function renderGrid(pts) {
  gridMarkers.forEach(m => map.removeLayer(m));
  gridMarkers = [];

  const showGrid = document.getElementById('show-grid').checked;

  pts.forEach(p => {
    const m = L.circleMarker([p.lat, p.lng], {
      renderer:    canvasRenderer,
      radius:      C.GRID_DOT_RADIUS,
      color:       '#28a050',
      fillColor:   '#28a050',
      fillOpacity: 0.45,
      weight:      0
    });
    if (showGrid) m.addTo(map);
    gridMarkers.push(m);
  });
}


// ═══════════════════════════════════════════════════════════════════
// RENDER — polygons + numbered endpoint markers
// ═══════════════════════════════════════════════════════════════════

function renderResults(workerResult, meta, legOTxt, legITxt) {
  const { outerRing, innerRing, outerGeo, innerGeo } = workerResult;

  // Outer polygon (semi-transparent blue)
  const outerLayer = L.geoJSON(outerGeo, {
    style: { color: '#0078a8', weight: 2, opacity: 0.8, fillColor: '#0096cc', fillOpacity: 0.18 }
  }).addTo(map);

  // Inner polygon (opaque fill — creates the donut effect)
  const innerLayer = L.geoJSON(innerGeo, {
    style: { color: '#0078a8', weight: 1.5, opacity: 0.6, dashArray: '5 5', fillColor: '#f0ede8', fillOpacity: 0.82 }
  }).addTo(map);

  mapLayers.push(outerLayer, innerLayer);

  // Numbered endpoint markers on the outer ring
  epMarkers.forEach(m => map.removeLayer(m));
  epMarkers = [];
  const showPts = document.getElementById('show-pts').checked;

  outerRing.forEach(([lng, lat], idx) => {
    const icon = L.divIcon({
      className:  '',
      html:       `<div class="ep-marker">${idx + 1}</div>`,
      iconSize:   [18, 18],
      iconAnchor: [9, 9]
    });
    const marker = L.marker([lat, lng], { icon, zIndexOffset: 100 });
    if (showPts) marker.addTo(map);
    epMarkers.push(marker);
  });

  map.fitBounds(outerLayer.getBounds(), { padding: [40, 40] });

  // Info card
  const { effSpd, total, speed, modeTau, terrTau, outerKm, innerKm } = meta;
  const terrain = document.getElementById('ctx-terrain').value;
  const ic = document.getElementById('ic');
  ic.style.display = 'block';
  ic.innerHTML = `
    <div class="icr">~${fmt(outerKm)} km</div> outer crow-flies radius
    <div class="ics">
      <b>Speed:</b> ${speed} km/h ÷ ${total.toFixed(2)} = ${effSpd.toFixed(1)} km/h effective<br>
      <b>τ_mode</b> ${modeTau} × <b>τ_terrain</b> ${C.TERRAIN_TORTUOSITY[terrain].toFixed(2)} = ${total.toFixed(2)}<br>
      <b>Shape:</b> ${C.VECTOR_COUNT} vectors · ${C.VECTOR_STEP_DEG}° apart · max redirect ${C.REDIRECT_ANGLE_MAX}°<br>
      Inner radius: ~${fmt(innerKm)} km
    </div>`;

  document.getElementById('lo-lbl').textContent = legOTxt;
  document.getElementById('in-lbl').textContent = legITxt;
  document.getElementById('leg').classList.add('vis');
  document.getElementById('clr').style.display = 'block';
}


// ═══════════════════════════════════════════════════════════════════
// CLEAR
// ═══════════════════════════════════════════════════════════════════

function clearOverlay(resetUI = true) {
  if (worker) { worker.terminate(); worker = null; }

  mapLayers.forEach(l => map.removeLayer(l));   mapLayers = [];
  gridMarkers.forEach(m => map.removeLayer(m)); gridMarkers = [];
  epMarkers.forEach(m => map.removeLayer(m));   epMarkers = [];

  if (resetUI) {
    document.getElementById('ic').style.display      = 'none';
    document.getElementById('leg').classList.remove('vis');
    document.getElementById('clr').style.display     = 'none';
    document.getElementById('status-area').classList.remove('vis');
    document.getElementById('calc').disabled          = false;
  }
}

document.getElementById('clr').addEventListener('click', () => clearOverlay(true));


// ═══════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════

function fmt(n) { return Math.round(n).toLocaleString(); }
