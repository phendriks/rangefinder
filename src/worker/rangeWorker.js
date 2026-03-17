// rangeWorker.js
// Computes reachable land ranges on a coarse land grid using Dijkstra.
// Talks to app.js via messages of the form:
//     { type:'status'|'grid'|'done'|'error', ... }

importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
importScripts('https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js');
importScripts('../config/base-constants.js');
importScripts('../config/travel-constants.js');
importScripts('../config/shape-constants.js');
importScripts('../config/ui-constants.js');
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
	const { outerKm, innerKm, clat, clng, debugGrid } = e.data;

	if (!Number.isFinite(outerKm) || outerKm <= 0) throw new Error('Invalid outerKm.');
	if (!Number.isFinite(clat) || !Number.isFinite(clng)) throw new Error('Invalid center coordinate.');

	await ensureLandLoaded();

	self.postMessage({ type: 'status', msg: 'Building mesh...' });
	const mesh = buildSitesMesh(clat, clng, outerKm);

	// Always send grid point data so the UI can enable Inspect grid after a calculation.
	// Rendering the markers remains lazy on the main thread, so the expensive part still
	// only happens when the toggle is actually enabled.
	self.postMessage({
		type: 'grid',
		pts: mesh.pts.map((p, idx) => {
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
	const { pts, cellTypes, neighbors, edgeCosts } = mesh;
	const costs = new Array(pts.length).fill(Infinity);

	// Snap origin to a non-water cell to avoid "coastline" failures on coarse grids.
	let originIdx = findClosestMeshIndex(mesh, clat, clng, false);
	if (originIdx >= 0 && cellTypes[originIdx] === C.CELL_WATER) {
		originIdx = findClosestMeshIndex(mesh, clat, clng, true);
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
		const edgeRow = edgeCosts ? edgeCosts[idx] : null;
		for (let k = 0; k < nbs.length; k++) {
			const nIdx = nbs[k];
			if (cellTypes[nIdx] === C.CELL_WATER) continue;

			const edgeCostKm = edgeRow ? edgeRow[k] : Infinity;
			if (!Number.isFinite(edgeCostKm)) continue;
			const newCost = baseCost + edgeCostKm;

			if (newCost < costs[nIdx] && newCost <= maxKm) {
				costs[nIdx] = newCost;
				heap.push({ idx: nIdx, cost: newCost });
			}
		}
	}

	return costs;
}

function findClosestMeshIndex(mesh, lat, lng, requireNonWater) {
	if (!mesh || !mesh.xy || !mesh.xy.length) return requireNonWater
		? findClosestNonWaterIndex(mesh.pts, mesh.cellTypes, lat, lng)
		: findClosestIndex(mesh.pts, lat, lng);

	const cosLat = Math.cos(lat * Math.PI / 180);
	const x = (lng - mesh.clng) * C.KM_PER_DEG_LAT * cosLat;
	const y = (lat - mesh.clat) * C.KM_PER_DEG_LAT;
	const originHash = mesh.originHash;
	if (!originHash || !originHash.hash) return requireNonWater
		? findClosestNonWaterIndex(mesh.pts, mesh.cellTypes, lat, lng)
		: findClosestIndex(mesh.pts, lat, lng);

	const idx = FindNearestIndex(originHash.hash, mesh.xy, originHash.cellSize, x, y);
	if (!requireNonWater || idx < 0 || mesh.cellTypes[idx] !== C.CELL_WATER) return idx;

	let best = -1;
	let bestDist = Infinity;
	const baseCx = Math.floor(x / originHash.cellSize);
	const baseCy = Math.floor(y / originHash.cellSize);
	for (let radius = 1; radius <= 3; radius++) {
		for (let dy = -radius; dy <= radius; dy++) {
			for (let dx = -radius; dx <= radius; dx++) {
				const bucket = originHash.hash.get((baseCx + dx) + ',' + (baseCy + dy));
				if (!bucket) continue;
				for (let i = 0; i < bucket.length; i++) {
					const candidate = bucket[i];
					if (mesh.cellTypes[candidate] === C.CELL_WATER) continue;
					const px = mesh.xy[candidate][0] - x;
					const py = mesh.xy[candidate][1] - y;
					const d2 = (px * px) + (py * py);
					if (d2 < bestDist) {
						bestDist = d2;
						best = candidate;
					}
				}
			}
		}
		if (best >= 0) return best;
	}

	return findClosestNonWaterIndex(mesh.pts, mesh.cellTypes, lat, lng);
}

