/**
 * app.js — Range Finder main application
 *
 * Handles:
 *  - Leaflet map setup
 *  - Geocoding (Nominatim)
 *  - Mode / terrain / time / distance UI
 *  - Spawning the range-worker and handling its messages
 *  - Rendering land grid, numbered endpoint markers, and range polygons
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// TORTUOSITY & COUNTRY DATA
// ═══════════════════════════════════════════════════════════════════

/**
 * τ_terrain — road sinuosity due to elevation relief.
 *
 * Consensus from Ballou et al. (2002) Transport Research E;
 * Boscoe et al. (2012) Int. J. Health Geographics;
 * EEA CORINE / SRTM cross-analysis; Weiß et al. (2018) PLOS ONE.
 *
 * flat    (<50 m/10 km) : 1.00
 * rolling (50–200 m)    : 1.08
 * hilly   (200–500 m)   : 1.22
 * mountain (>500 m)     : 1.45
 */
const TERRAIN_TORT = { flat: 1.00, rolling: 1.08, hilly: 1.22, mountain: 1.45 };

const MODE_META = {
  drive: { speed: 115, tort: 1.20, note: '115 km/h base · τ_mode 1.20 (Giacomin & Levinson 2015)' },
  moto:  { speed: 115, tort: 1.15, note: '115 km/h base · τ_mode 1.15 — filters traffic better than car' },
  cycle: { speed: 18,  tort: 1.08, note: '18 km/h base · τ_mode 1.08 (Millward et al. 2013)' },
  run:   { speed: 10,  tort: 1.05, note: '10 km/h base · τ_mode 1.05 — open land accessible' },
  walk:  { speed: 5,   tort: 1.05, note: '5 km/h base · τ_mode 1.05 — open land accessible' }
};

/**
 * European country bounding boxes and highway speed limits (km/h).
 * [name, minLat, maxLat, minLng, maxLng, highway_kmh, default_terrain]
 *
 * Speed limits: EUR-Lex directives + national road authorities.
 * Germany advisory (Richtgeschwindigkeit) = 130, no statutory limit.
 * UK statutory = 70 mph = 112 km/h.
 */
