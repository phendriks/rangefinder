function isDebugEnabled() {
	const dbg = document.getElementById('dbg');
	return !!(dbg && dbg.checked);
}

function applyDebugVisibility() {
	const show = isDebugEnabled();
	const ctx = document.getElementById('ctx');
	const ic = document.getElementById('ic');

	if (ctx) {
		if (show && ctx.dataset.ready === '1') {
			ctx.classList.add('vis');
		} else {
			ctx.classList.remove('vis');
		}
	}

	if (ic) {
		const hasContent = ic.innerHTML && ic.innerHTML.trim().length;
		ic.style.display = show && hasContent ? 'block' : 'none';
	}
}

;


// Mode buttons

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


// Context panel

document.getElementById('ctx-terrain').addEventListener('change', () => {updateTable();clearOverlay();});

function updateTable() {
	const speed= C.MODE_SPEED_KMH[activeModeKey];
	const modeTau= C.MODE_TORTUOSITY[activeModeKey];
	const terrTau= C.TERRAIN_TORTUOSITY[document.getElementById('ctx-terrain').value];
	const total= +(modeTau * terrTau).toFixed(3);
	const effSpd = +(speed / total).toFixed(1);

	document.getElementById('ft-m').textContent = modeTau.toFixed(2);
	document.getElementById('ft-t').textContent = terrTau.toFixed(2);
	document.getElementById('ft-tot').textContent = total.toFixed(2);
	document.getElementById('ft-spd').textContent = effSpd + ' km/h';
}

function showCtx(country, terrainOverride) {
	lastCtxCountry = country || null;
	lastCtxTerrain = terrainOverride || null;

	const ctxEl = document.getElementById('ctx');
	if (!ctxEl) return;
	ctxEl.dataset.ready = '1';

	if (country) {
		document.getElementById('ctx-country').textContent = country.name;
		document.getElementById('ctx-limit').textContent = `max ${country.highway} km/h`;
	} else {
		document.getElementById('ctx-country').textContent = '—';
		document.getElementById('ctx-limit').textContent = '';
	}

	if (terrainOverride) document.getElementById('ctx-terrain').value = terrainOverride;
	updateTable();
	applyDebugVisibility();
}


const dbgEl = document.getElementById('dbg');
if (dbgEl) dbgEl.addEventListener('change', applyDebugVisibility);
applyDebugVisibility();


// Sliders (time)

const mih = document.getElementById('mih'), mah = document.getElementById('mah');
const mis = document.getElementById('mis'), mas = document.getElementById('mas');

function sMin(v) { v = Math.max(0.5, Math.min(+mah.value - 0.5, +v)); mih.value = mis.value = v; }
function sMax(v) { v = Math.min(24,Math.max(+mih.value + 0.5, +v)); mah.value = mas.value = v; }

mih.addEventListener('change', e => sMin(e.target.value));
mis.addEventListener('input',e => sMin(e.target.value));
mah.addEventListener('change', e => sMax(e.target.value));
mas.addEventListener('input',e => sMax(e.target.value));


// Sliders (distance)

const mid= document.getElementById('mid'),mad= document.getElementById('mad');
const mids = document.getElementById('mids'), mads = document.getElementById('mads');

function sdMin(v) { v = Math.max(10, Math.min(+mad.value - 10, +v)); mid.value = mids.value = v; }
function sdMax(v) { v = Math.min(5000, Math.max(+mid.value + 10, +v)); mad.value = mads.value = v; }

mid.addEventListener('change',e => sdMin(e.target.value));
mids.addEventListener('input',e => sdMin(e.target.value));
mad.addEventListener('change',e => sdMax(e.target.value));
mads.addEventListener('input',e => sdMax(e.target.value));


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
	gridMarkers.forEach(m => this.checked ? map.addLayer(m) : map.removeLayer(m));
});

document.getElementById('show-pts').addEventListener('change', function () {
	epMarkers.forEach(m => this.checked ? map.addLayer(m) : map.removeLayer(m));
});


// Geocoding

const locEl = document.getElementById('loc');
const sugEl = document.getElementById('sug');

locEl.addEventListener('input', () => {
	clearTimeout(searchTimer);
	const q = locEl.value.trim();
	if (q.length < C.GEOCODE_MIN_QUERY_LENGTH) { hideSug(); return; }
	if (q === lastQuery) return;
	searchTimer = setTimeout(() => { lastQuery = q; doSearch(q); }, C.GEOCODE_DEBOUNCE_MS);
});

locEl.addEventListener('keydown', e => { if (e.key === 'Escape') hideSug(); });
document.addEventListener('click', e => { if (!e.target.closest('#lw')) hideSug(); });

