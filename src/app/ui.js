const ELS = {
	calc: document.getElementById('calc'),
	clear: document.getElementById('clr'),
	distanceLabel: document.getElementById('ld'),
	distancePanel: document.getElementById('dp'),
	distanceToggle: document.getElementById('dtg'),
	legend: document.getElementById('leg'),
	location: document.getElementById('loc'),
	locationWrap: document.getElementById('lw'),
	maxDistanceInput: document.getElementById('mad'),
	maxDistanceSlider: document.getElementById('mads'),
	maxTimeInput: document.getElementById('mah'),
	maxTimeSlider: document.getElementById('mas'),
	minDistanceInput: document.getElementById('mid'),
	minDistanceSlider: document.getElementById('mids'),
	minTimeInput: document.getElementById('mih'),
	minTimeSlider: document.getElementById('mis'),
	modeNote: document.getElementById('sn'),
	progressBar: document.getElementById('progress-bar'),
	showGrid: document.getElementById('show-grid'),
	statusArea: document.getElementById('status-area'),
	statusMsg: document.getElementById('status-msg'),
	suggestions: document.getElementById('sug'),
	timeLabel: document.getElementById('lt'),
	timePanel: document.getElementById('tp')
};

const MODE_BUTTONS = Array.from(document.querySelectorAll('.mb'));
const ACTIVE_MEASURE_LABEL_CLASS = 'measure-label-active';
const MUTED_MEASURE_LABEL_CLASS = 'measure-label-muted';

function setMode(modeKey)
{
	MODE_BUTTONS.forEach(button => {
		button.classList.toggle('active', button.dataset.mode === modeKey);
	});
	activeModeKey = modeKey;
	ELS.modeNote.textContent = C.MODE_NOTE[modeKey] || '';
	clearOverlay();
}

function syncRangePair(nextValue, minValue, maxValue, inputEl, sliderEl)
{
	const safeValue = Math.max(minValue, Math.min(maxValue, +nextValue));
	inputEl.value = safeValue;
	sliderEl.value = safeValue;
}

function setTimeMin(nextValue)
{
	const maxAllowed = +ELS.maxTimeInput.value - C.UI_TIME_STEP_HOURS;
	syncRangePair(nextValue, C.UI_TIME_MIN_HOURS, maxAllowed, ELS.minTimeInput, ELS.minTimeSlider);
}

function setTimeMax(nextValue)
{
	const minAllowed = +ELS.minTimeInput.value + C.UI_TIME_STEP_HOURS;
	syncRangePair(nextValue, minAllowed, C.UI_TIME_MAX_HOURS, ELS.maxTimeInput, ELS.maxTimeSlider);
}

function setDistanceMin(nextValue)
{
	const maxAllowed = +ELS.maxDistanceInput.value - C.UI_DIST_STEP_KM;
	syncRangePair(nextValue, C.UI_DIST_MIN_KM, maxAllowed, ELS.minDistanceInput, ELS.minDistanceSlider);
}

function setDistanceMax(nextValue)
{
	const minAllowed = +ELS.minDistanceInput.value + C.UI_DIST_STEP_KM;
	syncRangePair(nextValue, minAllowed, C.UI_DIST_MAX_KM, ELS.maxDistanceInput, ELS.maxDistanceSlider);
}

function setMeasureLabelState(activeEl, mutedEl)
{
	activeEl.classList.add(ACTIVE_MEASURE_LABEL_CLASS);
	activeEl.classList.remove(MUTED_MEASURE_LABEL_CLASS);
	mutedEl.classList.add(MUTED_MEASURE_LABEL_CLASS);
	mutedEl.classList.remove(ACTIVE_MEASURE_LABEL_CLASS);
}

function updateMeasureMode()
{
	useDist = ELS.distanceToggle.checked;
	ELS.timePanel.style.display = useDist ? 'none' : 'flex';
	ELS.distancePanel.style.display = useDist ? 'flex' : 'none';

	if (useDist) {
		setMeasureLabelState(ELS.distanceLabel, ELS.timeLabel);
	} else {
		setMeasureLabelState(ELS.timeLabel, ELS.distanceLabel);
	}

	clearOverlay();
}

function stopActiveWorker()
{
	if (!worker) return;
	worker.terminate();
	worker = null;
}

