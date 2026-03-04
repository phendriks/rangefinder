// Map setup

const map = L.map('map', { center: C.MAP_INITIAL_CENTER, zoom: C.MAP_INITIAL_ZOOM, zoomControl: false });
L.control.zoom({ position: 'bottomright' }).addTo(map);

const canvasRenderer = L.canvas({ padding: C.CANVAS_PADDING });

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	{maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
).addTo(map);

// Desktop: CSS already gives the map a 300px left margin via the sidebar width.
// Mobile: CSS removes that margin; the bottom sheet overlays the full-screen map.
const isMobile = () => window.innerWidth < C.MOBILE_BREAKPOINT_PX;

if (!isMobile()) {document.getElementById('map').style.marginLeft = C.SIDEBAR_WIDTH_PX + 'px';}
map.invalidateSize();

// Recompute map margin if window is resized across the breakpoint
window.addEventListener('resize', () => {document.getElementById('map').style.marginLeft = isMobile() ? '' : (C.SIDEBAR_WIDTH_PX + 'px'); map.invalidateSize();});


// State

let coords			= null;
let pin				= null;
let mapLayers		= [];
let gridMarkers		= [];
let epMarkers		= [];
let useDist			= false;
let activeModeKey	= 'drive';
let worker			= null;
let searchTimer		= null;
let lastQuery		= '';

// Debug visibility

let lastCtxCountry	= null;
let lastCtxTerrain	= null;
