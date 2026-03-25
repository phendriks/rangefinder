const GRID_MARKER_RADIUS = 2;
const GRID_MARKER_RADIUS_CROSSING_BONUS = 1;
const POINT_INSPECT_RADIUS_PX = 18;
const POINT_INSPECT_OFFSET_PX = 14;
const SITE_COLOUR_LAND = '#28a050';
const SITE_COLOUR_CROSSING = '#e08020';
const SITE_COLOUR_WATER = '#2b6cc4';
const SITE_FILL_OPACITY_LAND = 0.35;
const SITE_FILL_OPACITY_CROSSING = 0.35;
const SITE_FILL_OPACITY_WATER = 0.15;
const OUTER_RANGE_STYLE = { color: '#0078a8', weight: 2, opacity: 0.8, fillColor: '#0096cc', fillOpacity: 0.1 };
const INNER_RANGE_STYLE = { color: '#24ac36', weight: 2, opacity: 0.6, dashArray: '5 5', fillOpacity: 0.1 };

const POINT_INSPECT_EL = document.getElementById('pi');
const SHOW_GRID_EL = document.getElementById('show-grid');
const LEGEND_EL = document.getElementById('leg');
const CLEAR_BUTTON_EL = document.getElementById('clr');
const STATUS_AREA_EL = document.getElementById('status-area');
const CALC_BUTTON_EL = document.getElementById('calc');
const OUTER_LABEL_EL = document.getElementById('lo-lbl');
const INNER_LABEL_EL = document.getElementById('in-lbl');

let inspectPoints = [];
let inspectPointPixels = [];
let gridSourceData = [];
let inspectRafHandle = null;
let inspectPendingEvent = null;

function setInspectPoints(points)
{
	inspectPoints = points || [];
	updateInspectPixels();
}

function updateInspectPixels()
{
	inspectPointPixels = [];
	if (!map || !inspectPoints.length) return;

	inspectPoints.forEach(point => {
		const pixelPoint = map.latLngToContainerPoint([point.lat, point.lng]);
		inspectPointPixels.push({ x: pixelPoint.x, y: pixelPoint.y });
	});
}

function scheduleInspect(evt)
{
	if (!SHOW_GRID_EL.checked) return;
	inspectPendingEvent = evt;
	if (inspectRafHandle !== null) return;
	inspectRafHandle = requestAnimationFrame(runInspect);
}

function runInspect()
{
	inspectRafHandle = null;
	const evt = inspectPendingEvent;
	inspectPendingEvent = null;
	if (!evt || !SHOW_GRID_EL.checked || !inspectPoints.length) return;
	if (inspectPointPixels.length !== inspectPoints.length) updateInspectPixels();

	const rawEvent = evt?.originalEvent;
	if (!rawEvent) return;

	const mapRect = map.getContainer().getBoundingClientRect();
	const relativeX = rawEvent.clientX - mapRect.left;
	const relativeY = rawEvent.clientY - mapRect.top;

	let closestIndex = -1;
	let closestDistanceSq = Infinity;

	for (let pointIndex = 0; pointIndex < inspectPointPixels.length; pointIndex++) {
		const pixelPoint = inspectPointPixels[pointIndex];
		const deltaX = pixelPoint.x - relativeX;
		const deltaY = pixelPoint.y - relativeY;
		const distanceSq = (deltaX * deltaX) + (deltaY * deltaY);
		if (distanceSq < closestDistanceSq) {
			closestDistanceSq = distanceSq;
			closestIndex = pointIndex;
		}
	}

	if (closestIndex < 0) return;
	if (closestDistanceSq > (POINT_INSPECT_RADIUS_PX * POINT_INSPECT_RADIUS_PX)) {
		hidePointInspect();
		return;
	}

	showPointInspect(evt, inspectPoints[closestIndex]);
}

function getLandTypeLabel(point)
{
	if (point.landType === C.CELL_WATER) return 'water';
	if (point.landType === C.CELL_CROSSING) return 'crossing';
	return 'land';
}

function getTileLabel(pointLat, pointLng)
{
	if (typeof getRoadTileInfoFromLatLng !== 'function') return '-';
	const tileInfo = getRoadTileInfoFromLatLng(pointLat, pointLng);
	if (!tileInfo) return '-';
	return `${tileInfo.tileLat.toFixed(1)} ${tileInfo.tileLng.toFixed(1)}`;
}

function formatRoadBandInt(value)
{
	const bandValue = Number(value);
	if (!Number.isFinite(bandValue)) return '0';
	return String(Math.round(bandValue));
}

function getRoadBandsLabel(roadBands)
{
	if (!Array.isArray(roadBands) || roadBands.length < 4) return '-';
	return '['
		+ formatRoadBandInt(roadBands[0]) + ', '
		+ formatRoadBandInt(roadBands[1]) + ', '
		+ formatRoadBandInt(roadBands[2]) + ', '
		+ formatRoadBandInt(roadBands[3])
		+ ']';
}

