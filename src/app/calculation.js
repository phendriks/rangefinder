// Keep preparation and explicit calculations in the same persistent worker.
let calculationSequence = 0;
let activeCalculation = null;
let preparationTimer = null;

function ensureRangeWorker() {
	if (worker) return worker;
	const createdWorker = new Worker('./src/worker/rangeWorker.js');
	worker = createdWorker;
	worker.onmessage = event => {
		if (!activeCalculation || event.data.requestId !== activeCalculation.requestId) return;
		handleWorkerMessage(event, activeCalculation.outerLegendLabel, activeCalculation.innerLegendLabel);
	};
	worker.onerror = event => {
		if (worker !== createdWorker) return;
		const wasCalculating = Boolean(activeCalculation);
		worker.terminate();
		worker = null;
		activeCalculation = null;
		if (wasCalculating) {
			setCalcBusyState(false);
			alert(`Worker error: ${event.message}`);
		}
	};
	const lowMemory = isMobile() || (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
		Boolean(navigator.connection?.saveData);
	worker.postMessage({ type: 'warm', lowMemory });
	return worker;
}

function cancelCalculation() {
	clearTimeout(preparationTimer);
	preparationTimer = null;
	activeCalculation = null;
	if (worker) worker.postMessage({ type: 'cancel' });
}

function schedulePreparation(immediate = false) {
	clearTimeout(preparationTimer);
	preparationTimer = null;
	if (!coords) return;
	function prepare() {
		preparationTimer = null;
		const range = getRangeRequest();
		if (!Number.isFinite(range.outerKm) || range.outerKm <= 0) return;
		try {
			ensureRangeWorker().postMessage({
				type: 'prepare', requestId: ++calculationSequence,
				clat: coords.lat, clng: coords.lng, modeKey: activeModeKey,
				outerKm: range.outerKm, innerKm: range.innerKm
			});
		} catch {
			// Preparation is optional; Show can retry worker startup.
		}
	}
	if (immediate) prepare();
	else preparationTimer = setTimeout(prepare, C.PREPARE_DEBOUNCE_MS);
}

function submitCalculation(range) {
	clearTimeout(preparationTimer);
	preparationTimer = null;
	activeCalculation = { ...range, requestId: ++calculationSequence };
	try {
		ensureRangeWorker().postMessage({
			type: 'calculate', requestId: activeCalculation.requestId,
			clat: coords.lat, clng: coords.lng, modeKey: activeModeKey,
			outerKm: range.outerKm, innerKm: range.innerKm
		});
	} catch (error) {
		activeCalculation = null;
		setCalcBusyState(false);
		alert(`Worker error: ${error.message}`);
	}
}

function warmRangeWorker() {
	try { ensureRangeWorker(); } catch { /* Retry when a location is selected. */ }
}
