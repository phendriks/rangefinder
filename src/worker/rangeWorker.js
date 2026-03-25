// rangeWorker.js
// Computes reachable land ranges on a coarse land grid using Dijkstra.
// Talks to the UI with messages of the form:
//	{ type:'status'|'grid'|'done'|'error', ... }

importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js');
importScripts('../config/base-constants.js');
importScripts('../config/travel-constants.js');
importScripts('../config/shape-constants.js');
importScripts('../config/ui-constants.js');
importScripts('../shared/math.js');
importScripts('../shared/geo.js');
importScripts('../shared/minHeap.js');
importScripts('../shared/spatialHash.js');
importScripts('../domain/speedClass.js');
importScripts('../data/countriesNaturalEarth.js');
importScripts('../data/crossingPolygons.js');
importScripts('../data/network-tiles.js');
importScripts('../data/europe-tiles.js');
importScripts('../data/north-america-tiles.js');
importScripts('../data/north-africa-tiles.js');
importScripts('../data/middle-east-tiles.js');
importScripts('networkTiles.js');
importScripts('land.js');
importScripts('grid.js');
importScripts('mesh.js');
importScripts('contour.js');

self.onmessage = async event => {
	try {
		const { outerKm, innerKm, clat, clng } = event.data;

		if (!Number.isFinite(outerKm) || outerKm <= 0) throw new Error('Invalid outerKm.');
		if (!Number.isFinite(clat) || !Number.isFinite(clng)) throw new Error('Invalid center coordinate.');

		await ensureLandLoaded();

		self.postMessage({ type: 'status', msg: 'Building mesh...' });
		const mesh = buildSitesMesh(clat, clng, outerKm);

		// Always send grid point data so the UI can enable Inspect grid after a calculation.
		// Marker rendering stays lazy on the main thread, so the expensive part only happens
		// when the user actually enables the overlay.
		self.postMessage({
			type: 'grid',
			pts: mesh.pts.map((point, pointIndex) => {
				const landType = mesh.landTypes[pointIndex];
				const hasLandData = landType !== C.CELL_WATER;
				return {
					lat: point[0],
					lng: point[1],
					cell: mesh.cellTypes[pointIndex],
					landType,
					speedClass: hasLandData ? mesh.speedClasses[pointIndex] : null,
					roadBands: hasLandData ? mesh.roadBands?.[pointIndex] : null,
					terrainSeverity: hasLandData ? mesh.terrainSeverities?.[pointIndex] : null
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

		// If inner is missing, fall back to a harmless polygon so the app renderer does not crash.
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

function computeDistanceField(mesh, maxKm, clat, clng)
{
	const { pts, cellTypes, neighbors, edgeCosts } = mesh;
	const costs = new Array(pts.length).fill(Infinity);

	// Snap origin to a non-water cell to avoid coastline failures on coarse grids.
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

		const nodeIndex = node.idx;
		const baseCost = node.cost;
		if (baseCost !== costs[nodeIndex]) continue;
		if (baseCost > maxKm) continue;

		const neighborIndices = neighbors[nodeIndex];
		const edgeRow = edgeCosts ? edgeCosts[nodeIndex] : null;
		for (let edgeIndex = 0; edgeIndex < neighborIndices.length; edgeIndex++) {
			const neighborIndex = neighborIndices[edgeIndex];
			if (cellTypes[neighborIndex] === C.CELL_WATER) continue;

			const edgeCostKm = edgeRow ? edgeRow[edgeIndex] : Infinity;
			if (!Number.isFinite(edgeCostKm)) continue;
			const nextCost = baseCost + edgeCostKm;

			if (nextCost < costs[neighborIndex] && nextCost <= maxKm) {
				costs[neighborIndex] = nextCost;
				heap.push({ idx: neighborIndex, cost: nextCost });
			}
		}
	}

	return costs;
}

function findClosestMeshIndex(mesh, lat, lng, requireNonWater)
{
	if (!mesh || !mesh.xy || !mesh.xy.length) {
		return requireNonWater
			? findClosestNonWaterIndex(mesh.pts, mesh.cellTypes, lat, lng)
			: findClosestIndex(mesh.pts, lat, lng);
	}

	const cosLat = Math.cos(lat * Math.PI / 180);
	const x = (lng - mesh.clng) * C.KM_PER_DEG_LAT * cosLat;
	const y = (lat - mesh.clat) * C.KM_PER_DEG_LAT;
	const originHash = mesh.originHash;
	if (!originHash || !originHash.hash) {
		return requireNonWater
			? findClosestNonWaterIndex(mesh.pts, mesh.cellTypes, lat, lng)
			: findClosestIndex(mesh.pts, lat, lng);
	}

	const nearestIndex = findNearestIndex(originHash.hash, mesh.xy, originHash.cellSize, x, y);
	if (!requireNonWater || nearestIndex < 0 || mesh.cellTypes[nearestIndex] !== C.CELL_WATER) return nearestIndex;

	let bestIndex = -1;
	let bestDistanceSq = Infinity;
	const baseCellX = Math.floor(x / originHash.cellSize);
	const baseCellY = Math.floor(y / originHash.cellSize);
	for (let radius = 1; radius <= 3; radius++) {
		for (let deltaY = -radius; deltaY <= radius; deltaY++) {
			for (let deltaX = -radius; deltaX <= radius; deltaX++) {
				const bucketKey = (baseCellX + deltaX) + ',' + (baseCellY + deltaY);
				const bucket = originHash.hash.get(bucketKey);
				if (!bucket) continue;
				for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex++) {
					const candidateIndex = bucket[bucketIndex];
					if (mesh.cellTypes[candidateIndex] === C.CELL_WATER) continue;
					const pointX = mesh.xy[candidateIndex][0] - x;
					const pointY = mesh.xy[candidateIndex][1] - y;
					const distanceSq = (pointX * pointX) + (pointY * pointY);
					if (distanceSq < bestDistanceSq) {
						bestDistanceSq = distanceSq;
						bestIndex = candidateIndex;
					}
				}
			}
		}
		if (bestIndex >= 0) return bestIndex;
	}

	return findClosestNonWaterIndex(mesh.pts, mesh.cellTypes, lat, lng);
}
