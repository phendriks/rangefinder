'use strict';

// sheet.js
// Handles mobile bottom sheet expand/collapse behavior for the sidebar.

(function () {
	const sidebar = document.getElementById('sidebar');
	const sheetTop = document.getElementById('sheet-top');
	const subtitle = document.getElementById('sheet-subtitle');

	if (!sidebar || !sheetTop || !subtitle) return;

	function isMobile() {
		return window.innerWidth < (window.C && C.MOBILE_BREAKPOINT_PX ? C.MOBILE_BREAKPOINT_PX : 640);
	}

	function isCollapsed() {
		return sidebar.classList.contains('sheet-collapsed');
	}

	function setSheet(collapsed) {
		sidebar.classList.toggle('sheet-collapsed', collapsed);
		sheetTop.setAttribute('aria-expanded', String(!collapsed));
		subtitle.textContent = collapsed ? 'Tap to open controls' : 'Tap to close';

		const settleMs = window.C && C.SHEET_TRANSITION_MS ? C.SHEET_TRANSITION_MS : 350;
		setTimeout(function () {
			if (typeof map !== 'undefined' && map && map.invalidateSize) map.invalidateSize();
		}, settleMs);
	}

	sheetTop.addEventListener('click', function () {
		setSheet(!isCollapsed());
	});

	if (typeof map !== 'undefined' && map && map.on) {
		map.on('click mousedown touchstart', function () {
			if (isMobile() && !isCollapsed()) setSheet(true);
		});
	}
})();
