const pointInspect = document.getElementById('pi');

let inspectPoints = [];
let inspectPointPixels = [];
let gridSourceData = [];
let inspectRafHandle = null;
let inspectPendingEvent = null;

function setInspectPoints(points) {
	inspectPoints = points || [];
	updateInspectPixels();
}

function updateInspectPixels() {
	inspectPointPixels = [];
	if (!map) return;
	if (!inspectPoints || inspectPoints.length === 0) return;

	inspectPoints.forEach(point => {
		const pixel = map.latLngToContainerPoint([point.lat, point.lng]);
		inspectPointPixels.push({ x: pixel.x, y: pixel.y });
	});
}

function scheduleInspect(evt) {
	if (!document.getElementById('show-grid').checked) return;
	inspectPendingEvent = evt;
	if (inspectRafHandle !== null) return;
	inspectRafHandle = requestAnimationFrame(runInspect);
}

function runInspect() {
	inspectRafHandle = null;
	const evt = inspectPendingEvent;
	inspectPendingEvent = null;
	if (!evt) return;
	if (!document.getElementById('show-grid').checked) return;
	if (!inspectPoints || inspectPoints.length === 0) return;
	if (!inspectPointPixels || inspectPointPixels.length !== inspectPoints.length) updateInspectPixels();

	const raw = evt?.originalEvent;
	if (!raw) return;
	const mapRect = map.getContainer().getBoundingClientRect();
	const relX = raw.clientX - mapRect.left;
	const relY = raw.clientY - mapRect.top;

	let bestIndex = -1;
	let bestDistSq = Infinity;

	for (let pointIndex = 0; pointIndex < inspectPointPixels.length; pointIndex++) {
		const pointPixel = inspectPointPixels[pointIndex];
		const deltaX = pointPixel.x - relX;
		const deltaY = pointPixel.y - relY;
		const distSq = (deltaX * deltaX) + (deltaY * deltaY);
		if (distSq < bestDistSq) {
			bestDistSq = distSq;
			bestIndex = pointIndex;
		}
	}

	if (bestIndex < 0) return;
	if (bestDistSq > (C.POINT_INSPECT_RADIUS_PX * C.POINT_INSPECT_RADIUS_PX)) {
		hidePointInspect();
		return;
	}

	showPointInspect(evt, inspectPoints[bestIndex]);
}

function showPointInspect(evt, point) {
	if (!document.getElementById('show-grid').checked) return;
	if (!pointInspect) return;

	const pointLat = point.lat !== undefined ? point.lat : point[0];
	const pointLng = point.lng !== undefined ? point.lng : point[1];
	const tileSizeDeg = Number(C.ROADS_TILE_SIZE_DEG);
	const tileEps = Number(C.TILE_KEY_EPSILON);
	const tileSizeSafe = Number.isFinite(tileSizeDeg) && tileSizeDeg > 0 ? tileSizeDeg : 0.5;
	const tileEpsSafe = Number.isFinite(tileEps) ? tileEps : 0;
	const tileLatUnits = Math.floor((pointLat / tileSizeSafe) + tileEpsSafe);
	const tileLngUnits = Math.floor((pointLng / tileSizeSafe) + tileEpsSafe);
	const tileLat = tileLatUnits * tileSizeSafe;
	const tileLng = tileLngUnits * tileSizeSafe;

	const landName = point.landType === C.CELL_WATER
		? 'water'
		: point.landType === C.CELL_CROSSING
			? 'crossing'
			: 'land';
	const speedValue = point.speedClass === null || point.speedClass === undefined ? '-' : point.speedClass;
	const roadBandsValue = Array.isArray(point.roadBands) && point.roadBands.length >= 4
		? '['
			+ formatRoadBandInt(point.roadBands[0]) + ', '
			+ formatRoadBandInt(point.roadBands[1]) + ', '
			+ formatRoadBandInt(point.roadBands[2]) + ', '
			+ formatRoadBandInt(point.roadBands[3])
			+ ']'
		: '-';
	pointInspect.textContent = `tile ${tileLat.toFixed(1)} ${tileLng.toFixed(1)}\nlandType ${point.landType} ${landName}\nspeedClass ${speedValue}\nroadBands ${roadBandsValue}`;
	pointInspect.style.display = 'block';
	movePointInspect(evt);
}

function formatRoadBandInt(value) {
	const bandValue = Number(value);
	if (!Number.isFinite(bandValue)) return '0';
	return String(Math.round(bandValue));
}

