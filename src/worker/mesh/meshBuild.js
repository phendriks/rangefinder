// meshBuild.js
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

	let N = ClampNumber(Math.round(maxKm / C.GRID_SIZE_DIVISOR), C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);

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
	const landTypes = cellTypes;
	const speedClasses = new Array(sites.length).fill(null);
	const roadBands = new Array(sites.length).fill(null);

	const mesh = {
		pts,
		cellTypes,
		landTypes,
		speedClasses,
		roadBands,
		N,
		minLat,
		maxLat,
		minLng,
		maxLng,
		neighbors: null,
		triangles: null,
		xy: null,
		stepKmHint,
		clat,
		clng
	};

	if (typeof AssignRoadEnums === 'function') {
		AssignRoadEnums(mesh);
	}

	let delaunayMesh = buildDelaunayMesh(pts, clat, clng, 0, stepKmHint);
	if (!delaunayMesh) {
		delaunayMesh = {
			neighbors: buildGridNeighbors(N),
			triangles: null,
			xy: null
		};
	}

	mesh.neighbors = delaunayMesh.neighbors;
	mesh.triangles = delaunayMesh.triangles;
	mesh.xy = delaunayMesh.xy;
	mesh.edgeCosts = buildEdgeCosts(mesh);
	mesh.originHash = buildMeshOriginHash(mesh);
	return mesh;
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
		x += (Hash01(i, 0) - 0.5) * jitterAmpKm;
		y += (Hash01(i, 1) - 0.5) * jitterAmpKm;
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


