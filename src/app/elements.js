// DOM references shared by desktop controls, rendering, and the mobile sheet.
const ELEMENT_IDS = {
	map: 'map', calc: 'calc', clear: 'clr', pointInspect: 'pi',
	distanceLabel: 'ld', distancePanel: 'dp', distanceToggle: 'dtg',
	legend: 'leg', outerLabel: 'lo-lbl', innerLabel: 'in-lbl',
	location: 'loc', locationWrap: 'lw', useLocation: 'use-location',
	maxDistanceInput: 'mad', maxDistanceSlider: 'mads',
	maxTimeInput: 'mah', maxTimeSlider: 'mas',
	minDistanceInput: 'mid', minDistanceSlider: 'mids',
	minTimeInput: 'mih', minTimeSlider: 'mis',
	modeNote: 'sn', progressBar: 'progress-bar', showGrid: 'show-grid',
	statusArea: 'status-area', statusMsg: 'status-msg', suggestions: 'sug',
	timeLabel: 'lt', timePanel: 'tp', sidebar: 'sidebar', sheetTop: 'sheet-top',
	sheetSubtitle: 'sheet-subtitle', miniBar: 'mini-bar', miniExpand: 'mini-expand',
	miniMode: 'mini-mode', miniDistanceToggle: 'mini-dtg',
	miniTimeLabel: 'mini-lt', miniDistanceLabel: 'mini-ld',
	miniMin: 'mini-min', miniMax: 'mini-max', miniUnit: 'mini-unit', miniCalc: 'mini-calc'
};
const ELS = Object.fromEntries(Object.entries(ELEMENT_IDS).map(([name, id]) => [name, document.getElementById(id)]));
const MODE_BUTTONS = Array.from(document.querySelectorAll('.mb'));
