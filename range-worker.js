// range-worker.js
// Computes reachable land ranges on a coarse land grid using Dijkstra.
// Talks to app.js via messages of the form:
//     { type:'status'|'grid'|'done'|'error', ... }

importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
importScripts('constants.js');

let landFeatures = null; // FeatureCollection of land polygons
let crossingFeatures = null; // Array of crossing polygons

self.onmessage = async (e) => {
	try {
	const { outerKm, innerKm, clat, clng } = e.data;

	if (!Number.isFinite(outerKm) || outerKm <= 0) throw new Error('Invalid outerKm.');
	if (!Number.isFinite(clat) || !Number.isFinite(clng)) throw new Error('Invalid center coordinate.');

	await ensureLandLoaded();

	self.postMessage({ type: 'status', msg: 'Building grid...' });
	const grid = buildGrid(clat, clng, outerKm);

	// Let the app render debug dots if enabled.
	self.postMessage({
		type: 'grid',
		pts: grid.pts.map((p, idx) => ({ lat: p[0], lng: p[1], cell: grid.cellTypes[idx] }))
	});

	self.postMessage({ type: 'status', msg: 'Walking land graph...' });
	const costs = computeDistanceField(grid, outerKm, clat, clng);

	self.postMessage({ type: 'status', msg: 'Extracting geometry...' });
	const outer = computeIsoPolygon(grid, costs, outerKm);
	const inner = innerKm > 0 ? computeIsoPolygon(grid, costs, innerKm) : null;

	if (!outer || !outer.ring || outer.ring.length < 4) {
		self.postMessage({
		type: 'error',
		msg: 'No reachable land cells were found for this range. Try a smaller range or pick a land location.'
		});
		return;
	}

	// If inner is missing, fall back to a harmless polygon so the app renderer doesn't crash.
	const outerGeo = outer.geo;
	const innerGeo = inner?.geo || turf.polygon([outer.ring], { kind: 'inner-fallback' });

	self.postMessage({
		type: 'done',
		outerRing: outer.ring,
		innerRing: inner?.ring || null,
		outerGeo,
		innerGeo
	});
	} catch (err) {
	self.postMessage({ type: 'error', msg: err?.message ? String(err.message) : 'Unknown worker error' });
	}
};

async function ensureLandLoaded() {
	if (landFeatures) return;
	self.postMessage({ type: 'status', msg: 'Loading land data...' });

	const res = await fetch(C.LAND_DATA_URL, { cache: 'force-cache' });
	if (!res.ok) throw new Error(`Failed to load land data (${res.status})`);

	const topo = await res.json();
	const landObj = topo?.objects?.land;
	if (!landObj) throw new Error('Land topojson missing objects.land');

	landFeatures = topojson.feature(topo, landObj);
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
			crossingFeatures.push({
				name,
				bbox,
				poly: turf.polygon([ring], { name })
			});
		}
	}
}

function clamp(n, lo, hi) {
	return Math.max(lo, Math.min(hi, n));
}

function buildGrid(clat, clng, maxKm) {
	// Expand bbox slightly so contours have room.
	const marginKm = maxKm * C.GRID_MARGIN_FACTOR;
	const rKm = maxKm + marginKm;

	const latDelta = rKm / 111;
	const lngDelta = rKm / (111 * Math.cos(clat * Math.PI / 180));

	const minLat = clat - latDelta;
	const maxLat = clat + latDelta;
	const minLng = clng - lngDelta;
	const maxLng = clng + lngDelta;

	// IMPORTANT: constants.js defines GRID_SIZE_DIVISOR as a divisor, not a fixed N.
	// N grows with range: N = clamp(outerKm / divisor, min, max)
	const N = clamp(Math.round(maxKm / C.GRID_SIZE_DIVISOR), C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);

	const pts = [];
	const cellTypes = [];
	for (let i = 0; i <= N; i++) {
	for (let j = 0; j <= N; j++) {
		const lat = minLat + (i / N) * (maxLat - minLat);
		const lng = minLng + (j / N) * (maxLng - minLng);
		pts.push([lat, lng]);
		cellTypes.push(classifyCell(lat, lng));
	}
	}

	return { pts, cellTypes, N, minLat, maxLat, minLng, maxLng };
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
	for (const z of C.CROSSING_ZONES) {
		if (lat >= z[1] && lat <= z[2] && lng >= z[3] && lng <= z[4]) return true;
	}
	return false;
}

function classifyCell(lat, lng) {
	if (isLandPoint(lat, lng)) return C.CELL_LAND;
	if (isCrossingPoint(lat, lng)) return C.CELL_CROSSING;
	return C.CELL_WATER;
}

class MinHeap {
	constructor() { this.items = []; }
	push(node) { this.items.push(node); this.bubbleUp(this.items.length - 1); }
	pop() {
	if (!this.items.length) return null;
	const top = this.items[0];
	const last = this.items.pop();
	if (this.items.length) {
		this.items[0] = last;
		this.sinkDown(0);
	}
	return top;
	}
	bubbleUp(i) {
	while (i > 0) {
		const p = (i - 1) >> 1;
		if (this.items[p].cost <= this.items[i].cost) break;
		[this.items[p], this.items[i]] = [this.items[i], this.items[p]];
		i = p;
	}
	}
	sinkDown(i) {
	const n = this.items.length;
	while (true) {
		const l = i * 2 + 1;
		const r = i * 2 + 2;
		let m = i;
		if (l < n && this.items[l].cost < this.items[m].cost) m = l;
		if (r < n && this.items[r].cost < this.items[m].cost) m = r;
		if (m === i) break;
		[this.items[m], this.items[i]] = [this.items[i], this.items[m]];
		i = m;
	}
	}
}

