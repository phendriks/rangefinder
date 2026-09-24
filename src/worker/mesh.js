// mesh.js
// Mesh and site generation helpers for range-worker.

function buildSitesMesh(clat, clng, maxKm, vectorRoadData) {
	const marginKm = maxKm * C.GRID_MARGIN_FACTOR;
	const rKm = maxKm + marginKm;

	const latDelta = rKm / C.KM_PER_DEG_LAT;
	const lngDelta = rKm / (C.KM_PER_DEG_LAT * Math.cos(clat * Math.PI / 180));

	const minLat = clat - latDelta;
	const maxLat = clat + latDelta;
	const minLng = clng - lngDelta;
	const maxLng = clng + lngDelta;

	let N = getGridSize(maxKm);

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
	const haloSites = buildVectorRoadHaloSites(
		vectorRoadData,
		minLat,
		maxLat,
		minLng,
		maxLng,
		clat,
		stepKmHint
	);
	if (haloSites.length) sites = sites.concat(haloSites);
	const backgroundSiteCount = sites.length;
	const roadNodes = vectorRoadData && Array.isArray(vectorRoadData.nodes) ? vectorRoadData.nodes : [];

	const pts = new Array(sites.length + roadNodes.length);
	const cellTypes = new Array(pts.length);
	for (let i = 0; i < sites.length; i++) {
		pts[i] = [sites[i].lat, sites[i].lng];
		cellTypes[i] = classifyCell(sites[i].lat, sites[i].lng);
	}
	for (let i = 0; i < roadNodes.length; i++) {
		const pointIndex = backgroundSiteCount + i;
		pts[pointIndex] = [roadNodes[i][0], roadNodes[i][1]];
		const classified = classifyCell(roadNodes[i][0], roadNodes[i][1]);
		cellTypes[pointIndex] = roadNodes[i][2] && classified === C.CELL_WATER ? C.CELL_CROSSING : classified;
	}
	const landTypes = cellTypes;
	const speedClasses = new Array(pts.length).fill(null);
	const roadBands = new Array(pts.length).fill(null);
	const terrainSeverities = new Array(pts.length).fill(null);
	const terrainScores = new Array(pts.length).fill(null);

	const mesh = {
		pts,
		cellTypes,
		landTypes,
		speedClasses,
		roadBands,
		terrainSeverities,
		terrainScores,
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
		clng,
		backgroundSiteCount,
		haloSiteCount: haloSites.length,
		vectorRoadEdgeCosts: null
	};

	if (typeof assignTileEnums === 'function') {
		assignTileEnums(mesh);
	}

	let delaunayMesh = buildDelaunayMesh(pts, clat, clng, 0, stepKmHint);
	if (!delaunayMesh) {
		const gridNeighbors = buildGridNeighbors(N);
		while (gridNeighbors.length < pts.length) gridNeighbors.push([]);
		delaunayMesh = {
			neighbors: gridNeighbors,
			triangles: null,
			xy: null
		};
	}

	mesh.neighbors = delaunayMesh.neighbors;
	mesh.triangles = delaunayMesh.triangles;
	mesh.xy = delaunayMesh.xy;
	mesh.vectorRoadEdgeCosts = addExplicitVectorRoadEdges(mesh, vectorRoadData);
	mesh.edgeCosts = buildEdgeCosts(mesh);
	mesh.originHash = buildMeshOriginHash(mesh);
	return mesh;
}