function addNeighborEdge(neighbors, pts, a, b, maxEdgeKm) {
	if (a === b) return;
	if (a < 0 || b < 0 || a >= pts.length || b >= pts.length) return;
	const d = approxPointDistanceKm(pts[a], pts[b]);
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
	const jitter = ClampNumber(C.LLOYD_JITTER_FACTOR, 0, 1);
	const margin = (1 - jitter) * 0.5;

	for (let i = 0; i < side; i++) {
		for (let j = 0; j < side; j++) {
			const cellMinLat = minLat + i * stepLat;
			const cellMinLng = minLng + j * stepLng;
			const h1 = Hash01(i * side + j, 11);
			const h2 = Hash01(i * side + j, 17);
			const lat = ClampNumber(cellMinLat + (margin + h1 * jitter) * stepLat, minLat, maxLat);
			const lng = ClampNumber(cellMinLng + (margin + h2 * jitter) * stepLng, minLng, maxLng);
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

	const samplePts = new Array((N + 1) * (N + 1));
	let sIdx = 0;
	for (let i = 0; i <= N; i++) {
		const y = (minLat + (i / N) * (maxLat - minLat) - clat) * C.KM_PER_DEG_LAT;
		for (let j = 0; j <= N; j++) {
			const x = (minLng + (j / N) * (maxLng - minLng) - clng) * C.KM_PER_DEG_LAT * cosLat;
			samplePts[sIdx++] = [x, y];
		}
	}

	let xy = sitesToXy(sites, clat, clng);
	const cellSize = stepKmHint * C.LLOYD_HASH_CELL_FACTOR;

	for (let iter = 0; iter < C.LLOYD_ITERATIONS; iter++) {
		const hash = BuildSpatialHash(xy, cellSize);
		const sumX = new Float64Array(xy.length);
		const sumY = new Float64Array(xy.length);
		const count = new Uint16Array(xy.length);

		for (let s = 0; s < samplePts.length; s++) {
			const sp = samplePts[s];
			const idx = FindNearestIndex(hash, xy, cellSize, sp[0], sp[1]);
			if (idx < 0) continue;
			sumX[idx] += sp[0];
			sumY[idx] += sp[1];
			count[idx] += 1;
		}

		for (let i = 0; i < xy.length; i++) {
			if (!count[i]) continue;
			const px = xy[i][0];
			const py = xy[i][1];
			const cx = sumX[i] / count[i];
			const cy = sumY[i] / count[i];
			xy[i][0] = ClampNumber(px + (cx - px) * C.LLOYD_ALPHA, bounds.minX, bounds.maxX);
			xy[i][1] = ClampNumber(py + (cy - py) * C.LLOYD_ALPHA, bounds.minY, bounds.maxY);
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
		xy[i] = [
			(lng - clng) * C.KM_PER_DEG_LAT * cosLat,
			(lat - clat) * C.KM_PER_DEG_LAT
		];
	}
	return xy;
}

function xyToSites(xy, clat, clng) {
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const invLngScale = 1 / (C.KM_PER_DEG_LAT * cosLat);
	const invLatScale = 1 / C.KM_PER_DEG_LAT;
	const sites = new Array(xy.length);
	for (let i = 0; i < xy.length; i++) {
		const p = xy[i];
		sites[i] = {
			lat: clat + (p[1] * invLatScale),
			lng: clng + (p[0] * invLngScale)
		};
	}
	return sites;
}
function sampleCostsToRaster(mesh, costs, raster) {
	const clat = mesh.clat;
	const clng = mesh.clng;
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const sitesXy = mesh.xy;

	const cellSize = Math.max(1, mesh.stepKmHint) * C.RASTER_HASH_CELL_FACTOR;
	const hash = BuildSpatialHash(sitesXy, cellSize);
	const out = new Array(raster.pts.length).fill(Infinity);

	for (let i = 0; i < raster.pts.length; i++) {
		const lat = raster.pts[i][0];
		const lng = raster.pts[i][1];
		const x = (lng - clng) * C.KM_PER_DEG_LAT * cosLat;
		const y = (lat - clat) * C.KM_PER_DEG_LAT;
		const idx = FindNearestIndex(hash, sitesXy, cellSize, x, y);
		if (idx < 0) continue;
		out[i] = costs[idx];
	}

	return out;
}


function approxPointDistanceKm(a, b) {
	const avgLatRad = ((a[0] + b[0]) * 0.5) * Math.PI / 180;
	const dy = (b[0] - a[0]) * C.KM_PER_DEG_LAT;
	const dx = (b[1] - a[1]) * C.KM_PER_DEG_LAT * Math.cos(avgLatRad);
	return Math.sqrt((dx * dx) + (dy * dy));
}

function buildEdgeCosts(mesh) {
	const neighbors = mesh.neighbors || [];
	const cellTypes = mesh.cellTypes || [];
	const speedClasses = mesh.speedClasses || [];
	const roadBands = mesh.roadBands || [];
	const xy = mesh.xy || [];
	const edgeCosts = new Array(neighbors.length);

	for (let i = 0; i < neighbors.length; i++) {
		const nbs = neighbors[i] || [];
		const fromCellType = cellTypes[i];
		const fromBands = roadBands[i];
		const speedClass = speedClasses[i];
		const row = new Array(nbs.length);

		for (let k = 0; k < nbs.length; k++) {
			const nIdx = nbs[k];
			const cellType = cellTypes[nIdx];
			const dx = xy[nIdx][0] - xy[i][0];
			const dy = xy[nIdx][1] - xy[i][1];
			const stepKm = Math.sqrt((dx * dx) + (dy * dy));

			if ((cellType === C.CELL_CROSSING) || (fromCellType === C.CELL_CROSSING)) {
				row[k] = stepKm * C.CROSSING_DISTANCE_FACTOR;
				continue;
			}

			if (!C.USE_SPEEDCLASS_COST) {
				row[k] = stepKm;
				continue;
			}

			if (C.REQUIRE_ROADBANDS && (!fromBands || fromBands.length !== 4)) {
				row[k] = Infinity;
				continue;
			}

			if (!Number.isFinite(speedClass) || speedClass <= 0) {
				row[k] = Infinity;
				continue;
			}

			row[k] = stepKm / speedClass;
		}

		edgeCosts[i] = row;
	}

	return edgeCosts;
}

function buildMeshOriginHash(mesh) {
	if (!mesh || !mesh.xy || !mesh.xy.length) return null;
	const cellSize = Math.max(1, mesh.stepKmHint) * C.RASTER_HASH_CELL_FACTOR;
	return {
		cellSize,
		hash: BuildSpatialHash(mesh.xy, cellSize)
	};
}