const EU_DB = [
  ['Albania',       39.6, 42.7, 19.2, 21.1, 110, 'hilly'],
  ['Austria',       46.4, 49.0,  9.5, 17.2, 130, 'hilly'],
  ['Belarus',       51.3, 56.2, 23.2, 32.8, 120, 'flat'],
  ['Belgium',       49.5, 51.5,  2.5,  6.4, 120, 'flat'],
  ['Bosnia',        42.6, 45.3, 15.7, 19.7, 130, 'hilly'],
  ['Bulgaria',      41.2, 44.2, 22.4, 28.6, 140, 'rolling'],
  ['Croatia',       42.4, 46.6, 13.5, 19.5, 130, 'rolling'],
  ['Cyprus',        34.5, 35.7, 32.3, 34.6, 100, 'rolling'],
  ['Czech Rep.',    48.6, 51.1, 12.1, 18.9, 130, 'rolling'],
  ['Denmark',       54.6, 57.8,  8.1, 15.2, 130, 'flat'],
  ['Estonia',       57.5, 59.7, 21.8, 28.2, 110, 'flat'],
  ['Finland',       59.8, 70.1, 19.1, 31.6, 120, 'flat'],
  ['France',        42.3, 51.1, -4.8,  8.2, 130, 'rolling'],
  ['Germany',       47.3, 55.1,  5.9, 15.0, 130, 'rolling'],
  ['Greece',        34.8, 41.8, 19.4, 26.6, 130, 'hilly'],
  ['Hungary',       45.7, 48.6, 16.1, 22.9, 130, 'flat'],
  ['Iceland',       63.4, 66.6,-24.5,-13.5,  90, 'mountain'],
  ['Ireland',       51.4, 55.4,-10.5, -6.0, 120, 'rolling'],
  ['Italy',         36.6, 47.1,  6.6, 18.5, 130, 'rolling'],
  ['Kosovo',        41.9, 43.3, 20.0, 21.8, 110, 'hilly'],
  ['Latvia',        55.7, 58.1, 20.9, 28.2, 110, 'flat'],
  ['Lithuania',     53.9, 56.5, 21.0, 26.9, 130, 'flat'],
  ['Luxembourg',    49.4, 50.2,  5.7,  6.5, 130, 'rolling'],
  ['Malta',         35.8, 36.1, 14.2, 14.6,  80, 'flat'],
  ['Moldova',       45.5, 48.5, 26.6, 30.2, 110, 'rolling'],
  ['Montenegro',    41.9, 43.6, 18.4, 20.4, 130, 'mountain'],
  ['Netherlands',   50.8, 53.6,  3.4,  7.2, 100, 'flat'],
  ['N. Macedonia',  40.9, 42.4, 20.5, 23.0, 130, 'hilly'],
  ['Norway',        57.9, 71.2,  4.5, 31.1, 110, 'mountain'],
  ['Poland',        49.0, 54.9, 14.1, 24.2, 140, 'flat'],
  ['Portugal',      36.9, 42.2, -9.5, -6.2, 120, 'rolling'],
  ['Romania',       43.6, 48.3, 22.0, 30.1, 130, 'rolling'],
  ['Serbia',        42.2, 46.2, 19.0, 23.0, 130, 'rolling'],
  ['Slovakia',      47.7, 49.6, 16.8, 22.6, 130, 'hilly'],
  ['Slovenia',      45.4, 46.9, 13.4, 16.6, 130, 'hilly'],
  ['Spain',         36.0, 43.8, -9.3,  4.3, 120, 'rolling'],
  ['Sweden',        55.3, 69.1, 11.1, 24.2, 120, 'rolling'],
  ['Switzerland',   45.8, 47.9,  5.9, 10.5, 120, 'mountain'],
  ['Turkey',        35.8, 42.1, 26.0, 44.8, 120, 'rolling'],
  ['Ukraine',       44.4, 52.4, 22.1, 40.2, 130, 'rolling'],
  ['UK',            49.9, 60.9, -8.2,  2.0, 112, 'rolling'],
];

const HIGHWAY_REF = 130; // reference limit (Germany advisory)

function countryAt(lat, lng) {
  const hits = EU_DB.filter(c => lat >= c[1] && lat <= c[2] && lng >= c[3] && lng <= c[4]);
  if (!hits.length) return null;
  // Pick smallest bounding box (most specific)
  hits.sort((a, b) => ((a[2]-a[1])*(a[4]-a[3])) - ((b[2]-b[1])*(b[4]-b[3])));
  return { name: hits[0][0], highway: hits[0][5], terrain: hits[0][6] };
}


// ═══════════════════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════════════════

const map = L.map('map', { center: [48, 10], zoom: 5, zoomControl: false });
L.control.zoom({ position: 'bottomright' }).addTo(map);

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

let coords      = null; // { lat, lng }
let pin         = null;
let mapLayers   = [];   // all non-pin Leaflet layers (cleared between runs)
let gridMarkers = [];   // land grid dots
let epMarkers   = [];   // numbered endpoint markers
let useDist     = false;
let activeModeKey = 'drive';
let worker      = null; // current Web Worker instance
let searchTimer = null;
let lastQuery   = '';


// ═══════════════════════════════════════════════════════════════════
// MODE BUTTONS
// ═══════════════════════════════════════════════════════════════════

document.querySelectorAll('.mb').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mb').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeModeKey = btn.dataset.mode;
    document.getElementById('sn').textContent = MODE_META[activeModeKey].note;
    updateTable();
    clearOverlay();
  });
});


// ═══════════════════════════════════════════════════════════════════
// CONTEXT PANEL — terrain / country
// ═══════════════════════════════════════════════════════════════════

