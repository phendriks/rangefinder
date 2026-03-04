// range-worker.js
// Computes reachable land ranges on a coarse land grid using Dijkstra.
// Talks to app.js via messages of the form:
//     { type:'status'|'grid'|'done'|'error', ... }

importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
importScripts('https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js');
importScripts('./config/constants.js');
importScripts('./data/crossing-polygons.js');

let landFeatures = null; // FeatureCollection of land polygons
let crossingFeatures = null; // Array of crossing polygons

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

	const latDelta = rKm / C.KM_PER_DEG_LAT;
	const lngDelta = rKm / (C.KM_PER_DEG_LAT * Math.cos(clat * Math.PI / 180));

	const minLat = clat - latDelta;
	const maxLat = clat + latDelta;
	const minLng = clng - lngDelta;
	const maxLng = clng + lngDelta;

	// IMPORTANT: constants.js defines GRID_SIZE_DIVISOR as a divisor, not a fixed N.
	// N grows with range: N = clamp(outerKm / divisor, min, max)
	let N = clamp(Math.round(maxKm / C.GRID_SIZE_DIVISOR), C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);
	N = clamp(N + C.GRID_SIZE_BONUS, C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);

	const density = Math.sqrt(Math.max(1, C.SITES_DENSITY_FACTOR));
	N = clamp(Math.round(N * density), C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);

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

	let neighbors = buildDelaunayNeighbors(pts, clat, clng, N, 0);
	if (!neighbors) neighbors = buildGridNeighbors(N);
	return { pts, cellTypes, N, minLat, maxLat, minLng, maxLng, neighbors };
}

function buildSitesMesh(clat, clng, maxKm) {
	const marginKm = maxKm * C.GRID_MARGIN_FACTOR;
	const rKm = maxKm + marginKm;

	const latDelta = rKm / C.KM_PER_DEG_LAT;
	const lngDelta = rKm / (C.KM_PER_DEG_LAT * Math.cos(clat * Math.PI / 180));

	const minLat = clat - latDelta;
	const maxLat = clat + latDelta;
	const minLng = clng - lngDelta;
	const maxLng = clng + lngDelta;

	let N = clamp(Math.round(maxKm / C.GRID_SIZE_DIVISOR), C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);
	N = clamp(N + C.GRID_SIZE_BONUS, C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);

	const stepLat = (maxLat - minLat) / N;
	const stepLng = (maxLng - minLng) / N;
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const stepKmHint = Math.max(1, Math.min(
		Math.abs(stepLat) * C.KM_PER_DEG_LAT,
		Math.abs(stepLng) * C.KM_PER_DEG_LAT * cosLat
	));

	let sites = buildJitteredSites(minLat, maxLat, minLng, maxLng, clat, clng, N, stepKmHint);
	sites = lloydRelax(sites, minLat, maxLat, minLng, maxLng, clat, clng, N, stepKmHint);

	const pts = new Array(sites.length);
	const cellTypes = new Array(sites.length);
	for (let i = 0; i < sites.length; i++) {
		pts[i] = [sites[i].lat, sites[i].lng];
		cellTypes[i] = classifyCell(sites[i].lat, sites[i].lng);
	}

	let delaunayMesh = buildDelaunayMesh(pts, clat, clng, 0, stepKmHint);
	if (!delaunayMesh) {
		delaunayMesh = {
			neighbors: buildGridNeighbors(N),
			triangles: null,
			xy: null
		};
	}
	return {
		pts,
		cellTypes,
		N,
		minLat,
		maxLat,
		minLng,
		maxLng,
		neighbors: delaunayMesh.neighbors,
		triangles: delaunayMesh.triangles,
		xy: delaunayMesh.xy,
		stepKmHint,
		clat,
		clng
	};
}

function buildRasterGrid(mesh) {
	const pts = [];
	const N = mesh.N;
	for (let i = 0; i <= N; i++) {
		for (let j = 0; j <= N; j++) {
			const lat = mesh.minLat + (i / N) * (mesh.maxLat - mesh.minLat);
			const lng = mesh.minLng + (j / N) * (mesh.maxLng - mesh.minLng);
			pts.push([lat, lng]);
		}
	}
	return { pts, N, minLat: mesh.minLat, maxLat: mesh.maxLat, minLng: mesh.minLng, maxLng: mesh.maxLng };
}

