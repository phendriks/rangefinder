'use strict';

// C is loaded via <script src="constants.js"> before this file.


// Country lookup

function countryAt(lat, lng) {
		const hits = C.COUNTRY_DB.filter(c =>
				lat >= c[1] && lat <= c[2] &&
				lng >= c[3] && lng <= c[4]
		);

		if (!hits.length) return null;

		hits.sort((a, b) =>
				((a[2] - a[1]) * (a[4] - a[3])) -
				((b[2] - b[1]) * (b[4] - b[3]))
		);

		return {
				name: hits[0][0],
				highway: hits[0][5],
				terrain: hits[0][6]
		};
}


// Map setup

const map = L.map('map', {
		center: C.MAP_INITIAL_CENTER,
		zoom: C.MAP_INITIAL_ZOOM,
		zoomControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

const canvasRenderer = L.canvas({ padding: 0.5 });

L.tileLayer(
		'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{
				maxZoom: 19,
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
		}
).addTo(map);

const isMobile = () => window.innerWidth < C.MOBILE_BREAKPOINT_PX;

function updateMapMargin() {
		const mapEl = document.getElementById('map');
		mapEl.style.marginLeft = isMobile() ? '' : (C.SIDEBAR_WIDTH_PX + 'px');
		map.invalidateSize();
}

updateMapMargin();
window.addEventListener('resize', updateMapMargin);


// State

let coords = null;
let pin = null;
let mapLayers = [];
let gridMarkers = [];
let endpointMarkers = [];
let useDist = false;
let activeModeKey = 'drive';
let worker = null;
let searchTimer = null;
let lastQuery = '';


// Mobile bottom sheet

(function () {
		const sidebar = document.getElementById('sidebar');
		const sheetTop = document.getElementById('sheet-top');
		const subtitle = document.getElementById('sheet-subtitle');

		if (!sheetTop) return;

		function isCollapsed() {
				return sidebar.classList.contains('sheet-collapsed');
		}

		function setSheet(collapsed) {
				sidebar.classList.toggle('sheet-collapsed', collapsed);
				sheetTop.setAttribute('aria-expanded', String(!collapsed));
				subtitle.textContent = collapsed ? 'Tap to open controls' : 'Tap to close';

				setTimeout(() => map.invalidateSize(), C.SHEET_TRANSITION_MS);
		}

		sheetTop.addEventListener('click', () => {
				setSheet(!isCollapsed());
		});

		map.on('click mousedown touchstart', () => {
				if (isMobile() && !isCollapsed()) {
						setSheet(true);
				}
		});

		document.getElementById('calc').addEventListener('click', () => {
				if (isMobile()) setSheet(false);
		});
})();


// Mode buttons

document.querySelectorAll('.mb').forEach(btn => {
		btn.addEventListener('click', () => {
				document.querySelectorAll('.mb').forEach(b => {
						b.classList.remove('active');
				});

				btn.classList.add('active');
				activeModeKey = btn.dataset.mode;

				document.getElementById('sn').textContent = C.MODE_NOTE[activeModeKey];

				updateTable();
				clearOverlay();
		});
});


// Context panel

document.getElementById('ctx-terrain').addEventListener('change', () => {
		updateTable();
		clearOverlay();
});

function updateTable() {
		const speedKmh = C.MODE_SPEED_KMH[activeModeKey];
		const modeTau = C.MODE_TORTUOSITY[activeModeKey];
		const terrTau = C.TERRAIN_TORTUOSITY[document.getElementById('ctx-terrain').value];

		const totalTau = +(modeTau * terrTau).toFixed(3);
		const effSpeedKmh = +(speedKmh / totalTau).toFixed(1);

		document.getElementById('ft-m').textContent = modeTau.toFixed(2);
		document.getElementById('ft-t').textContent = terrTau.toFixed(2);
		document.getElementById('ft-tot').textContent = totalTau.toFixed(2);
		document.getElementById('ft-spd').textContent = effSpeedKmh + ' km/h';
}

function showCtx(country, terrainOverride) {
		document.getElementById('ctx').classList.add('vis');

		if (country) {
				document.getElementById('ctx-country').textContent = country.name;
				document.getElementById('ctx-limit').textContent = `max ${country.highway} km/h`;
		} else {
				document.getElementById('ctx-country').textContent = '—';
				document.getElementById('ctx-limit').textContent = '';
		}

		if (terrainOverride) {
				document.getElementById('ctx-terrain').value = terrainOverride;
		}

		updateTable();
}


// Sliders (time)

const minHoursInput = document.getElementById('mih');
const maxHoursInput = document.getElementById('mah');
const minHoursSlider = document.getElementById('mis');
const maxHoursSlider = document.getElementById('mas');

function setMinHours(v) {
		const maxV = +maxHoursInput.value;
		const clamped = Math.max(0.5, Math.min(maxV - 0.5, +v));
		minHoursInput.value = minHoursSlider.value = clamped;
}

function setMaxHours(v) {
		const minV = +minHoursInput.value;
		const clamped = Math.min(24, Math.max(minV + 0.5, +v));
		maxHoursInput.value = maxHoursSlider.value = clamped;
}

minHoursInput.addEventListener('change', e => setMinHours(e.target.value));
minHoursSlider.addEventListener('input', e => setMinHours(e.target.value));
maxHoursInput.addEventListener('change', e => setMaxHours(e.target.value));
maxHoursSlider.addEventListener('input', e => setMaxHours(e.target.value));


// Sliders (distance)

const minDistInput = document.getElementById('mid');
const maxDistInput = document.getElementById('mad');
const minDistSlider = document.getElementById('mids');
const maxDistSlider = document.getElementById('mads');

function setMinDistance(v) {
		const maxV = +maxDistInput.value;
		const clamped = Math.max(10, Math.min(maxV - 10, +v));
		minDistInput.value = minDistSlider.value = clamped;
}

function setMaxDistance(v) {
		const minV = +minDistInput.value;
		const clamped = Math.min(5000, Math.max(minV + 10, +v));
		maxDistInput.value = maxDistSlider.value = clamped;
}

minDistInput.addEventListener('change', e => setMinDistance(e.target.value));
minDistSlider.addEventListener('input', e => setMinDistance(e.target.value));
maxDistInput.addEventListener('change', e => setMaxDistance(e.target.value));
maxDistSlider.addEventListener('input', e => setMaxDistance(e.target.value));


// Time / distance toggle

document.getElementById('dtg').addEventListener('change', function () {
		useDist = this.checked;

		document.getElementById('tp').style.display = useDist ? 'none' : 'flex';
		document.getElementById('dp').style.display = useDist ? 'flex' : 'none';

		document.getElementById('lt').style.cssText = useDist
				? 'color:var(--mt)'
				: 'font-weight:600;color:var(--tx)';

		document.getElementById('ld').style.cssText = useDist
				? 'font-weight:600;color:var(--tx)'
				: 'color:var(--mt)';

		clearOverlay();
});

document.getElementById('tp').style.display = 'flex';
document.getElementById('dp').style.display = 'none';


// Visibility toggles

document.getElementById('show-grid').addEventListener('change', function () {
		gridMarkers.forEach(m => (this.checked ? map.addLayer(m) : map.removeLayer(m)));
});

document.getElementById('show-pts').addEventListener('change', function () {
		endpointMarkers.forEach(m => (this.checked ? map.addLayer(m) : map.removeLayer(m)));
});


// Geocoding

const locEl = document.getElementById('loc');
const sugEl = document.getElementById('sug');

locEl.addEventListener('input', () => {
		clearTimeout(searchTimer);

		const q = locEl.value.trim();
		if (q.length < C.GEOCODE_MIN_QUERY_LENGTH) {
				hideSug();
				return;
		}

		if (q === lastQuery) return;

		searchTimer = setTimeout(() => {
				lastQuery = q;
				doSearch(q);
		}, C.GEOCODE_DEBOUNCE_MS);
});

locEl.addEventListener('keydown', e => {
		if (e.key === 'Escape') hideSug();
});

document.addEventListener('click', e => {
		if (!e.target.closest('#lw')) hideSug();
});

function hideSug() {
		sugEl.style.display = 'none';
		sugEl.innerHTML = '';
}

async function doSearch(q) {
		try {
				const url = `${C.NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(q)}&limit=${C.GEOCODE_MAX_RESULTS}&addressdetails=1`;
				const data = await fetch(url, {
						headers: C.NOMINATIM_HEADERS
				}).then(r => r.json());

				if (locEl.value.trim() !== q) return;

				renderSug(data);
		} catch {
				hideSug();
		}
}

function renderSug(results) {
		sugEl.innerHTML = '';
		if (!results.length) {
				hideSug();
				return;
		}

		results.slice(0, C.GEOCODE_MAX_RESULTS).forEach(r => {
				const d = document.createElement('div');
				d.className = 'si';

				const parts = r.display_name.split(', ');
				const main = esc(parts.slice(0, 2).join(', '));
				const sub = parts.length > 2 ? esc(parts.slice(2).join(', ')) : '';

				d.innerHTML = `<div class="sm">${main}</div>${sub ? `<div class="ss">${sub}</div>` : ''}`;

				d.addEventListener('click', () => {
						locEl.value = r.display_name;
						lastQuery = r.display_name;
						hideSug();

						placePin(+r.lat, +r.lon);
						map.setView([+r.lat, +r.lon], C.MAP_GEOCODE_ZOOM);
						applyAddress(+r.lat, +r.lon);
				});

				sugEl.appendChild(d);
		});

		sugEl.style.display = 'block';
}

function esc(s) {
		return s
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
}


// Map click and reverse geocode

map.on('click', async e => {
		const { lat, lng } = e.latlng;

		placePin(lat, lng);

		locEl.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
		lastQuery = locEl.value;

		hideSug();

		try {
				const url = `${C.NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${C.REVERSE_GEOCODE_ZOOM}&addressdetails=1`;
				const d = await fetch(url, {
						headers: {
								'Accept-Language': 'en',
								'User-Agent': 'RangeFinderApp/1.0'
						}
				}).then(r => r.json());

				if (!d?.lat) return;

				const dist = turf.distance(
						turf.point([lng, lat]),
						turf.point([+d.lon, +d.lat]),
						{ units: 'meters' }
				);

				if (dist <= C.REVERSE_GEOCODE_MAX_DISTANCE_M && d.display_name) {
						locEl.value = d.display_name;
						lastQuery = d.display_name;
				}

				applyAddress(lat, lng);
		} catch {}
});

function applyAddress(lat, lng) {
		const country = countryAt(lat, lng);
		showCtx(country, country ? country.terrain : null);
}


// Pin

function placePin(lat, lng) {
		coords = { lat, lng };

		if (pin) map.removeLayer(pin);

		pin = L.marker([lat, lng]).addTo(map);
		clearOverlay();
}


// Calculation: Travel Distance

document.getElementById('calc').addEventListener('click', () => {
		if (!coords) {
				alert('Please select a starting location first.');
				return;
		}

		if (worker) {
				worker.terminate();
				worker = null;
		}

		const speedKmh = C.MODE_SPEED_KMH[activeModeKey];
		const modeTau = C.MODE_TORTUOSITY[activeModeKey];
		const terrTau = C.TERRAIN_TORTUOSITY[document.getElementById('ctx-terrain').value];
		const totalTau = modeTau * terrTau;
		const effSpeedKmh = speedKmh / totalTau;

		let outerKm;
		let innerKm;
		let legOTxt;
		let legITxt;

		if (!useDist) {
				const minH = +minHoursInput.value;
				const maxH = +maxHoursInput.value;

				outerKm = effSpeedKmh * maxH;
				innerKm = effSpeedKmh * minH;

				legOTxt = `Outer: ~${fmt(outerKm)} km (${maxH} hr)`;
				legITxt = `Inner: ~${fmt(innerKm)} km (${minH} hr)`;
		} else {
				const minD = +minDistInput.value;
				const maxD = +maxDistInput.value;

				outerKm = maxD / totalTau;
				innerKm = minD / totalTau;

				legOTxt = `Outer: ~${fmt(outerKm)} km (${maxD} km road)`;
				legITxt = `Inner: ~${fmt(innerKm)} km (${minD} km road)`;
		}

		const meta = {
				effSpeedKmh,
				totalTau,
				speedKmh,
				modeTau,
				terrTau,
				outerKm,
				innerKm
		};

		clearOverlay(false);

		const calcBtn = document.getElementById('calc');
		const statusArea = document.getElementById('status-area');

		calcBtn.disabled = true;
		statusArea.classList.add('vis');
		setStatus('Initialising…', 0);

		worker = new Worker('range-worker.js');

		function finishCalc() {
				worker = null;
				statusArea.classList.remove('vis');
				calcBtn.disabled = false;
		}

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
								finishCalc();
								renderResults(msg, meta, legOTxt, legITxt);
								break;

						case 'error':
								finishCalc();
								alert(`Error: ${msg.msg}`);
								break;
				}
		};

		worker.onerror = function (e) {
				finishCalc();
				alert(`Worker error: ${e.message}`);
		};

		worker.postMessage({
				clat: coords.lat,
				clng: coords.lng,
				outerKm,
				innerKm
		});
});