document.getElementById('ctx-terrain').addEventListener('change', () => { updateTable(); clearOverlay(); });

function updateTable() {
  const m   = MODE_META[activeModeKey];
  const t   = TERRAIN_TORT[document.getElementById('ctx-terrain').value];
  const tot = +(m.tort * t).toFixed(3);
  const spd = +(m.speed / tot).toFixed(1);

  document.getElementById('ft-m').textContent   = m.tort.toFixed(2);
  document.getElementById('ft-t').textContent   = t.toFixed(2);
  document.getElementById('ft-tot').textContent = tot.toFixed(2);
  document.getElementById('ft-spd').textContent = spd + ' km/h';
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

function sMin(v) { v = Math.max(.5, Math.min(+mah.value - .5, +v)); mih.value = mis.value = v; }
function sMax(v) { v = Math.min(24, Math.max(+mih.value + .5, +v)); mah.value = mas.value = v; }

mih.addEventListener('change', e => sMin(e.target.value));
mis.addEventListener('input',  e => sMin(e.target.value));
mah.addEventListener('change', e => sMax(e.target.value));
mas.addEventListener('input',  e => sMax(e.target.value));


// ═══════════════════════════════════════════════════════════════════
// SLIDERS — distance
// ═══════════════════════════════════════════════════════════════════

const mid  = document.getElementById('mid'),  mad  = document.getElementById('mad');
const mids = document.getElementById('mids'), mads = document.getElementById('mads');

function sdMin(v) { v = Math.max(10, Math.min(+mad.value - 10, +v)); mid.value = mids.value = v; }
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
  document.getElementById('tp').style.display   = useDist ? 'none' : 'flex';
  document.getElementById('dp').style.display   = useDist ? 'flex' : 'none';
  document.getElementById('lt').style.cssText   = useDist ? 'color:var(--mt)' : 'font-weight:600;color:var(--tx)';
  document.getElementById('ld').style.cssText   = useDist ? 'font-weight:600;color:var(--tx)' : 'color:var(--mt)';
  clearOverlay();
});

document.getElementById('tp').style.display = 'flex';
document.getElementById('dp').style.display = 'none';


// ═══════════════════════════════════════════════════════════════════
// VISIBILITY TOGGLES — grid + endpoint markers
// ═══════════════════════════════════════════════════════════════════

document.getElementById('show-grid').addEventListener('change', function () {
  gridMarkers.forEach(m => this.checked ? map.addLayer(m) : map.removeLayer(m));
});

document.getElementById('show-pts').addEventListener('change', function () {
  epMarkers.forEach(m => this.checked ? map.addLayer(m) : map.removeLayer(m));
});


// ═══════════════════════════════════════════════════════════════════
// GEOCODING — Nominatim, 1.2 s debounce, max 3 results
// ═══════════════════════════════════════════════════════════════════

const locEl = document.getElementById('loc');
const sugEl = document.getElementById('sug');

locEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = locEl.value.trim();
  if (q.length < 3) { hideSug(); return; }
  if (q === lastQuery) return;
  searchTimer = setTimeout(() => { lastQuery = q; doSearch(q); }, 1200);
});

locEl.addEventListener('keydown', e => { if (e.key === 'Escape') hideSug(); });
document.addEventListener('click', e => { if (!e.target.closest('#lw')) hideSug(); });

function hideSug() { sugEl.style.display = 'none'; sugEl.innerHTML = ''; }

async function doSearch(q) {
  try {
    const data = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=3&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'RangeFinderApp/1.0' } }
    ).then(r => r.json());

    if (locEl.value.trim() !== q) return; // stale result
    renderSug(data);
  } catch { hideSug(); }
}