function computeDistanceField(grid, maxKm, clat, clng) {
	const { pts, N, cellTypes } = grid;
	const costs = new Array(pts.length).fill(Infinity);

	// Snap origin to a non-water cell to avoid "coastline" failures on coarse grids.
	let originIdx = findClosestIndex(pts, clat, clng);
	if (cellTypes[originIdx] === C.CELL_WATER) {
	originIdx = findClosestNonWaterIndex(pts, cellTypes, clat, clng);
	}
	if (originIdx < 0) return costs;

	costs[originIdx] = 0;
	const heap = new MinHeap();
	heap.push({ idx: originIdx, cost: 0 });

	while (true) {
	const node = heap.pop();
	if (!node) break;

	const idx = node.idx;
	const baseCost = node.cost;
	if (baseCost !== costs[idx]) continue;
	if (baseCost > maxKm) continue;

	const i = Math.floor(idx / (N + 1));
	const j = idx % (N + 1);

	for (let di = -1; di <= 1; di++) {
		for (let dj = -1; dj <= 1; dj++) {
		if (!di && !dj) continue;

		const ni = i + di;
		const nj = j + dj;
		if (ni < 0 || nj < 0 || ni > N || nj > N) continue;

		const nIdx = ni * (N + 1) + nj;
		const cellType = cellTypes[nIdx];
		if (cellType === C.CELL_WATER) continue;

		const stepKm = haversineKm(pts[idx], pts[nIdx]);
		const multiplier = (cellType === C.CELL_CROSSING) ? C.CROSSING_DISTANCE_FACTOR : 1;
		const newCost = baseCost + stepKm * multiplier;

		if (newCost < costs[nIdx] && newCost <= maxKm) {
			costs[nIdx] = newCost;
			heap.push({ idx: nIdx, cost: newCost });
		}
		}
	}
	}

	return costs;
}

function findClosestIndex(pts, lat, lng) {
	let bestIdx = 0;
	let bestDist = Infinity;
	for (let i = 0; i < pts.length; i++) {
	const d = haversineKm(pts[i], [lat, lng]);
	if (d < bestDist) { bestDist = d; bestIdx = i; }
	}
	return bestIdx;
}

function findClosestNonWaterIndex(pts, cellTypes, lat, lng) {
	let bestIdx = -1;
	let bestDist = Infinity;
	for (let i = 0; i < pts.length; i++) {
	if (cellTypes[i] === C.CELL_WATER) continue;
	const d = haversineKm(pts[i], [lat, lng]);
	if (d < bestDist) { bestDist = d; bestIdx = i; }
	}
	return bestIdx;
}

function haversineKm(a, b) {
	const R = 6371;
	const dLat = (b[0] - a[0]) * Math.PI / 180;
	const dLng = (b[1] - a[1]) * Math.PI / 180;

	const lat1 = a[0] * Math.PI / 180;
	const lat2 = b[0] * Math.PI / 180;

	const sin1 = Math.sin(dLat / 2);
	const sin2 = Math.sin(dLng / 2);

	const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

function computeIsoPolygon(grid, costs, maxBandKm) {
	// Build a point FeatureCollection for Turf isobands.
	// Water/unreached points become very large to prevent inclusion.
	const pts = [];
	const BIG = maxBandKm * 1000;
	for (let i = 0; i < grid.pts.length; i++) {
	const [lat, lng] = grid.pts[i];
	const v = Number.isFinite(costs[i]) ? costs[i] : BIG;
	pts.push(turf.point([lng, lat], { v }));
	}
	const fc = turf.featureCollection(pts);

	const bands = turf.isobands(fc, [0, maxBandKm], { zProperty: 'v' });
	if (!bands?.features?.length) return null;

	const poly = pickLargestPolygon(bands);
	if (!poly) return null;

	const normalized = toLargestSinglePolygon(poly);
	if (!normalized) return null;

	const coords = normalized.geometry.coordinates;
	if (!coords?.length || !coords[0]?.length) return null;

	const ring = coords[0].map(([lng, lat]) => [lng, lat]);
	// Ensure closed
	const first = ring[0];
	const last = ring[ring.length - 1];
	if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]]);

	return { geo: normalized, ring };
}

function pickLargestPolygon(fc) {
	let best = null;
	let bestArea = -Infinity;
	for (const f of fc.features) {
	if (!f?.geometry) continue;
	const area = turf.area(f);
	if (area > bestArea) { bestArea = area; best = f; }
	}
	return best;
}

function toLargestSinglePolygon(feature) {
	if (!feature?.geometry) return null;
	if (feature.geometry.type === 'Polygon') return feature;
	if (feature.geometry.type !== 'MultiPolygon') return null;

	let bestCoords = null;
	let bestArea = -Infinity;
	for (const coords of feature.geometry.coordinates) {
	const f = turf.polygon(coords);
	const a = turf.area(f);
	if (a > bestArea) { bestArea = a; bestCoords = coords; }
	}
	return bestCoords ? turf.polygon(bestCoords, feature.properties || {}) : null;
}