function movePointInspect(evt) {
	if (!pointInspect || pointInspect.style.display !== 'block') return;
	const raw = evt?.originalEvent;
	if (!raw) return;
	pointInspect.style.left = (raw.clientX + C.UI_POINT_INSPECT_OFFSET_PX) + 'px';
	pointInspect.style.top = (raw.clientY + C.UI_POINT_INSPECT_OFFSET_PX) + 'px';
}

function hidePointInspect() {
	if (!pointInspect) return;
	pointInspect.style.display = 'none';
}

map.on('mousemove', (evt) => scheduleInspect(evt));
map.on('moveend', () => updateInspectPixels());
map.on('zoomend', () => updateInspectPixels());

function renderGrid(pts) {
	gridSourceData = pts || [];
	gridMarkers.forEach(m => map.removeLayer(m));
	gridMarkers = [];

	const showGrid = document.getElementById('show-grid').checked;
	if (!showGrid || !pts || !pts.length) {
		setInspectPoints([]);
		return;
	}

	setInspectPoints(pts);
	pts.forEach(p => {
		const crossing = p.cell === C.CELL_CROSSING;
		const land = p.cell === C.CELL_LAND;
		const colour = crossing
			? C.SITE_COLOUR_CROSSING
			: land
				? C.SITE_COLOUR_LAND
				: C.SITE_COLOUR_WATER;
		const opacity = crossing
			? C.SITE_FILL_OPACITY_CROSSING
			: land
				? C.SITE_FILL_OPACITY_LAND
				: C.SITE_FILL_OPACITY_WATER;
		const m = L.circleMarker([p.lat, p.lng], {
			renderer: canvasRenderer,
			radius: crossing
				? C.GRID_DOT_RADIUS + C.GRID_DOT_RADIUS_CROSSING_BONUS
				: C.GRID_DOT_RADIUS,
			color: colour,
			fillColor: colour,
			fillOpacity: opacity,
			weight: 0
		});
		if (showGrid) m.addTo(map);
		m.on('mousemove', (evt) => movePointInspect(evt));
		gridMarkers.push(m);
	});
}


// Render: polygons + endpoint markers

function renderResults(workerResult, meta, legOTxt, legITxt) {
	const { outerRing, innerRing, outerGeo, innerGeo } = workerResult;

	const outerLayer = L.geoJSON(outerGeo, {
		style: { color: '#0078a8', weight: 2, opacity: 0.8, fillColor: '#0096cc', fillOpacity: 0.1 }
	}).addTo(map);

	const innerLayer = L.geoJSON(innerGeo, {
		style: { color: '#24ac36', weight: 2, opacity: 0.6, dashArray: '5 5', fillOpacity: 0.1 }
	}).addTo(map);

	mapLayers.push(outerLayer, innerLayer);

	epMarkers.forEach(m => map.removeLayer(m));
	epMarkers = [];
	const showPts = document.getElementById('show-pts').checked;

	outerRing.forEach(([lng, lat], idx) => {
		const icon = L.divIcon({
			className:'',
			html: `<div class="ep-marker">${idx + 1}</div>`,
			iconSize: [C.EP_MARKER_SIZE_PX, C.EP_MARKER_SIZE_PX],
			iconAnchor: [C.EP_MARKER_ANCHOR_PX, C.EP_MARKER_ANCHOR_PX]
		});
		const marker = L.marker([lat, lng], { icon, zIndexOffset: C.EP_MARKER_Z_OFFSET });
		if (showPts) marker.addTo(map);
		epMarkers.push(marker);
	});

	map.fitBounds(outerLayer.getBounds(), { padding: [C.MAP_FIT_PADDING_PX, C.MAP_FIT_PADDING_PX] });

	

	document.getElementById('lo-lbl').textContent = legOTxt;
	document.getElementById('in-lbl').textContent = legITxt;
	document.getElementById('leg').classList.add('vis');
	document.getElementById('clr').style.display = 'block';
}


// Clear

function clearOverlay(resetUI = true) {
	if (worker) { worker.terminate(); worker = null; }

	mapLayers.forEach(l => map.removeLayer(l)); mapLayers = [];
	gridMarkers.forEach(m => map.removeLayer(m)); gridMarkers = [];
	epMarkers.forEach(m => map.removeLayer(m)); epMarkers = [];

	if (resetUI) {
		document.getElementById('leg').classList.remove('vis');
		document.getElementById('clr').style.display = 'none';
		document.getElementById('status-area').classList.remove('vis');
		document.getElementById('calc').disabled = false;
	}
}

document.getElementById('clr').addEventListener('click', () => clearOverlay(true));


// Utility

function fmt(n) { return Math.round(n).toLocaleString(); }