function buildDelaunayMesh(pts, clat, clng, N, stepKmHint) {
	if (typeof Delaunator === 'undefined') return null;
	if (!pts || pts.length < 3) return null;

	let stepKm = 0;
	if (Number.isFinite(stepKmHint) && stepKmHint > 0) stepKm = stepKmHint;
	if (!stepKm && N > 0 && pts.length > 1) {
		stepKm = haversineKm(pts[0], pts[1]);
	}
	if (!Number.isFinite(stepKm) || stepKm <= 0) stepKm = 1;
	const jitterAmpKm = stepKm * C.DELAUNAY_JITTER_FACTOR;

	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const xy = new Array(pts.length);
	const xyBase = new Array(pts.length);
	for (let i = 0; i < pts.length; i++) {
		const lat = pts[i][0];
		const lng = pts[i][1];
		const x0 = (lng - clng) * C.KM_PER_DEG_LAT * cosLat;
		const y0 = (lat - clat) * C.KM_PER_DEG_LAT;
		let x = x0;
		let y = y0;
		x += (hash01(i, 0) - 0.5) * jitterAmpKm;
		y += (hash01(i, 1) - 0.5) * jitterAmpKm;
		xy[i] = [x, y];
		xyBase[i] = [x0, y0];
	}
	const maxEdgeKm = stepKm * C.DELAUNAY_MAX_EDGE_FACTOR;

	let delaunay = null;
	try {
		delaunay = Delaunator.from(xy);
	} catch (e) {
		return null;
	}
	if (!delaunay || !delaunay.triangles) return null;

	const neighbors = new Array(pts.length);
	for (let i = 0; i < neighbors.length; i++) neighbors[i] = [];

	const tris = delaunay.triangles;
	for (let t = 0; t < tris.length; t += 3) {
		const a = tris[t];
		const b = tris[t + 1];
		const c = tris[t + 2];
		addNeighborEdge(neighbors, pts, a, b, maxEdgeKm);
		addNeighborEdge(neighbors, pts, b, c, maxEdgeKm);
		addNeighborEdge(neighbors, pts, c, a, maxEdgeKm);
	}

	return { neighbors, triangles: delaunay.triangles, xy: xyBase };
}

function hash01(i, salt) {
	const x = Math.sin((i + (salt * C.DELAUNAY_JITTER_SALT_STEP) + C.DELAUNAY_JITTER_SEED) * C.DELAUNAY_JITTER_HASH_A) * C.DELAUNAY_JITTER_HASH_B;
	return x - Math.floor(x);
}

function addNeighborEdge(neighbors, pts, a, b, maxEdgeKm) {
	if (a === b) return;
	if (a < 0 || b < 0 || a >= pts.length || b >= pts.length) return;
	const d = haversineKm(pts[a], pts[b]);
	if (!Number.isFinite(d) || d > maxEdgeKm) return;
	const na = neighbors[a];
	const nb = neighbors[b];
	if (na.indexOf(b) < 0) na.push(b);
	if (nb.indexOf(a) < 0) nb.push(a);
}

function buildGridNeighbors(N) {
	const side = N + 1;
	const neighbors = new Array(side * side);
	for (let i = 0; i <= N; i++) {
		for (let j = 0; j <= N; j++) {
			const idx = i * side + j;
			const list = [];
			for (let di = -1; di <= 1; di++) {
				for (let dj = -1; dj <= 1; dj++) {
					if (!di && !dj) continue;
					const ni = i + di;
					const nj = j + dj;
					if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
					list.push(ni * side + nj);
				}
			}
			neighbors[idx] = list;
		}
	}
	return neighbors;
}

function buildJitteredSites(minLat, maxLat, minLng, maxLng, clat, clng, N, stepKmHint) {
	const sites = [];
	const side = N + 1;
	const stepLat = (maxLat - minLat) / side;
	const stepLng = (maxLng - minLng) / side;
	const jitter = clamp(C.LLOYD_JITTER_FACTOR, 0, 1);
	const margin = (1 - jitter) * 0.5;

	for (let i = 0; i < side; i++) {
		for (let j = 0; j < side; j++) {
			const cellMinLat = minLat + i * stepLat;
			const cellMinLng = minLng + j * stepLng;
			const h1 = hash01(i * side + j, 11);
			const h2 = hash01(i * side + j, 17);
			const lat = clamp(cellMinLat + (margin + h1 * jitter) * stepLat, minLat, maxLat);
			const lng = clamp(cellMinLng + (margin + h2 * jitter) * stepLng, minLng, maxLng);
			sites.push({ lat, lng });
		}
	}
	return sites;
}

