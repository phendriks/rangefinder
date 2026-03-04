// mesh.js
// Mesh and site generation helpers for range-worker.

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