function hideSug() { sugEl.style.display = 'none'; sugEl.innerHTML = ''; }

async function doSearch(q) {
	try {
		const url= `${C.NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(q)}&limit=${C.GEOCODE_MAX_RESULTS}&addressdetails=1`;
		const data = await fetch(url, {
			headers: C.NOMINATIM_HEADERS
		}).then(r => r.json());

		if (locEl.value.trim() !== q) return;
		renderSug(data);
	} catch { hideSug(); }
}

function renderSug(results) {
	sugEl.innerHTML = '';
	if (!results.length) { hideSug(); return; }

	results.slice(0, C.GEOCODE_MAX_RESULTS).forEach(r => {
		const d = document.createElement('div');
		d.className = 'si';
		const parts = r.display_name.split(', ');
		const main= esc(parts.slice(0, 2).join(', '));
		const sub = parts.length > 2 ? esc(parts.slice(2).join(', ')) : '';
		d.innerHTML = `<div class="sm">${main}</div>${sub ? `<div class="ss">${sub}</div>` : ''}`;

		d.addEventListener('click', () => {
			locEl.value = r.display_name; lastQuery = r.display_name; hideSug();
			placePin(+r.lat, +r.lon);
			map.setView([+r.lat, +r.lon], C.MAP_GEOCODE_ZOOM);
			applyAddress(+r.lat, +r.lon);
		});

		sugEl.appendChild(d);
	});

	sugEl.style.display = 'block';
}

function esc(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// Map click and reverse geocode

map.on('click', async e => {
	const { lat, lng } = e.latlng;
	placePin(lat, lng);
	locEl.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; lastQuery = locEl.value;
	hideSug();

	try {
		const url = `${C.NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${C.REVERSE_GEOCODE_ZOOM}&addressdetails=1`;
		const d = await fetch(url, {
			headers: C.NOMINATIM_HEADERS
		}).then(r => r.json());

		if (!d?.lat) return;

		const dist = turf.distance(turf.point([lng, lat]), turf.point([+d.lon, +d.lat]), { units: 'meters' });
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


// Pin

function placePin(lat, lng) {
	coords = { lat, lng };
	if (pin) map.removeLayer(pin);
	pin = L.marker([lat, lng]).addTo(map);
	clearOverlay();
}


// Calculation: Travel Distance

document.getElementById('calc').addEventListener('click', () => {
	if (!coords) { alert('Please select a starting location first.'); return; }

	if (worker) { worker.terminate(); worker = null; }

	const speed = C.MODE_SPEED_KMH[activeModeKey];
	const modeTau = C.MODE_TORTUOSITY[activeModeKey];
	const terrTau = C.TERRAIN_TORTUOSITY[document.getElementById('ctx-terrain').value];
	const total = modeTau * terrTau;
	const effSpd= speed / total;

	let outerKm, innerKm, legOTxt, legITxt;

	if (!useDist) {
		const minH = +mih.value, maxH = +mah.value;
		outerKm= effSpd * maxH;
		innerKm= effSpd * minH;
		legOTxt= `Outer: ~${fmt(outerKm)} km (${maxH} hr)`;
		legITxt= `Inner: ~${fmt(innerKm)} km (${minH} hr)`;
	} else {
		const minD = +mid.value, maxD = +mad.value;
		outerKm= maxD / total;
		innerKm= minD / total;
		legOTxt= `Outer: ~${fmt(outerKm)} km (${maxD} km road)`;
		legITxt= `Inner: ~${fmt(innerKm)} km (${minD} km road)`;
	}

	const meta = { effSpd, total, speed, modeTau, terrTau, outerKm, innerKm };

	clearOverlay(false);

	const calcBtn = document.getElementById('calc');
	const statusArea = document.getElementById('status-area');

	calcBtn.disabled = true;
	statusArea.classList.add('vis');
	setStatus('Initialising…', 0);

	worker = new Worker('../src/worker/range-worker.js');

	function finishCalc() {
		worker = null;
		statusArea.classList.remove('vis');
		calcBtn.disabled = false;
	}

	worker.onmessage = function (evt) {
		const msg = evt.data;
		switch (msg.type) {
			case 'status': setStatus(msg.msg, null); break;
			case 'progress': setStatus(`Walking vectors… ${msg.pct}%`, msg.pct); break;
			case 'grid': renderGrid(msg.pts); break;
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

	worker.postMessage({ clat: coords.lat, clng: coords.lng, outerKm, innerKm });
});

function setStatus(msg, pct) {
	document.getElementById('status-msg').textContent = msg;
	if (pct !== null) document.getElementById('progress-bar').style.width = pct + '%';
}


// Render: land grid
