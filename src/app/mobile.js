'use strict';

const MINIBAR_VISIBLE_CLASS = 'mini-bar-visible';
const MINI_HIDDEN_CLASS = 'mini-hidden';

(function () {
	const {
		sidebar, sheetTop, sheetSubtitle: subtitle, miniBar, miniExpand,
		miniMode, miniDistanceToggle, miniTimeLabel, miniDistanceLabel,
		miniMin, miniMax, miniUnit, miniCalc
	} = ELS;
	const body = document.body;
	if (!sidebar || !sheetTop || !subtitle) return;

	function isSheetCollapsed()
	{
		return sidebar.classList.contains('sheet-collapsed');
	}

	function hasMiniBar()
	{
		return !!(miniBar && miniExpand && miniMode && miniDistanceToggle && miniTimeLabel && miniDistanceLabel && miniMin && miniMax && miniUnit && miniCalc);
	}

	function updateSheetAria()
	{
		const collapsed = isSheetCollapsed();
		sheetTop.setAttribute('aria-expanded', String(!collapsed));
		subtitle.textContent = collapsed ? 'Tap to open controls' : 'Tap to close';
	}

	function invalidateMapAfterTransition()
	{
		setTimeout(function () {
			if (typeof map !== 'undefined' && map && map.invalidateSize) map.invalidateSize();
		}, C.SHEET_TRANSITION_MS);
	}

	function setSheetCollapsed(collapsed)
	{
		sidebar.classList.toggle('sheet-collapsed', collapsed);
		updateSheetAria();
		updateMiniBarVisibility();
		invalidateMapAfterTransition();
	}

	function setMiniBarHidden(hidden)
	{
		if (!hasMiniBar()) return;
		miniBar.classList.toggle(MINI_HIDDEN_CLASS, hidden);
		body.classList.toggle(MINIBAR_VISIBLE_CLASS, !hidden);
	}

	function dispatchInputEvent(el, eventName)
	{
		el.dispatchEvent(new Event(eventName, { bubbles: true }));
	}

	function setUnderlyingValue(el, value)
	{
		if (!el) return;
		el.value = value;
		dispatchInputEvent(el, 'input');
		dispatchInputEvent(el, 'change');
	}

	function setUnderlyingToggle(checked)
	{
		const distanceToggle = ELS.distanceToggle;
		if (!distanceToggle) return;
		distanceToggle.checked = checked;
		dispatchInputEvent(distanceToggle, 'change');
	}

	function getActiveModeKey()
	{
		const activeModeButton = MODE_BUTTONS.find(button => button.classList.contains('active'));
		return activeModeButton ? activeModeButton.dataset.mode : 'drive';
	}

	function syncMiniModeFromSidebar()
	{
		if (!hasMiniBar()) return;
		miniMode.value = getActiveModeKey();
	}

	function syncMiniToggleFromSidebar()
	{
		if (!hasMiniBar()) return;
		const distanceToggle = ELS.distanceToggle;
		const useDistance = !!(distanceToggle && distanceToggle.checked);
		miniDistanceToggle.checked = useDistance;
		miniTimeLabel.classList.toggle('mini-on', !useDistance);
		miniDistanceLabel.classList.toggle('mini-on', useDistance);
	}

	function syncMiniRangeFromSidebar()
	{
		if (!hasMiniBar()) return;
		const controls = getRangeControls();
		miniUnit.textContent = controls.unit;
		if (document.activeElement !== miniMin) miniMin.value = controls.minInput.value;
		if (document.activeElement !== miniMax) miniMax.value = controls.maxInput.value;
		miniMin.step = controls.minInput.value ? controls.minInput.step : String(controls.step);
		miniMax.step = controls.maxInput.value ? controls.maxInput.step : String(controls.step);
	}

	function syncMiniBarFromSidebar()
	{
		if (!hasMiniBar()) return;
		syncMiniModeFromSidebar();
		syncMiniToggleFromSidebar();
		syncMiniRangeFromSidebar();
	}

	function syncSidebarRangeFromMiniBar()
	{
		const controls = getRangeControls();
		// Preserve the existing input/change event order and focus-sensitive sync.
		setUnderlyingValue(controls.minInput, miniMin.value);
		setUnderlyingValue(controls.maxInput, miniMax.value);
	}

	function updateMiniBarVisibility()
	{
		if (!hasMiniBar()) return;
		if (!isMobile()) {
			setMiniBarHidden(true);
			return;
		}
		setMiniBarHidden(!isSheetCollapsed());
	}

	function openSheet()
	{
		if (!isSheetCollapsed()) return;
		setSheetCollapsed(false);
	}

	sheetTop.addEventListener('click', function (e) {
		e.stopPropagation();
		if (!isMobile()) return;
		setSheetCollapsed(!isSheetCollapsed());
	});
	
	miniExpand.addEventListener('click', function (e) {
		e.stopPropagation();
		openSheet();
	});

	window.addEventListener('resize', function () {
		if (!isMobile()) sidebar.classList.remove('sheet-collapsed');
		updateSheetAria();
		updateMiniBarVisibility();
		syncMiniBarFromSidebar();
	});

	if (typeof map !== 'undefined' && map && map.on) {
		map.on('click', function (e) {
			if (!isMobile() || isSheetCollapsed()) return;

			const target = e.originalEvent?.target;
			if (target?.closest('#sidebar') || target?.closest('#mini-bar')) return;
			setSheetCollapsed(true);
		});
	}

	if (hasMiniBar()) {
		miniMode.addEventListener('change', function () {
			const modeButton = MODE_BUTTONS.find(button => button.dataset.mode === this.value);
			if (modeButton) modeButton.click();
			syncMiniBarFromSidebar();
		});

		miniDistanceToggle.addEventListener('change', function () {
			setUnderlyingToggle(this.checked);
			syncMiniBarFromSidebar();
		});

		miniMin.addEventListener('change', syncSidebarRangeFromMiniBar);
		miniMax.addEventListener('change', syncSidebarRangeFromMiniBar);

		miniCalc.addEventListener('click', function () {
			syncSidebarRangeFromMiniBar();
			const calcButton = ELS.calc;
			if (calcButton) calcButton.click();
		});

		const controlsToSync = [ELS.distanceToggle, ...Object.values(RANGE_CONTROLS).flatMap(controls => [controls.minInput, controls.maxInput])];
		controlsToSync.forEach(function (el) {
			if (!el) return;
			el.addEventListener('change', syncMiniBarFromSidebar);
			el.addEventListener('input', syncMiniBarFromSidebar);
		});

		MODE_BUTTONS.forEach(function (button) {
			button.addEventListener('click', syncMiniBarFromSidebar);
		});

		const observer = new MutationObserver(function () {
			updateMiniBarVisibility();
			syncMiniBarFromSidebar();
		});
		observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
	}

	if (!isMobile()) sidebar.classList.remove('sheet-collapsed');
	updateSheetAria();
	updateMiniBarVisibility();
	syncMiniBarFromSidebar();
})();
