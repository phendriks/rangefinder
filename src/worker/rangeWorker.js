// rangeWorker.js
// Computes reachable land ranges on a coarse land grid using Dijkstra.
// Talks to app.js via messages of the form:
//     { type:'status'|'grid'|'done'|'error', ... }

importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
importScripts('https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js');
importScripts('../config/constants.js');
importScripts('../shared/math.js');
importScripts('../shared/geo.js');
importScripts('../shared/minHeap.js');
importScripts('../shared/spatialHash.js');
importScripts('../domain/roads/speedClass.js');
importScripts('../data/countriesNaturalEarth.js');
importScripts('../data/crossingPolygons.js');
importScripts('../data/roads.js');
importScripts('roads/tileClassification.js');
importScripts('land/land.js');
importScripts('grid/grid.js');
importScripts('mesh/meshBuild.js');
importScripts('contour/contour.js');


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
			.map((p, idx) => {
				const landType = mesh.landTypes[idx];
				const hasLandEnums = landType !== C.CELL_WATER;
				return {
					lat: p[0],
					lng: p[1],
					cell: mesh.cellTypes[idx],
					landType,
					speedClass: hasLandEnums ? mesh.speedClasses[idx] : null,
					roadBands: hasLandEnums ? mesh.roadBands?.[idx] : null
				};
			})
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