function getTerrainSeveritySummary(point)
{
	var terrainSeverity = point.terrainSeverity;
	if (terrainSeverity === null || terrainSeverity === undefined) return '-';
	if (typeof getTerrainSeverityLabel === 'function') {
		return getTerrainSeverityLabel(terrainSeverity);
	}
	return String(terrainSeverity);
}

function showPointInspect(evt, point)
{
	if (!SHOW_GRID_EL.checked || !POINT_INSPECT_EL) return;

	const pointLat = point.lat !== undefined ? point.lat : point[0];
	const pointLng = point.lng !== undefined ? point.lng : point[1];
	const speedClassLabel = point.speedClass === null || point.speedClass === undefined ? '-' : point.speedClass;

	POINT_INSPECT_EL.textContent = `tile ${getTileLabel(pointLat, pointLng)}
landType ${point.landType} ${getLandTypeLabel(point)}
terrain ${getTerrainSeveritySummary(point)}
speedClass ${speedClassLabel}
roadBands ${getRoadBandsLabel(point.roadBands)}`;
	POINT_INSPECT_EL.classList.remove('is-hidden');
	movePointInspect(evt);
}

function movePointInspect(evt)
{
	if (!POINT_INSPECT_EL || POINT_INSPECT_EL.classList.contains('is-hidden')) return;
	const rawEvent = evt?.originalEvent;
	if (!rawEvent) return;
	POINT_INSPECT_EL.style.left = (rawEvent.clientX + POINT_INSPECT_OFFSET_PX) + 'px';
	POINT_INSPECT_EL.style.top = (rawEvent.clientY + POINT_INSPECT_OFFSET_PX) + 'px';
}

function hidePointInspect()
{
	if (!POINT_INSPECT_EL) return;
	POINT_INSPECT_EL.classList.add('is-hidden');
}

function getGridMarkerStyle(point)
{
	const isCrossing = point.cell === C.CELL_CROSSING;
	const isLand = point.cell === C.CELL_LAND;
	const colour = isCrossing
		? SITE_COLOUR_CROSSING
		: isLand
			? SITE_COLOUR_LAND
			: SITE_COLOUR_WATER;
	const fillOpacity = isCrossing
		? SITE_FILL_OPACITY_CROSSING
		: isLand
			? SITE_FILL_OPACITY_LAND
			: SITE_FILL_OPACITY_WATER;
	const radius = isCrossing
		? (GRID_MARKER_RADIUS + GRID_MARKER_RADIUS_CROSSING_BONUS)
		: GRID_MARKER_RADIUS;

	return {
		renderer: canvasRenderer,
		radius,
		color: colour,
		fillColor: colour,
		fillOpacity,
		weight: 0
	};
}

map.on('mousemove', evt => scheduleInspect(evt));
map.on('moveend', () => updateInspectPixels());
map.on('zoomend', () => updateInspectPixels());

function renderGrid(points)
{
	gridSourceData = points || [];
	gridMarkers.forEach(marker => map.removeLayer(marker));
	gridMarkers = [];

	if (!SHOW_GRID_EL.checked || !points || !points.length) {
		setInspectPoints([]);
		return;
	}

	setInspectPoints(points);
	points.forEach(point => {
		const marker = L.circleMarker([point.lat, point.lng], getGridMarkerStyle(point));
		marker.addTo(map);
		gridMarkers.push(marker);
	});
}

function renderResults(workerResult, outerLegendLabel, innerLegendLabel)
{
	const { outerGeo, innerGeo } = workerResult;
	const outerLayer = L.geoJSON(outerGeo, { style: OUTER_RANGE_STYLE }).addTo(map);
	const innerLayer = L.geoJSON(innerGeo, { style: INNER_RANGE_STYLE }).addTo(map);

	mapLayers.push(outerLayer, innerLayer);

	map.fitBounds(outerLayer.getBounds(), { padding: [C.MAP_FIT_PADDING_PX, C.MAP_FIT_PADDING_PX] });
	OUTER_LABEL_EL.textContent = outerLegendLabel;
	INNER_LABEL_EL.textContent = innerLegendLabel;
	LEGEND_EL.classList.add('vis');
	CLEAR_BUTTON_EL.style.display = 'block';
}

function clearOverlay(resetUi = true)
{
	if (worker) {
		worker.terminate();
		worker = null;
	}

	mapLayers.forEach(layer => map.removeLayer(layer));
	mapLayers = [];
	gridMarkers.forEach(marker => map.removeLayer(marker));
	gridMarkers = [];
	setInspectPoints([]);
	hidePointInspect();

	if (resetUi) {
		LEGEND_EL.classList.remove('vis');
		CLEAR_BUTTON_EL.style.display = 'none';
		STATUS_AREA_EL.classList.remove('vis');
		CALC_BUTTON_EL.disabled = false;
	}
}

CLEAR_BUTTON_EL.addEventListener('click', () => clearOverlay(true));

function fmt(n)
{
	return Math.round(n).toLocaleString();
}
