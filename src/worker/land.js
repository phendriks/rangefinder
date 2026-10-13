// land.js
// Land and crossing helpers for range-worker.

let landFeatures = null; // Array of { bbox, poly }
let crossingFeatures = null; // Array of crossing polygons

function normalizeRingIfNeeded(ring) {
	if (!Array.isArray(ring) || ring.length < 3) return null;
	const first = ring[0];
	const last = ring[ring.length - 1];
	if (!first || !last) return null;
	if (first[0] === last[0] && first[1] === last[1]) return ring;
	const closed = ring.slice();
	closed.push([first[0], first[1]]);
	return closed;
}

function bufferFeatureIfNeeded(feature) {
	const bufferKm = Number(C.POLYGON_BUFFER_KM) || 0;
	if (!feature || !(bufferKm > 0)) return feature;
	const buffered = turf.buffer(feature, bufferKm, { units: 'kilometers' });
	return buffered || feature;
}

function buildBufferedRingFeature(ring, name) {
	const closedRing = normalizeRingIfNeeded(ring);
	if (!closedRing || closedRing.length < 4) return null;
	const poly = bufferFeatureIfNeeded(turf.polygon([closedRing], { name }));
	const bbox = turf.bbox(poly);
	return { bbox: [bbox[1], bbox[3], bbox[0], bbox[2]], poly };
}

async function ensureLandLoaded() {
	if (landFeatures) return;
	self.postMessage({ type: 'status', msg: 'Loading land data...' });

	landFeatures = [];
	const countries = (C && Array.isArray(C.COUNTRY_POLYGONS)) ? C.COUNTRY_POLYGONS : null;
	if (countries && countries.length) {
		for (const entry of countries) {
			const rings = entry && Array.isArray(entry.polys) ? entry.polys : null;
			if (!rings || !rings.length) continue;
			for (const ring of rings) {
				const feature = buildBufferedRingFeature(ring, entry.name);
				if (feature) landFeatures.push(feature);
			}
		}
	}
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
			const feature = buildBufferedRingFeature(ring, name);
			if (feature) crossingFeatures.push({ name, ...feature });
		}
	}
}
function featuresContainPoint(features, lat, lng) {
	if (!features || !features.length) return false;
	let pt = null;
	for (const f of features) {
		const b = f.bbox;
		if (lat < b[0] || lat > b[1] || lng < b[2] || lng > b[3]) continue;
		if (!pt) pt = turf.point([lng, lat]);
		if (turf.booleanPointInPolygon(pt, f.poly)) return true;
	}
	return false;
}

function isBufferedLandPoint(lat, lng) {
	return featuresContainPoint(landFeatures, lat, lng);
}

function isCrossingPoint(lat, lng) {
	return featuresContainPoint(crossingFeatures, lat, lng);
}

function classifyCell(lat, lng) {
	if (isBufferedLandPoint(lat, lng)) return C.CELL_LAND;
	if (isCrossingPoint(lat, lng)) return C.CELL_CROSSING;
	return C.CELL_WATER;
}
