// range-worker.js
// Computes reachable land ranges on a coarse land grid using Dijkstra.
// Talks to app.js via messages of the form:
//     { type:'status'|'grid'|'done'|'error', ... }

importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
importScripts('https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js');
importScripts('../config/constants.js');
importScripts('../data/crossing-polygons.js');
importScripts('land.js');
importScripts('grid.js');
importScripts('mesh.js');
importScripts('contour.js');


self.onmessage = async (e) => {
	try {
	const { outerKm, innerKm, clat, clng } = e.data;

	if (!Number.isFinite(outerKm) || outerKm <= 0) throw new Error('Invalid outerKm.');
	if (!Number.isFinite(clat) || !Number.isFinite(clng)) throw new Error('Invalid center coordinate.');

	await ensureLandLoaded();

	self.postMessage({ type: 'status', msg: 'Building mesh...' });
	const mesh = buildSitesMesh(clat, clng, outerKm);

	// Let the app render debug dots if enabled.
	self.postMessage({
		type: 'grid',
		pts: mesh.pts
			.map((p, idx) => ({ lat: p[0], lng: p[1], cell: mesh.cellTypes[idx] }))
	});

	self.postMessage({ type: 'status', msg: 'Walking land graph...' });
	const costs = computeDistanceField(mesh, outerKm, clat, clng);

	self.postMessage({ type: 'status', msg: 'Extracting geometry...' });
	const outer = computeIsoPolygonSites(mesh, costs, outerKm);
	const inner = innerKm > 0 ? computeIsoPolygonSites(mesh, costs, innerKm) : null;

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

function computeDistanceField(mesh, maxKm, clat, clng) {
	const { pts, cellTypes, neighbors } = mesh;
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

		const nbs = neighbors[idx];
		for (let k = 0; k < nbs.length; k++) {
			const nIdx = nbs[k];
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
	const R = C.EARTH_RADIUS_KM;
	const dLat = (b[0] - a[0]) * Math.PI / 180;
	const dLng = (b[1] - a[1]) * Math.PI / 180;

	const lat1 = a[0] * Math.PI / 180;
	const lat2 = b[0] * Math.PI / 180;

	const sin1 = Math.sin(dLat / 2);
	const sin2 = Math.sin(dLng / 2);

	const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
	return 2 * R * Math.asin(Math.sqrt(h));
}