function lloydRelax(sites, minLat, maxLat, minLng, maxLng, clat, clng, N, stepKmHint) {
	if (!sites || !sites.length) return sites;
	if (C.LLOYD_ITERATIONS <= 0) return sites;

	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const bounds = {
		minX: (minLng - clng) * C.KM_PER_DEG_LAT * cosLat,
		maxX: (maxLng - clng) * C.KM_PER_DEG_LAT * cosLat,
		minY: (minLat - clat) * C.KM_PER_DEG_LAT,
		maxY: (maxLat - clat) * C.KM_PER_DEG_LAT
	};

	const samplePts = [];
	for (let i = 0; i <= N; i++) {
		for (let j = 0; j <= N; j++) {
			const lat = minLat + (i / N) * (maxLat - minLat);
			const lng = minLng + (j / N) * (maxLng - minLng);
			samplePts.push({
				x: (lng - clng) * C.KM_PER_DEG_LAT * cosLat,
				y: (lat - clat) * C.KM_PER_DEG_LAT
			});
		}
	}

	let xy = sitesToXy(sites, clat, clng);
	const cellSize = stepKmHint * C.LLOYD_HASH_CELL_FACTOR;

	for (let iter = 0; iter < C.LLOYD_ITERATIONS; iter++) {
		const hash = buildSpatialHash(xy, cellSize);
		const sumX = new Array(xy.length).fill(0);
		const sumY = new Array(xy.length).fill(0);
		const count = new Array(xy.length).fill(0);

		for (let s = 0; s < samplePts.length; s++) {
			const sp = samplePts[s];
			const idx = findNearestIndex(hash, xy, cellSize, sp.x, sp.y);
			if (idx < 0) continue;
			sumX[idx] += sp.x;
			sumY[idx] += sp.y;
			count[idx] += 1;
		}

		for (let i = 0; i < xy.length; i++) {
			if (!count[i]) continue;
			const cx = sumX[i] / count[i];
			const cy = sumY[i] / count[i];
			xy[i].x = clamp(xy[i].x + (cx - xy[i].x) * C.LLOYD_ALPHA, bounds.minX, bounds.maxX);
			xy[i].y = clamp(xy[i].y + (cy - xy[i].y) * C.LLOYD_ALPHA, bounds.minY, bounds.maxY);
		}
	}

	return xyToSites(xy, clat, clng);
}

function sitesToXy(sites, clat, clng) {
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const xy = new Array(sites.length);
	for (let i = 0; i < sites.length; i++) {
		const lat = sites[i].lat;
		const lng = sites[i].lng;
		xy[i] = {
			x: (lng - clng) * C.KM_PER_DEG_LAT * cosLat,
			y: (lat - clat) * C.KM_PER_DEG_LAT
		};
	}
	return xy;
}

function xyToSites(xy, clat, clng) {
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const sites = new Array(xy.length);
	for (let i = 0; i < xy.length; i++) {
		sites[i] = {
			lat: clat + (xy[i].y / C.KM_PER_DEG_LAT),
			lng: clng + (xy[i].x / (C.KM_PER_DEG_LAT * cosLat))
		};
	}
	return sites;
}

function buildSpatialHash(xy, cellSize) {
	const map = new Map();
	for (let i = 0; i < xy.length; i++) {
		const cx = Math.floor(xy[i].x / cellSize);
		const cy = Math.floor(xy[i].y / cellSize);
		const key = cx + ',' + cy;
		let bucket = map.get(key);
		if (!bucket) { bucket = []; map.set(key, bucket); }
		bucket.push(i);
	}
	return map;
}

function findNearestIndex(hash, xy, cellSize, x, y) {
	const cx = Math.floor(x / cellSize);
	const cy = Math.floor(y / cellSize);
	let bestIdx = -1;
	let bestDist = Infinity;
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const key = (cx + dx) + ',' + (cy + dy);
			const bucket = hash.get(key);
			if (!bucket) continue;
			for (let k = 0; k < bucket.length; k++) {
				const idx = bucket[k];
				const dx2 = xy[idx].x - x;
				const dy2 = xy[idx].y - y;
				const d2 = dx2 * dx2 + dy2 * dy2;
				if (d2 < bestDist) { bestDist = d2; bestIdx = idx; }
			}
		}
	}
	return bestIdx;
}

function sampleCostsToRaster(mesh, costs, raster) {
	const clat = mesh.clat;
	const clng = mesh.clng;
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);

	const sitesXy = new Array(mesh.pts.length);
	for (let i = 0; i < mesh.pts.length; i++) {
		sitesXy[i] = {
			x: (mesh.pts[i][1] - clng) * C.KM_PER_DEG_LAT * cosLat,
			y: (mesh.pts[i][0] - clat) * C.KM_PER_DEG_LAT
		};
	}

	const cellSize = Math.max(1, mesh.stepKmHint) * C.RASTER_HASH_CELL_FACTOR;
	const hash = buildSpatialHash(sitesXy, cellSize);
	const out = new Array(raster.pts.length).fill(Infinity);

	for (let i = 0; i < raster.pts.length; i++) {
		const lat = raster.pts[i][0];
		const lng = raster.pts[i][1];
		const x = (lng - clng) * C.KM_PER_DEG_LAT * cosLat;
		const y = (lat - clat) * C.KM_PER_DEG_LAT;
		const idx = findNearestIndex(hash, sitesXy, cellSize, x, y);
		if (idx < 0) continue;
		out[i] = costs[idx];
	}

	return out;
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