function renderSug(results) {
  sugEl.innerHTML = '';
  if (!results.length) { hideSug(); return; }

  results.slice(0, 3).forEach(r => {
    const d = document.createElement('div');
    d.className = 'si';
    const parts = r.display_name.split(', ');
    const main  = esc(parts.slice(0, 2).join(', '));
    const sub   = parts.length > 2 ? esc(parts.slice(2).join(', ')) : '';
    d.innerHTML = `<div class="sm">${main}</div>${sub ? `<div class="ss">${sub}</div>` : ''}`;

    d.addEventListener('click', () => {
      locEl.value = r.display_name; lastQuery = r.display_name; hideSug();
      placePin(+r.lat, +r.lon);
      map.setView([+r.lat, +r.lon], 10);
      applyAddress(r.address, +r.lat, +r.lon);
    });

    sugEl.appendChild(d);
  });

  sugEl.style.display = 'block';
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ═══════════════════════════════════════════════════════════════════
// MAP CLICK — reverse geocode, 25 m address threshold
// ═══════════════════════════════════════════════════════════════════

map.on('click', async e => {
  const { lat, lng } = e.latlng;
  placePin(lat, lng);
  locEl.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; lastQuery = locEl.value;
  hideSug();

  try {
    const d = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'RangeFinderApp/1.0' } }
    ).then(r => r.json());

    if (!d?.lat) return;

    // Only show the address if the returned point is within 25 m of the click
    const dist = turf.distance(turf.point([lng, lat]), turf.point([+d.lon, +d.lat]), { units: 'meters' });
    if (dist <= 25 && d.display_name) {
      locEl.value = d.display_name; lastQuery = d.display_name;
    }

    applyAddress(d.address, lat, lng);
  } catch {}
});

/**
 * Apply detected country + terrain from a geocoding result.
 * Uses bounding-box lookup to confirm country and pick default terrain.
 */
function applyAddress(address, lat, lng) {
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
// CALCULATE — spawn / restart worker
// ═══════════════════════════════════════════════════════════════════

document.getElementById('calc').addEventListener('click', () => {
  if (!coords) { alert('Please select a starting location first.'); return; }

  // Terminate any running worker
  if (worker) { worker.terminate(); worker = null; }

  const m      = MODE_META[activeModeKey];
  const tTerr  = TERRAIN_TORT[document.getElementById('ctx-terrain').value];
  const totTort = m.tort * tTerr;
  const effSpd  = m.speed / totTort;

  let outerKm, innerKm, legOTxt, legITxt;

  if (!useDist) {
    const minH = +mih.value, maxH = +mah.value;
    outerKm  = effSpd * maxH;
    innerKm  = effSpd * minH;
    legOTxt  = `Outer: ~${fmt(outerKm)} km (${maxH} hr)`;
    legITxt  = `Inner: ~${fmt(innerKm)} km (${minH} hr)`;
  } else {
    const minD = +mid.value, maxD = +mad.value;
    outerKm  = maxD / totTort;
    innerKm  = minD / totTort;
    legOTxt  = `Outer: ~${fmt(outerKm)} km (${maxD} km road)`;
    legITxt  = `Inner: ~${fmt(innerKm)} km (${minD} km road)`;
  }

  // Store for info card
  const infoMeta = { effSpd, totTort, m, outerKm, innerKm };

  clearOverlay(false);

  // Show status UI
  document.getElementById('calc').disabled = true;
  const sa = document.getElementById('status-area');
  sa.classList.add('vis');
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
        sa.classList.remove('vis');
        document.getElementById('calc').disabled = false;
        renderResults(msg, infoMeta, legOTxt, legITxt);
        break;

      case 'error':
        worker = null;
        sa.classList.remove('vis');
        document.getElementById('calc').disabled = false;
        alert(`Error: ${msg.msg}`);
        break;
    }
  };

  worker.onerror = function (e) {
    worker = null;
    sa.classList.remove('vis');
    document.getElementById('calc').disabled = false;
    alert(`Worker error: ${e.message}`);
  };

  worker.postMessage({ clat: coords.lat, clng: coords.lng, outerKm, innerKm });
});


function setStatus(msg, pct) {
  document.getElementById('status-msg').textContent = msg;
  if (pct !== null) {
    document.getElementById('progress-bar').style.width = pct + '%';
  }
}