function buildVectorRoadHaloSites(vectorRoadData, minLat, maxLat, minLng, maxLng, clat, stepKmHint) {
	if (!vectorRoadData || !Array.isArray(vectorRoadData.nodes) || !Array.isArray(vectorRoadData.edges)) return [];
	const maxNodes = Math.max(0, Math.floor(Number(C.VECTOR_ROAD_HALO_MAX_NODES) || 0));
	if (!maxNodes || !vectorRoadData.nodes.length || !vectorRoadData.edges.length) return [];

	const offsetKm = clampNumber(
		stepKmHint * C.VECTOR_ROAD_HALO_OFFSET_FACTOR,
		C.VECTOR_ROAD_HALO_MIN_OFFSET_KM,
		C.VECTOR_ROAD_HALO_MAX_OFFSET_KM
	);
	if (!Number.isFinite(offsetKm) || offsetKm <= 0) return [];

	const validEdges = [];
	for (let edgeIndex = 0; edgeIndex < vectorRoadData.edges.length; edgeIndex++) {
		const edge = vectorRoadData.edges[edgeIndex];
		if (!Array.isArray(edge) || edge.length < 2) continue;
		const fromIndex = Number(edge[0]);
		const toIndex = Number(edge[1]);
		if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) continue;
		if (fromIndex < 0 || toIndex < 0 || fromIndex >= vectorRoadData.nodes.length || toIndex >= vectorRoadData.nodes.length) continue;
		validEdges.push([fromIndex, toIndex]);
	}
	if (!validEdges.length) return [];

	// Each selected road segment contributes one ordinary-cost point on either side.
	// Sampling the edge list evenly keeps the refinement geographically distributed
	// when the cap is lower than the number of available road segments.
	const edgeBudget = Math.max(1, Math.floor(maxNodes / 2));
	const selectedEdgeCount = Math.min(edgeBudget, validEdges.length);
	const edgeStride = validEdges.length / selectedEdgeCount;
	const latKm = C.KM_PER_DEG_LAT;
	const cosLat = Math.max(0.05, Math.abs(Math.cos(clat * Math.PI / 180)));
	const lngKm = latKm * cosLat;
	const dedupeKm = Math.max(0.75, Math.min(2, offsetKm * 0.35));
	const coordinateIndex = new Set();
	const sites = [];

	for (let selectedIndex = 0; selectedIndex < selectedEdgeCount && sites.length < maxNodes; selectedIndex++) {
		const edge = validEdges[Math.floor(selectedIndex * edgeStride)];
		const from = vectorRoadData.nodes[edge[0]];
		const to = vectorRoadData.nodes[edge[1]];
		if (!Array.isArray(from) || !Array.isArray(to)) continue;

		const dx = (to[1] - from[1]) * lngKm;
		const dy = (to[0] - from[0]) * latKm;
		const segmentKm = Math.sqrt((dx * dx) + (dy * dy));
		if (!Number.isFinite(segmentKm) || segmentKm <= 0) continue;
		const midpointLat = (from[0] + to[0]) * 0.5;
		const midpointLng = (from[1] + to[1]) * 0.5;
		const normalX = -dy / segmentKm;
		const normalY = dx / segmentKm;

		for (let side = -1; side <= 1 && sites.length < maxNodes; side += 2) {
			const lat = midpointLat + (normalY * offsetKm * side) / latKm;
			const lng = midpointLng + (normalX * offsetKm * side) / lngKm;
			if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
			const key = Math.round(lat * latKm / dedupeKm) + ',' +
				Math.round(lng * lngKm / dedupeKm);
			if (coordinateIndex.has(key)) continue;
			coordinateIndex.add(key);
			sites.push({ lat, lng });
		}
	}

	return sites;
}

function addExplicitVectorRoadEdges(mesh, vectorRoadData) {
	if (!vectorRoadData || !Array.isArray(vectorRoadData.edges)) return null;
	const overrides = new Map();
	const offset = mesh.backgroundSiteCount;
	for (let edgeIndex = 0; edgeIndex < vectorRoadData.edges.length; edgeIndex++) {
		const edge = vectorRoadData.edges[edgeIndex];
		if (!Array.isArray(edge) || edge.length < 3) continue;
		const a = offset + Number(edge[0]);
		const b = offset + Number(edge[1]);
		const speedKmh = Number(edge[2]);
		if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < offset || b < offset) continue;
		if (a >= mesh.pts.length || b >= mesh.pts.length || !Number.isFinite(speedKmh) || speedKmh <= 0) continue;
		if (mesh.neighbors[a].indexOf(b) < 0) mesh.neighbors[a].push(b);
		if (mesh.neighbors[b].indexOf(a) < 0) mesh.neighbors[b].push(a);
		const distanceKm = haversineKm(mesh.pts[a], mesh.pts[b]);
		const cost = distanceKm * (C.MODE_SPEED_KMH.drive / speedKmh);
		const key = a < b ? a + ',' + b : b + ',' + a;
		const existing = overrides.get(key);
		if (existing === undefined || cost < existing) overrides.set(key, cost);
	}
	return overrides.size ? overrides : null;
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
	const jitter = clampNumber(C.LLOYD_JITTER_FACTOR, 0, 1);
	const margin = (1 - jitter) * 0.5;

	for (let i = 0; i < side; i++) {
		for (let j = 0; j < side; j++) {
			const cellMinLat = minLat + i * stepLat;
			const cellMinLng = minLng + j * stepLng;
			const h1 = hash01(i * side + j, 11);
			const h2 = hash01(i * side + j, 17);
			const lat = clampNumber(cellMinLat + (margin + h1 * jitter) * stepLat, minLat, maxLat);
			const lng = clampNumber(cellMinLng + (margin + h2 * jitter) * stepLng, minLng, maxLng);
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
		const hash = buildSpatialHash(xy, cellSize);
		const sumX = new Float64Array(xy.length);
		const sumY = new Float64Array(xy.length);
		const count = new Uint16Array(xy.length);

		for (let s = 0; s < samplePts.length; s++) {
			const sp = samplePts[s];
			const idx = findNearestIndex(hash, xy, cellSize, sp[0], sp[1]);
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
			xy[i][0] = clampNumber(px + (cx - px) * C.LLOYD_ALPHA, bounds.minX, bounds.maxX);
			xy[i][1] = clampNumber(py + (cy - py) * C.LLOYD_ALPHA, bounds.minY, bounds.maxY);
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
			let vectorRoadCost;
			if (mesh.vectorRoadEdgeCosts) {
				const edgeKey = i < nIdx ? i + ',' + nIdx : nIdx + ',' + i;
				vectorRoadCost = mesh.vectorRoadEdgeCosts.get(edgeKey);
			}
			if (vectorRoadCost !== undefined) {
				row[k] = vectorRoadCost;
				continue;
			}
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
		hash: buildSpatialHash(mesh.xy, cellSize)
	};
}
