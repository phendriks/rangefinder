'use strict';

(function () {
	function $(id) { return document.getElementById(id); }

	const miniBar = $('mini-bar');
	const miniExpand = $('mini-expand');
	const miniMode = $('mini-mode');
	const miniDtg = $('mini-dtg');
	const miniLt = $('mini-lt');
	const miniLd = $('mini-ld');
	const miniMin = $('mini-min');
	const miniMax = $('mini-max');
	const miniUnit = $('mini-unit');
	const miniCalc = $('mini-calc');

	if (!miniBar || !miniExpand || !miniMode || !miniDtg || !miniLt || !miniLd || !miniMin || !miniMax || !miniUnit || !miniCalc) return;

	const sidebar = $('sidebar');
	const sheetTop = $('sheet-top');

	function isMobile() {
		return window.innerWidth < (window.C && C.MOBILE_BREAKPOINT_PX ? C.MOBILE_BREAKPOINT_PX : 640);
	}

	function isCollapsed() {
		return sidebar && sidebar.classList.contains('sheet-collapsed');
	}

	function setMiniHidden(hidden) {
		miniBar.classList.toggle('mini-hidden', hidden);
	}

	function setUnderlyingValue(inputId, value) {
		const el = $(inputId);
		if (!el) return;

		el.value = value;
		el.dispatchEvent(new Event('change', { bubbles: true }));
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function setUnderlyingToggle(checked) {
		const dtg = $('dtg');
		if (!dtg) return;

		dtg.checked = checked;
		dtg.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function syncToggleFromSidebar() {
		const dtg = $('dtg');
		const useDist = dtg ? dtg.checked : false;

		miniDtg.checked = useDist;
		miniLt.classList.toggle('mini-on', !useDist);
		miniLd.classList.toggle('mini-on', useDist);
	}

	function syncFromSidebar() {
		syncToggleFromSidebar();

		const dtg = $('dtg');
		const useDist = dtg ? dtg.checked : false;

		if (useDist) {
			miniUnit.textContent = 'km';
			miniMin.value = $('mid') ? $('mid').value : 0;
			miniMax.value = $('mad') ? $('mad').value : 0;
		} else {
			miniUnit.textContent = 'hr';
			miniMin.value = $('mih') ? $('mih').value : 0;
			miniMax.value = $('mah') ? $('mah').value : 0;
		}
	}

	function syncToSidebar() {
		const dtg = $('dtg');
		const useDist = dtg ? dtg.checked : false;

		if (useDist) {
			setUnderlyingValue('mid', miniMin.value);
			setUnderlyingValue('mad', miniMax.value);
		} else {
			setUnderlyingValue('mih', miniMin.value);
			setUnderlyingValue('mah', miniMax.value);
		}
	}

	function setMode(modeKey) {
		const btn = document.querySelector('.mb[data-mode="' + modeKey + '"]');
		if (btn) btn.click();
	}

	function updateVisibility() {
		if (!isMobile()) {
			setMiniHidden(true);
			return;
		}

		setMiniHidden(!isCollapsed());
	}

	miniMode.addEventListener('change', function () {
		setMode(this.value);
		syncFromSidebar();
	});

	miniDtg.addEventListener('change', function () {
		setUnderlyingToggle(this.checked);
		syncFromSidebar();
	});

	miniMin.addEventListener('change', function () {
		syncToSidebar();
	});

	miniMax.addEventListener('change', function () {
		syncToSidebar();
	});

	miniCalc.addEventListener('click', function () {
		const calc = $('calc');
		if (calc) calc.click();
	});

	miniExpand.addEventListener('click', function () {
		if (sheetTop) {
			sheetTop.click();
		} else if (sidebar) {
			sidebar.classList.toggle('sheet-collapsed', false);
		}

		setTimeout(updateVisibility, window.C && C.SHEET_TRANSITION_MS ? C.SHEET_TRANSITION_MS : 350);
	});

	window.addEventListener('resize', updateVisibility);

	const obs = sidebar ? new MutationObserver(updateVisibility) : null;
	if (obs) obs.observe(sidebar, { attributes: true, attributeFilter: ['class'] });

	const dtg = $('dtg');
	if (dtg) dtg.addEventListener('change', syncFromSidebar);

	syncFromSidebar();
	updateVisibility();
})();
