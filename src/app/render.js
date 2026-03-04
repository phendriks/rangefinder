function renderGrid(pts) {
	gridMarkers.forEach(m => map.removeLayer(m));
	gridMarkers = [];

	const showGrid = document.getElementById('show-grid').checked;

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
		gridMarkers.push(m);
	});
}


// Render: polygons + endpoint markers

function renderResults(workerResult, meta, legOTxt, legITxt) {
	const { outerRing, innerRing, outerGeo, innerGeo } = workerResult;

	const outerLayer = L.geoJSON(outerGeo, {
		style: { color: '#0078a8', weight: 2, opacity: 0.8, fillColor: '#0096cc', fillOpacity: 0.18 }
	}).addTo(map);

	const innerLayer = L.geoJSON(innerGeo, {
		style: { color: '#0078a8', weight: 1.5, opacity: 0.6, dashArray: '5 5', fillColor: '#f0ede8', fillOpacity: 0.82 }
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
			iconAnchor: [9, 9]
		});
		const marker = L.marker([lat, lng], { icon, zIndexOffset: C.EP_MARKER_Z_OFFSET });
		if (showPts) marker.addTo(map);
		epMarkers.push(marker);
	});

	map.fitBounds(outerLayer.getBounds(), { padding: [C.MAP_FIT_PADDING_PX, C.MAP_FIT_PADDING_PX] });

	const { effSpd, total, speed, modeTau, terrTau, outerKm, innerKm } = meta;
	const terrain = document.getElementById('ctx-terrain').value;
	const ic = document.getElementById('ic');
	ic.style.display = 'block';
	ic.innerHTML = `
		<div class="icr">~${fmt(outerKm)} km</div> outer crow-flies radius
		<div class="ics">
			<b>Speed:</b> ${speed} km/h ÷ ${total.toFixed(2)} = ${effSpd.toFixed(1)} km/h effective<br>
			<b>τ_mode</b> ${modeTau} × <b>τ_terrain</b> ${C.TERRAIN_TORTUOSITY[terrain].toFixed(2)} = ${total.toFixed(2)}<br>
			<b>Shape:</b> ${C.VECTOR_COUNT} vectors · ${C.VECTOR_STEP_DEG}° apart · max redirect ${C.REDIRECT_ANGLE_MAX}°<br>
			Inner radius: ~${fmt(innerKm)} km
		</div>`;

	applyDebugVisibility();

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
		document.getElementById('ic').style.display = 'none';
		document.getElementById('leg').classList.remove('vis');
		document.getElementById('clr').style.display = 'none';
		document.getElementById('status-area').classList.remove('vis');
		document.getElementById('calc').disabled = false;
	}
}

document.getElementById('clr').addEventListener('click', () => clearOverlay(true));


// Utility

function fmt(n) { return Math.round(n).toLocaleString(); }