// ═══════════════════════════════════════════════════════════════════
// RENDER LAND GRID
// ═══════════════════════════════════════════════════════════════════

function renderGrid(pts) {
  // Remove old grid markers
  gridMarkers.forEach(m => map.removeLayer(m));
  gridMarkers = [];

  const showGrid = document.getElementById('show-grid').checked;
  const landPts  = pts.filter(p => p.land);

  landPts.forEach(p => {
    const m = L.circleMarker([p.lat, p.lng], {
      renderer:    canvasRenderer,
      radius:      2,
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
// RENDER RANGE RESULTS
// ═══════════════════════════════════════════════════════════════════

function renderResults(workerResult, meta, legOTxt, legITxt) {
  const { outerRing, innerRing, outerGeo, innerGeo } = workerResult;

  // ── Outer polygon (filled blue) ──
  const outerLayer = L.geoJSON(outerGeo, {
    style: { color: '#0078a8', weight: 2, opacity: .8, fillColor: '#0096cc', fillOpacity: .18 }
  }).addTo(map);

  // ── Inner polygon (white mask to create donut effect) ──
  const innerLayer = L.geoJSON(innerGeo, {
    style: { color: '#0078a8', weight: 1.5, opacity: .6, dashArray: '5 5', fillColor: '#f0ede8', fillOpacity: .82 }
  }).addTo(map);

  mapLayers.push(outerLayer, innerLayer);

  // ── Numbered endpoint markers on outer ring ──
  const showPts = document.getElementById('show-pts').checked;
  epMarkers.forEach(m => map.removeLayer(m));
  epMarkers = [];

  outerRing.forEach(([lng, lat], idx) => {
    const num = idx + 1;
    const icon = L.divIcon({
      className: '',
      html: `<div class="ep-marker">${num}</div>`,
      iconSize:   [18, 18],
      iconAnchor: [9, 9]
    });
    const marker = L.marker([lat, lng], { icon, zIndexOffset: 100 });
    if (showPts) marker.addTo(map);
    epMarkers.push(marker);
  });

  // ── Fit map ──
  map.fitBounds(outerLayer.getBounds(), { padding: [40, 40] });

  // ── Info card ──
  const { effSpd, totTort, m, outerKm, innerKm } = meta;
  const ic = document.getElementById('ic');
  ic.style.display = 'block';
  ic.innerHTML = `
    <div class="icr">~${fmt(outerKm)} km</div> outer crow-flies radius
    <div class="ics">
      <b>Speed:</b> ${m.speed} km/h ÷ ${totTort.toFixed(2)} = ${effSpd.toFixed(1)} km/h effective<br>
      <b>τ_mode</b> ${m.tort} × <b>τ_terrain</b> ${TERRAIN_TORT[document.getElementById('ctx-terrain').value].toFixed(2)} = ${totTort.toFixed(2)}<br>
      <b>Shape:</b> 72 vectors (5° apart) · vectors stop at water if redirect &gt;60°<br>
      Inner radius: ~${fmt(innerKm)} km
    </div>`;

  // ── Legend ──
  document.getElementById('lo-lbl').textContent = legOTxt;
  document.getElementById('in-lbl').textContent = legITxt;
  document.getElementById('leg').classList.add('vis');
  document.getElementById('clr').style.display = 'block';
}


// ═══════════════════════════════════════════════════════════════════
// CLEAR
// ═══════════════════════════════════════════════════════════════════

function clearOverlay(resetUI = true) {
  // Terminate any running worker
  if (worker) { worker.terminate(); worker = null; }

  mapLayers.forEach(l => map.removeLayer(l));
  mapLayers = [];

  gridMarkers.forEach(m => map.removeLayer(m));
  gridMarkers = [];

  epMarkers.forEach(m => map.removeLayer(m));
  epMarkers = [];

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
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function fmt(n) { return Math.round(n).toLocaleString(); }