function computeIsoPolygon(grid, costs, maxBandKm) {
	// Build a point FeatureCollection for Turf isobands.
	// Water/unreached points become very large to prevent inclusion.
	const pts = [];
	const BIG = maxBandKm * C.ISOBAND_UNREACHED_COST_FACTOR;
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

function computeIsoPolygonSites(mesh, costs, maxBandKm) {
	if (!mesh || !mesh.triangles || !mesh.xy) {
		const raster = buildRasterGrid(mesh);
		const rasterCosts = sampleCostsToRaster(mesh, costs, raster);
		return computeIsoPolygon(raster, rasterCosts, maxBandKm);
	}
	const thr = maxBandKm;
	const outCost = thr * C.ISOBAND_UNREACHED_COST_FACTOR;
	const tris = mesh.triangles;
	const xy = mesh.xy;
	const segments = [];

	for (let t = 0; t < tris.length; t += 3) {
		const a = tris[t];
		const b = tris[t + 1];
		const c = tris[t + 2];
		const va0 = costs[a];
		const vb0 = costs[b];
		const vc0 = costs[c];
		const va = Number.isFinite(va0) ? va0 : outCost;
		const vb = Number.isFinite(vb0) ? vb0 : outCost;
		const vc = Number.isFinite(vc0) ? vc0 : outCost;

		const ina = va <= thr;
		const inb = vb <= thr;
		const inc = vc <= thr;
		const insideCount = (ina ? 1 : 0) + (inb ? 1 : 0) + (inc ? 1 : 0);
		if (insideCount === 0 || insideCount === 3) continue;

		const pts = [];
		addContourPoint(pts, xy[a], xy[b], va, vb, thr);
		addContourPoint(pts, xy[b], xy[c], vb, vc, thr);
		addContourPoint(pts, xy[c], xy[a], vc, va, thr);
		if (pts.length === 2) segments.push([pts[0], pts[1]]);
	}

	const rings = stitchContourSegments(segments);
	if (!rings.length) return null;

	const polys = [];
	let bestRing = null;
	let bestArea = -Infinity;
	for (const ringXy of rings) {
		if (ringXy.length < C.CONTOUR_MIN_RING_POINTS) continue;
		let ring = ringXy.map(p => xyToLngLat(mesh, p));
		if (ring.length < C.CONTOUR_MIN_RING_POINTS) continue;
		if (!samePoint(ring[0], ring[ring.length - 1])) ring.push(ring[0]);
		const area = signedAreaLngLat(ring);
		if (area < 0) ring.reverse();
		ring = beautifyRing(ring, mesh);
		const absArea = Math.abs(area);
		if (absArea > bestArea) {
			bestArea = absArea;
			bestRing = ring;
		}
		polys.push([ring]);
	}

	if (!polys.length) return null;
	const geo = polys.length === 1 ? turf.polygon(polys[0], { kind: 'sites' }) : turf.multiPolygon(polys, { kind: 'sites' });
	return { ring: bestRing, geo };
}

function addContourPoint(out, p0, p1, v0, v1, thr) {
	const in0 = v0 <= thr;
	const in1 = v1 <= thr;
	if (in0 === in1) return;
	const dv = v1 - v0;
	if (!dv) return;
	const t = (thr - v0) / dv;
	if (t <= 0 || t >= 1) return;
	out.push([
		p0[0] + (p1[0] - p0[0]) * t,
		p0[1] + (p1[1] - p0[1]) * t
	]);
}

function stitchContourSegments(segments) {
	if (!segments.length) return [];
	const keyScale = C.CONTOUR_KEY_SCALE;
	const segs = new Array(segments.length);
	const byKey = {};
	for (let i = 0; i < segments.length; i++) {
		const a = segments[i][0];
		const b = segments[i][1];
		const ka = pointKey(a, keyScale);
		const kb = pointKey(b, keyScale);
		segs[i] = { a, b, ka, kb, used: false };
		if (!byKey[ka]) byKey[ka] = [];
		if (!byKey[kb]) byKey[kb] = [];
		byKey[ka].push(i);
		byKey[kb].push(i);
	}

	const rings = [];
	for (let i = 0; i < segs.length; i++) {
		if (segs[i].used) continue;
		const ring = [];
		let curSeg = segs[i];
		curSeg.used = true;
		let startKey = curSeg.ka;
		let prevKey = curSeg.ka;
		let curKey = curSeg.kb;
		ring.push(curSeg.a);
		ring.push(curSeg.b);

		let steps = 0;
		while (curKey !== startKey && steps < C.CONTOUR_MAX_STEPS) {
			steps++;
			const list = byKey[curKey] || [];
			let nextId = -1;
			for (const sid of list) {
				if (segs[sid].used) continue;
				nextId = sid;
				break;
			}
			if (nextId < 0) break;
			const s = segs[nextId];
			s.used = true;
			const nextKey = s.ka === curKey ? s.kb : s.ka;
			const nextPt = s.ka === curKey ? s.b : s.a;
			ring.push(nextPt);
			prevKey = curKey;
			curKey = nextKey;
		}

		if (ring.length >= C.CONTOUR_MIN_RING_POINTS) rings.push(ring);
	}

	return rings;
}

function pointKey(p, scale) {
	return String(Math.round(p[0] * scale)) + ':' + String(Math.round(p[1] * scale));
}

function xyToLngLat(mesh, p) {
	const refLatRad = mesh.clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const lng = mesh.clng + (p[0] / (C.KM_PER_DEG_LAT * cosLat));
	const lat = mesh.clat + (p[1] / C.KM_PER_DEG_LAT);
	return [lng, lat];
}

function signedAreaLngLat(ring) {
	let a = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const x0 = ring[i][0];
		const y0 = ring[i][1];
		const x1 = ring[i + 1][0];
		const y1 = ring[i + 1][1];
		a += (x0 * y1) - (x1 * y0);
	}
	return a * 0.5;
}

