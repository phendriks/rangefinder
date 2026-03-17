// grid.js
// Grid and neighbor helpers for range-worker.

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

	// IMPORTANT: shape-constants.js defines GRID_SIZE_DIVISOR as a divisor, not a fixed N.
	// N grows with range: N = ClampNumber(outerKm / divisor, min, max)
	let N = ClampNumber(Math.round(maxKm / C.GRID_SIZE_DIVISOR), C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);


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
function buildRasterGrid(mesh) {
	const N = mesh.N;
	const side = N + 1;
	const pts = new Array(side * side);
	let idx = 0;
	for (let i = 0; i <= N; i++) {
		const lat = mesh.minLat + (i / N) * (mesh.maxLat - mesh.minLat);
		for (let j = 0; j <= N; j++) {
			const lng = mesh.minLng + (j / N) * (mesh.maxLng - mesh.minLng);
			pts[idx++] = [lat, lng];
		}
	}
	return { pts, N, minLat: mesh.minLat, maxLat: mesh.maxLat, minLng: mesh.minLng, maxLng: mesh.maxLng };
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
