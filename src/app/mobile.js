'use strict';

const MOBILE_BREAKPOINT_FALLBACK = 640;
const SHEET_TRANSITION_FALLBACK_MS = 350;
const MINIBAR_VISIBLE_CLASS = 'mini-bar-visible';
const MINI_HIDDEN_CLASS = 'mini-hidden';

(function () {
	function $(id)
	{
		return document.getElementById(id);
	}

	const sidebar = $('sidebar');
	const sheetTop = $('sheet-top');
	const subtitle = $('sheet-subtitle');
	const miniBar = $('mini-bar');
	const miniExpand = $('mini-expand');
	const miniMode = $('mini-mode');
	const miniDistanceToggle = $('mini-dtg');
	const miniTimeLabel = $('mini-lt');
	const miniDistanceLabel = $('mini-ld');
	const miniMin = $('mini-min');
	const miniMax = $('mini-max');
	const miniUnit = $('mini-unit');
	const miniCalc = $('mini-calc');
	const body = document.body;
	if (!sidebar || !sheetTop || !subtitle) return;

	function getMobileBreakpoint()
	{
		return window.C && C.MOBILE_BREAKPOINT_PX ? C.MOBILE_BREAKPOINT_PX : MOBILE_BREAKPOINT_FALLBACK;
	}

	function getSheetTransitionMs()
	{
		return window.C && C.SHEET_TRANSITION_MS ? C.SHEET_TRANSITION_MS : SHEET_TRANSITION_FALLBACK_MS;
	}

	function isMobileViewport()
	{
		return window.innerWidth < getMobileBreakpoint();
	}

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
		}, getSheetTransitionMs());
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

	function getInputValue(id)
	{
		const el = $(id);
		return el ? el.value : '';
	}

	function dispatchInputEvent(el, eventName)
	{
		el.dispatchEvent(new Event(eventName, { bubbles: true }));
	}

	function setUnderlyingValue(inputId, value)
	{
		const el = $(inputId);
		if (!el) return;
		el.value = value;
		dispatchInputEvent(el, 'input');
		dispatchInputEvent(el, 'change');
	}

	function setUnderlyingToggle(checked)
	{
		const distanceToggle = $('dtg');
		if (!distanceToggle) return;
		distanceToggle.checked = checked;
		dispatchInputEvent(distanceToggle, 'change');
	}

	function getActiveModeKey()
	{
		const activeModeButton = document.querySelector('.mb.active');
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
		const distanceToggle = $('dtg');
		const useDistance = !!(distanceToggle && distanceToggle.checked);
		miniDistanceToggle.checked = useDistance;
		miniTimeLabel.classList.toggle('mini-on', !useDistance);
		miniDistanceLabel.classList.toggle('mini-on', useDistance);
	}

	function syncMiniRangeFromSidebar()
	{
		if (!hasMiniBar()) return;
		const distanceToggle = $('dtg');
		const useDistance = !!(distanceToggle && distanceToggle.checked);
		if (useDistance) {
			miniUnit.textContent = 'km';
			if (document.activeElement !== miniMin) miniMin.value = getInputValue('mid');
			if (document.activeElement !== miniMax) miniMax.value = getInputValue('mad');
			miniMin.step = getInputValue('mid') ? $('mid').step : '10';
			miniMax.step = getInputValue('mad') ? $('mad').step : '10';
		} else {
			miniUnit.textContent = 'hr';
			if (document.activeElement !== miniMin) miniMin.value = getInputValue('mih');
			if (document.activeElement !== miniMax) miniMax.value = getInputValue('mah');
			miniMin.step = getInputValue('mih') ? $('mih').step : '0.5';
			miniMax.step = getInputValue('mah') ? $('mah').step : '0.5';
		}
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
		const distanceToggle = $('dtg');
		const useDistance = !!(distanceToggle && distanceToggle.checked);
		
		const minValue = miniMin.value;
        const maxValue = miniMax.value;

		if (useDistance) {
			setUnderlyingValue('mid', miniMin.value);
			setUnderlyingValue('mad', miniMax.value);
			return;
		}
		setUnderlyingValue('mih', miniMin.value);
		setUnderlyingValue('mah', miniMax.value);
	}

	function updateMiniBarVisibility()
	{
		if (!hasMiniBar()) return;
		if (!isMobileViewport()) {
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

	sheetTop.addEventListener('click', function () {
		if (!isMobileViewport()) return;
		setSheetCollapsed(!isSheetCollapsed());
	});

	window.addEventListener('resize', function () {
		if (!isMobileViewport()) sidebar.classList.remove('sheet-collapsed');
		updateSheetAria();
		updateMiniBarVisibility();
		syncMiniBarFromSidebar();
	});

	if (typeof map !== 'undefined' && map && map.on) {
		map.on('click mousedown touchstart', function () {
			if (isMobileViewport() && !isSheetCollapsed()) setSheetCollapsed(true);
		});
	}

	if (hasMiniBar()) {
		miniMode.addEventListener('change', function () {
			const modeButton = document.querySelector('.mb[data-mode="' + this.value + '"]');
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
			const calcButton = $('calc');
			if (calcButton) calcButton.click();
		});

		miniExpand.addEventListener('click', function () {
			openSheet();
		});

		const controlsToSync = ['dtg', 'mih', 'mah', 'mid', 'mad'];
		controlsToSync.forEach(function (id) {
			const el = $(id);
			if (!el) return;
			el.addEventListener('change', syncMiniBarFromSidebar);
			el.addEventListener('input', syncMiniBarFromSidebar);
		});

		Array.from(document.querySelectorAll('.mb')).forEach(function (button) {
			button.addEventListener('click', syncMiniBarFromSidebar);
		});

		const observer = new MutationObserver(function () {
			updateMiniBarVisibility();
			syncMiniBarFromSidebar();
		});
		observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
	}

	if (!isMobileViewport()) sidebar.classList.remove('sheet-collapsed');
	updateSheetAria();
	updateMiniBarVisibility();
	syncMiniBarFromSidebar();
})();
