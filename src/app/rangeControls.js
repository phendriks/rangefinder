// One definition of each range, used by sidebar inputs and mobile controls.
const RANGE_CONTROLS = {
	time: {
		minInput: ELS.minTimeInput, maxInput: ELS.maxTimeInput,
		minSlider: ELS.minTimeSlider, maxSlider: ELS.maxTimeSlider,
		min: C.UI_TIME_MIN_HOURS, max: C.UI_TIME_MAX_HOURS, step: C.UI_TIME_STEP_HOURS,
		defaultMin: C.UI_TIME_DEFAULT_MIN_HOURS, defaultMax: C.UI_TIME_DEFAULT_MAX_HOURS,
		unit: 'hr'
	},
	distance: {
		minInput: ELS.minDistanceInput, maxInput: ELS.maxDistanceInput,
		minSlider: ELS.minDistanceSlider, maxSlider: ELS.maxDistanceSlider,
		min: C.UI_DIST_MIN_KM, max: C.UI_DIST_MAX_KM, step: C.UI_DIST_STEP_KM,
		defaultMin: C.UI_DIST_DEFAULT_MIN_KM, defaultMax: C.UI_DIST_DEFAULT_MAX_KM,
		unit: 'km'
	}
};

function getRangeControls(useDistance = ELS.distanceToggle.checked) {
	return RANGE_CONTROLS[useDistance ? 'distance' : 'time'];
}

function setRangeValue(measure, bound, nextValue) {
	const controls = RANGE_CONTROLS[measure];
	const minimum = bound === 'min' ? controls.min : +controls.minInput.value + controls.step;
	const maximum = bound === 'max' ? controls.max : +controls.maxInput.value - controls.step;
	const value = clampNumber(+nextValue, minimum, maximum);
	controls[bound + 'Input'].value = value;
	controls[bound + 'Slider'].value = value;
	schedulePreparation();
}

function bindRangeControls() {
	for (const [measure, controls] of Object.entries(RANGE_CONTROLS)) {
		for (const bound of ['min', 'max']) {
			controls[bound + 'Input'].addEventListener('change', event => setRangeValue(measure, bound, event.target.value));
			controls[bound + 'Slider'].addEventListener('input', event => setRangeValue(measure, bound, event.target.value));
		}
	}
}

for (const controls of Object.values(RANGE_CONTROLS)) {
	for (const bound of ['min', 'max']) {
		for (const kind of ['Input', 'Slider']) {
			const element = controls[bound + kind];
			element.min = controls.min;
			element.max = controls.max;
			element.step = controls.step;
			element.value = controls[bound === 'min' ? 'defaultMin' : 'defaultMax'];
		}
	}
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
