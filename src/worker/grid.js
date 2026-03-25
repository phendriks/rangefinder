// grid.js
// Grid helpers for range-worker.

function getGridSize(maxKm)
{
	return clampNumber(Math.round(maxKm / C.GRID_SIZE_DIVISOR), C.GRID_SIZE_MIN, C.GRID_SIZE_MAX);
}

function buildRasterGrid(mesh)
{
	const gridSize = mesh.N;
	const side = gridSize + 1;
	const pts = new Array(side * side);
	let idx = 0;

	for (let row = 0; row <= gridSize; row++) {
		const lat = mesh.minLat + (row / gridSize) * (mesh.maxLat - mesh.minLat);
		for (let col = 0; col <= gridSize; col++) {
			const lng = mesh.minLng + (col / gridSize) * (mesh.maxLng - mesh.minLng);
			pts[idx++] = [lat, lng];
		}
	}

	return {
		pts,
		N: gridSize,
		minLat: mesh.minLat,
		maxLat: mesh.maxLat,
		minLng: mesh.minLng,
		maxLng: mesh.maxLng
	};
}

function buildGridNeighbors(gridSize)
{
	const side = gridSize + 1;
	const neighbors = new Array(side * side);

	for (let row = 0; row <= gridSize; row++) {
		for (let col = 0; col <= gridSize; col++) {
			const idx = row * side + col;
			const list = [];
			for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
				for (let deltaCol = -1; deltaCol <= 1; deltaCol++) {
					if (!deltaRow && !deltaCol) continue;
					const nextRow = row + deltaRow;
					const nextCol = col + deltaCol;
					if (nextRow < 0 || nextCol < 0 || nextRow > gridSize || nextCol > gridSize) continue;
					list.push(nextRow * side + nextCol);
				}
			}
			neighbors[idx] = list;
		}
	}

	return neighbors;
}