function showSuggestions()
{
	ELS.suggestions.style.display = 'block';
}

function hideSuggestions()
{
	ELS.suggestions.style.display = 'none';
	ELS.suggestions.innerHTML = '';
}

function escapeHtml(value)
{
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setStatus(message, pct)
{
	ELS.statusMsg.textContent = message;
	if (pct !== null) ELS.progressBar.style.width = pct + '%';
}

function setCalcBusyState(isBusy)
{
	ELS.calc.disabled = isBusy;
	ELS.statusArea.classList.toggle('vis', isBusy);
	if (!isBusy) ELS.progressBar.style.width = '0%';
}

function applyAddress(lat, lng)
{
	placePin(lat, lng);
}

function placePin(lat, lng)
{
	coords = { lat, lng };
	if (pin) map.removeLayer(pin);
	pin = L.marker([lat, lng]).addTo(map);
	clearOverlay();
}

async function doSearch(query)
{
	try {
		const url = `${C.NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(query)}&limit=${C.GEOCODE_MAX_RESULTS}&addressdetails=1`;
		const results = await fetch(url, {
			cache: 'no-store',
			headers: C.NOMINATIM_HEADERS
		}).then(response => response.json());

		if (ELS.location.value.trim() !== query) return;
		renderSuggestions(results);
	} catch {
		hideSuggestions();
	}
}

function renderSuggestions(results)
{
	ELS.suggestions.innerHTML = '';
	if (!results.length) {
		hideSuggestions();
		return;
	}

	results.slice(0, C.GEOCODE_MAX_RESULTS).forEach(result => {
		const suggestionEl = document.createElement('div');
		suggestionEl.className = 'si';
		const parts = result.display_name.split(', ');
		const mainLabel = escapeHtml(parts.slice(0, 2).join(', '));
		const subLabel = parts.length > 2 ? escapeHtml(parts.slice(2).join(', ')) : '';
		suggestionEl.innerHTML = `<div class="sm">${mainLabel}</div>${subLabel ? `<div class="ss">${subLabel}</div>` : ''}`;
		suggestionEl.addEventListener('click', () => {
			const lat = +result.lat;
			const lng = +result.lon;
			ELS.location.value = result.display_name;
			lastQuery = result.display_name;
			hideSuggestions();
			placePin(lat, lng);
			map.setView([lat, lng], C.MAP_GEOCODE_ZOOM);
			applyAddress(lat, lng);
		});
		ELS.suggestions.appendChild(suggestionEl);
	});

	showSuggestions();
}

async function handleMapClick(evt)
{
	const { lat, lng } = evt.latlng;
	placePin(lat, lng);
	ELS.location.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
	lastQuery = ELS.location.value;
	hideSuggestions();

	try {
		const url = `${C.NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${C.REVERSE_GEOCODE_ZOOM}&addressdetails=1`;
		const result = await fetch(url, {
			cache: 'no-store',
			headers: C.NOMINATIM_HEADERS
		}).then(response => response.json());
		if (!result?.lat) return;

		const reverseDistanceM = turf.distance(
			turf.point([lng, lat]),
			turf.point([+result.lon, +result.lat]),
			{ units: 'meters' }
		);
		if (reverseDistanceM <= C.REVERSE_GEOCODE_MAX_DISTANCE_M && result.display_name) {
			ELS.location.value = result.display_name;
			lastQuery = result.display_name;
		}

		applyAddress(lat, lng);
	} catch {}
}

function getRangeRequest()
{
	const baseSpeedKmh = C.MODE_SPEED_KMH[activeModeKey];
	const modeTau = C.MODE_TORTUOSITY[activeModeKey];
	const terrainTau = C.TERRAIN_TAU_DEFAULT;
	const totalTau = modeTau * terrainTau;
	const effectiveSpeedKmh = baseSpeedKmh / totalTau;

	if (!useDist) {
		const minHours = +ELS.minTimeInput.value;
		const maxHours = +ELS.maxTimeInput.value;
		return {
			outerKm: effectiveSpeedKmh * maxHours,
			innerKm: effectiveSpeedKmh * minHours,
			outerLegendLabel: `Outer: ~${fmt(effectiveSpeedKmh * maxHours)} km (${maxHours} hr)`,
			innerLegendLabel: `Inner: ~${fmt(effectiveSpeedKmh * minHours)} km (${minHours} hr)`
		};
	}

	const minDistanceKm = +ELS.minDistanceInput.value;
	const maxDistanceKm = +ELS.maxDistanceInput.value;
	return {
		outerKm: maxDistanceKm / totalTau,
		innerKm: minDistanceKm / totalTau,
		outerLegendLabel: `Outer: ~${fmt(maxDistanceKm / totalTau)} km (${maxDistanceKm} km road)`,
		innerLegendLabel: `Inner: ~${fmt(minDistanceKm / totalTau)} km (${minDistanceKm} km road)`
	};
}

function handleWorkerMessage(evt, outerLegendLabel, innerLegendLabel)
{
	const msg = evt.data;
	switch (msg.type) {
		case 'status':
			setStatus(msg.msg, null);
			break;
		case 'progress':
			setStatus(`Walking vectors... ${msg.pct}%`, msg.pct);
			break;
		case 'grid':
			renderGrid(msg.pts);
			break;
		case 'done':
			stopActiveWorker();
			setCalcBusyState(false);
			renderResults(msg, outerLegendLabel, innerLegendLabel);
			break;
		case 'error':
			stopActiveWorker();
			setCalcBusyState(false);
			alert(`Error: ${msg.msg}`);
			break;
	}
}

function startCalculation()
{
	if (!coords) {
		alert('Please select a starting location first.');
		return;
	}

	stopActiveWorker();

	const rangeRequest = getRangeRequest();
	clearOverlay(false);
	setCalcBusyState(true);
	setStatus('Initialising...', 0);

	worker = new Worker('./src/worker/rangeWorker.js');
	worker.onmessage = evt => handleWorkerMessage(evt, rangeRequest.outerLegendLabel, rangeRequest.innerLegendLabel);
	worker.onerror = evt => {
		stopActiveWorker();
		setCalcBusyState(false);
		alert(`Worker error: ${evt.message}`);
	};
	worker.postMessage({
		clat: coords.lat,
		clng: coords.lng,
		outerKm: rangeRequest.outerKm,
		innerKm: rangeRequest.innerKm
	});
}

MODE_BUTTONS.forEach(button => {
	button.addEventListener('click', () => setMode(button.dataset.mode));
});
setMode(activeModeKey);

ELS.minTimeInput.addEventListener('change', evt => setTimeMin(evt.target.value));
ELS.minTimeSlider.addEventListener('input', evt => setTimeMin(evt.target.value));
ELS.maxTimeInput.addEventListener('change', evt => setTimeMax(evt.target.value));
ELS.maxTimeSlider.addEventListener('input', evt => setTimeMax(evt.target.value));
ELS.minDistanceInput.addEventListener('change', evt => setDistanceMin(evt.target.value));
ELS.minDistanceSlider.addEventListener('input', evt => setDistanceMin(evt.target.value));
ELS.maxDistanceInput.addEventListener('change', evt => setDistanceMax(evt.target.value));
ELS.maxDistanceSlider.addEventListener('input', evt => setDistanceMax(evt.target.value));

ELS.distanceToggle.addEventListener('change', updateMeasureMode);
updateMeasureMode();

ELS.showGrid.addEventListener('change', function () {
	if (this.checked && (!gridMarkers || !gridMarkers.length) && Array.isArray(gridSourceData) && gridSourceData.length) {
		renderGrid(gridSourceData);
		return;
	}
	gridMarkers.forEach(marker => this.checked ? map.addLayer(marker) : map.removeLayer(marker));
	if (!this.checked) hidePointInspect();
});

ELS.location.addEventListener('input', () => {
	clearTimeout(searchTimer);
	const query = ELS.location.value.trim();
	if (query.length < C.GEOCODE_MIN_QUERY_LENGTH) {
		hideSuggestions();
		return;
	}
	if (query === lastQuery) return;
	searchTimer = setTimeout(() => {
		lastQuery = query;
		doSearch(query);
	}, C.GEOCODE_DEBOUNCE_MS);
});

ELS.location.addEventListener('keydown', evt => {
	if (evt.key === 'Escape') hideSuggestions();
});

document.addEventListener('click', evt => {
	if (!evt.target.closest('#lw')) hideSuggestions();
});

map.on('click', handleMapClick);
ELS.calc.addEventListener('click', startCalculation);
