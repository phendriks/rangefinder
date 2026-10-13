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
	schedulePreparation(true);
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
	schedulePreparation(true);
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

function placePin(lat, lng)
{
	coords = { lat, lng };
	if (pin) map.removeLayer(pin);
	pin = L.marker([lat, lng]).addTo(map);
	clearOverlay();
	schedulePreparation(true);
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
		if (!result?.lat || coords?.lat !== lat || coords?.lng !== lng) return;

		const reverseDistanceM = turf.distance(
			turf.point([lng, lat]),
			turf.point([+result.lon, +result.lat]),
			{ units: 'meters' }
		);
		if (reverseDistanceM <= C.REVERSE_GEOCODE_MAX_DISTANCE_M && result.display_name) {
			ELS.location.value = result.display_name;
			lastQuery = result.display_name;
		}

	} catch {}
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
			activeCalculation = null;
			setCalcBusyState(false);
			renderResults(msg, outerLegendLabel, innerLegendLabel);
			break;
		case 'error':
			activeCalculation = null;
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

	const rangeRequest = getRangeRequest();
	clearOverlay(false);
	setCalcBusyState(true);
	setStatus('Initialising...', 0);

	submitCalculation(rangeRequest);
}

MODE_BUTTONS.forEach(button => {
	button.addEventListener('click', () => setMode(button.dataset.mode));
});
setMode(activeModeKey);

bindRangeControls();

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

ELS.useLocation.addEventListener('click', () => {
	if (!navigator.geolocation) {
		alert('Location is unavailable. Select an address or tap the map.');
		return;
	}
	ELS.useLocation.disabled = true;
	ELS.useLocation.textContent = 'Locating...';
	const previousCoords = coords;
	function finishLocating() {
		ELS.useLocation.disabled = false;
		ELS.useLocation.textContent = 'Use my location';
	}
	navigator.geolocation.getCurrentPosition(position => {
		finishLocating();
		// A map click or address selection while locating takes precedence.
		if (coords !== previousCoords) return;
		const { latitude: lat, longitude: lng } = position.coords;
		map.setView([lat, lng], C.MAP_GEOCODE_ZOOM);
		handleMapClick({ latlng: { lat, lng } });
	}, () => {
		finishLocating();
		alert('Could not get your location. Select an address or tap the map.');
	}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
});

// Warming does not require a location or a geolocation permission prompt.
if (typeof requestIdleCallback === 'function') requestIdleCallback(warmRangeWorker, { timeout: 1500 });
else setTimeout(warmRangeWorker, 200);