function setStatus(msg, pct) {
		document.getElementById('status-msg').textContent = msg;

		if (pct !== null) {
				document.getElementById('progress-bar').style.width = pct + '%';
		}
}


// Render: land grid

function renderGrid(pts) {
		gridMarkers.forEach(m => map.removeLayer(m));
		gridMarkers = [];

		const showGrid = document.getElementById('show-grid').checked;

		pts.forEach(p => {
				const crossing = p.cell === C.CELL_CROSSING;
				const colour = crossing ? '#e08020' : '#28a050';

				const m = L.circleMarker([p.lat, p.lng], {
						renderer: canvasRenderer,
						radius: crossing ? C.GRID_DOT_RADIUS + 1 : C.GRID_DOT_RADIUS,
						color: colour,
						fillColor: colour,
						fillOpacity: 0.55,
						weight: 0
				});

				if (showGrid) m.addTo(map);

				gridMarkers.push(m);
		});
}


// Render: polygons + endpoint markers

function renderResults(workerResult, meta, legOTxt, legITxt) {
		const { outerRing, innerRing, outerGeo, innerGeo } = workerResult;

		const outerLayer = L.geoJSON(outerGeo, {
				style: {
						color: '#0078a8',
						weight: 2,
						opacity: 0.8,
						fillColor: '#0096cc',
						fillOpacity: 0.18
				}
		}).addTo(map);

		const innerLayer = L.geoJSON(innerGeo, {
				style: {
						color: '#0078a8',
						weight: 1.5,
						opacity: 0.6,
						dashArray: '5 5',
						fillColor: '#f0ede8',
						fillOpacity: 0.82
				}
		}).addTo(map);

		mapLayers.push(outerLayer, innerLayer);

		endpointMarkers.forEach(m => map.removeLayer(m));
		endpointMarkers = [];

		const showPts = document.getElementById('show-pts').checked;

		outerRing.forEach(([lng, lat], idx) => {
				const icon = L.divIcon({
						className: '',
						html: `<div class="ep-marker">${idx + 1}</div>`,
						iconSize: [18, 18],
						iconAnchor: [9, 9]
				});

				const marker = L.marker([lat, lng], { icon, zIndexOffset: 100 });

				if (showPts) marker.addTo(map);

				endpointMarkers.push(marker);
		});

		map.fitBounds(outerLayer.getBounds(), { padding: [C.MAP_FIT_PADDING_PX, C.MAP_FIT_PADDING_PX] });

		const terrainKey = document.getElementById('ctx-terrain').value;
		const ic = document.getElementById('ic');

		ic.style.display = 'block';
		ic.innerHTML = `
				<div class="icr">~${fmt(meta.outerKm)} km</div> outer crow-flies radius
				<div class="ics">
						<b>Speed:</b> ${meta.speedKmh} km/h ÷ ${meta.totalTau.toFixed(2)} = ${meta.effSpeedKmh.toFixed(1)} km/h effective<br>
						<b>τ_mode</b> ${meta.modeTau} × <b>τ_terrain</b> ${C.TERRAIN_TORTUOSITY[terrainKey].toFixed(2)} = ${meta.totalTau.toFixed(2)}<br>
						<b>Shape:</b> ${C.VECTOR_COUNT} vectors · ${C.VECTOR_STEP_DEG}° apart · max redirect ${C.REDIRECT_ANGLE_MAX}°<br>
						Inner radius: ~${fmt(meta.innerKm)} km
				</div>`;

		document.getElementById('lo-lbl').textContent = legOTxt;
		document.getElementById('in-lbl').textContent = legITxt;

		document.getElementById('leg').classList.add('vis');
		document.getElementById('clr').style.display = 'block';
}


// Clear

function clearOverlay(resetUI = true) {
		if (worker) {
				worker.terminate();
				worker = null;
		}

		mapLayers.forEach(l => map.removeLayer(l));
		mapLayers = [];

		gridMarkers.forEach(m => map.removeLayer(m));
		gridMarkers = [];

		endpointMarkers.forEach(m => map.removeLayer(m));
		endpointMarkers = [];

		if (resetUI) {
				document.getElementById('ic').style.display = 'none';
				document.getElementById('leg').classList.remove('vis');
				document.getElementById('clr').style.display = 'none';
				document.getElementById('status-area').classList.remove('vis');
				document.getElementById('calc').disabled = false;
		}
}

document.getElementById('clr').addEventListener('click', () => {
		clearOverlay(true);
});


// Utility

function fmt(n) {
		return Math.round(n).toLocaleString();
}