function samePoint(a, b) {
	if (!a || !b) return false;
	return a[0] === b[0] && a[1] === b[1];
}


function beautifyRing(ring, mesh) {
	if (!ring || ring.length < C.CONTOUR_MIN_RING_POINTS) return ring;

	const orig = ring;
	let ringXy = ring.map(p => lngLatToXy(mesh, p));

	ringXy = simplifyRingXy(ringXy, C.CONTOUR_SIMPLIFY_MIN_KM);
	for (let i = 0; i < C.CONTOUR_SMOOTH_ITERATIONS; i++) {
		ringXy = chaikinSmoothClosed(ringXy);
	}
	let out = ringXy.map(p => xyToLngLat(mesh, p));

	if (out.length < C.CONTOUR_MIN_RING_POINTS) return orig;
	if (!samePoint(out[0], out[out.length - 1])) out.push(out[0]);

	const poly0 = turf.polygon([orig]);
	const poly1 = turf.polygon([out]);

	if (turf.kinks(poly1).features.length) return orig;

	const a0 = turf.area(poly0);
	const a1 = turf.area(poly1);
	if (!a0 || !a1) return orig;
	const ratio = a1 / a0;
	if (ratio < C.CONTOUR_AREA_RATIO_MIN || ratio > C.CONTOUR_AREA_RATIO_MAX) return orig;

	return out;
}

function lngLatToXy(mesh, p) {
	const refLatRad = mesh.clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const x = (p[0] - mesh.clng) * (C.KM_PER_DEG_LAT * cosLat);
	const y = (p[1] - mesh.clat) * C.KM_PER_DEG_LAT;
	return [x, y];
}

function simplifyRingXy(ringXy, minKm) {
	if (!ringXy || ringXy.length < 4) return ringXy;
	const out = [ringXy[0]];
	for (let i = 1; i < ringXy.length; i++) {
		const prev = out[out.length - 1];
		const cur = ringXy[i];
		if (distKmXy(prev, cur) >= minKm) out.push(cur);
	}
	if (out.length < 4) return ringXy;
	if (!samePoint(out[0], out[out.length - 1])) out.push(out[0]);
	return out;
}

function distKmXy(a, b) {
	const dx = a[0] - b[0];
	const dy = a[1] - b[1];
	return Math.sqrt((dx * dx) + (dy * dy));
}

function chaikinSmoothClosed(ringXy) {
	if (!ringXy || ringXy.length < 4) return ringXy;
	const out = [];
	for (let i = 0; i < ringXy.length - 1; i++) {
		const p0 = ringXy[i];
		const p1 = ringXy[i + 1];
		out.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
		out.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
	}
	out.push(out[0]);
	return out;
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
