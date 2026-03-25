// app.js
// Map setup and shared app state.

const MAP_EL = document.getElementById('map');
const map = L.map('map', {
	center: C.MAP_INITIAL_CENTER,
	zoom: C.MAP_INITIAL_ZOOM,
	zoomControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

const canvasRenderer = L.canvas({ padding: C.CANVAS_PADDING });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	maxZoom: 19,
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

function isMobile()
{
	return window.innerWidth < C.MOBILE_BREAKPOINT_PX;
}

function updateMapLayout()
{
	MAP_EL.style.marginLeft = isMobile() ? '' : (C.SIDEBAR_WIDTH_PX + 'px');
	map.invalidateSize();
}

updateMapLayout();
window.addEventListener('resize', updateMapLayout);

// State

let coords = null;
let pin = null;
let mapLayers = [];
let gridMarkers = [];
let useDist = false;
let activeModeKey = 'drive';
let worker = null;
let searchTimer = null;
let lastQuery = '';
