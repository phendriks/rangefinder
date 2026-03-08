// land.js
// Land and crossing helpers for range-worker.

let landFeatures = null; // FeatureCollection of land polygons
let crossingFeatures = null; // Array of crossing polygons

function bufferFeatureIfNeeded(feature) {
	const bufferKm = Number(C.POLYGON_BUFFER_KM) || 0;
	if (!feature || !(bufferKm > 0)) return feature;
	const buffered = turf.buffer(feature, bufferKm, { units: 'kilometers' });
	return buffered || feature;
}
async function ensureLandLoaded() {
	if (landFeatures) return;
	self.postMessage({ type: 'status', msg: 'Loading land data...' });

	const res = await fetch(C.LAND_DATA_URL, { cache: 'force-cache' });
	if (!res.ok) throw new Error(`Failed to load land data (${res.status})`);

	const topo = await res.json();
	const landObj = topo?.objects?.land;
	if (!landObj) throw new Error('Land topojson missing objects.land');

	landFeatures = topojson.feature(topo, landObj);
	landFeatures = bufferFeatureIfNeeded(landFeatures);
	ensureCrossingsLoaded();
}

function ensureCrossingsLoaded() {
	if (crossingFeatures) return;
	crossingFeatures = [];
	if (!Array.isArray(C.CROSSING_POLYGONS) || !C.CROSSING_POLYGONS.length) return;
	for (const entry of C.CROSSING_POLYGONS) {
		const name = entry[0];
		const rings = entry[1];
		if (!Array.isArray(rings) || !rings.length) continue;
		for (const ring of rings) {
			if (!Array.isArray(ring) || ring.length < 4) continue;
			let minLng = Infinity;
			let maxLng = -Infinity;
			let minLat = Infinity;
			let maxLat = -Infinity;
			for (const c of ring) {
				const lng = c[0];
				const lat = c[1];
				if (lng < minLng) minLng = lng;
				if (lng > maxLng) maxLng = lng;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			}
			const bbox = [minLat, maxLat, minLng, maxLng];
			const poly = bufferFeatureIfNeeded(turf.polygon([ring], { name }));
			const bufferedBbox = turf.bbox(poly);
			crossingFeatures.push({
				name,
				bbox: [bufferedBbox[1], bufferedBbox[3], bufferedBbox[0], bufferedBbox[2]],
				poly
			});
		}
	}
}
function isLandPoint(lat, lng) {
	const pt = turf.point([lng, lat]);
	for (const f of landFeatures.features) {
	if (turf.booleanPointInPolygon(pt, f)) return true;
	}
	return false;
}

function isCrossingPoint(lat, lng) {
	if (crossingFeatures && crossingFeatures.length) {
		let pt = null;
		for (const f of crossingFeatures) {
			const b = f.bbox;
			if (lat < b[0] || lat > b[1] || lng < b[2] || lng > b[3]) continue;
			if (!pt) pt = turf.point([lng, lat]);
			if (turf.booleanPointInPolygon(pt, f.poly)) return true;
		}
	}
	return false;
}

function classifyCell(lat, lng) {
	if (isLandPoint(lat, lng)) return C.CELL_LAND;
	if (isCrossingPoint(lat, lng)) return C.CELL_CROSSING;
	return C.CELL_WATER;
}
