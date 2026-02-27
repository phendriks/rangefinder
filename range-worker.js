'use strict';

importScripts(
		'https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js',
		'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js',
		'constants.js'
);

let landFeatures = null;

async function ensureLandData() {
		if (landFeatures) return;

		const resp = await fetch(C.LAND_DATA_URL);
		if (!resp.ok) throw new Error(`Land data fetch failed (${resp.status})`);

		const topo = await resp.json();
		const collection = topojson.feature(topo, topo.objects.land);

		landFeatures = collection.features;
}

function isCrossingPoint(lat, lng) {
		for (const z of C.CROSSING_ZONES) {
				if (lat >= z[1] && lat <= z[2] && lng >= z[3] && lng <= z[4]) return true;
		}
		return false;
}

function isLandPoint(lat, lng) {
		const pt = turf.point([lng, lat]);

		for (const f of landFeatures) {
				if (turf.booleanPointInPolygon(pt, f)) return true;
		}

		return false;
}

function classifyCell(lat, lng) {
		if (isCrossingPoint(lat, lng)) return C.CELL_CROSSING;
		if (isLandPoint(lat, lng)) return C.CELL_LAND;
		return C.CELL_WATER;
}

function buildGrid(originLat, originLng, radiusKm) {
		const N = Math.max(
				C.GRID_SIZE_MIN,
				Math.min(C.GRID_SIZE_MAX, Math.round(radiusKm / C.GRID_SIZE_DIVISOR))
		);

		const latKmPerDeg = 111.32;
		const lngKmPerDeg = 111.32 * Math.cos(originLat * Math.PI / 180);

		const latSpan = (radiusKm * (1 + C.GRID_MARGIN_FACTOR)) / latKmPerDeg;
		const lngSpan = (radiusKm * (1 + C.GRID_MARGIN_FACTOR)) / lngKmPerDeg;

		const minLat = originLat - latSpan;
		const maxLat = originLat + latSpan;
		const minLng = originLng - lngSpan;
		const maxLng = originLng + lngSpan;

		const pts = [];

		for (let i = 0; i < N; i++) {
				const lat = minLat + (i / (N - 1)) * (maxLat - minLat);

				for (let j = 0; j < N; j++) {
						const lng = minLng + (j / (N - 1)) * (maxLng - minLng);
						pts.push({ lat, lng, cell: classifyCell(lat, lng) });
				}
		}

		return { pts, N, minLat, maxLat, minLng, maxLng };
}

function gridIndexFromLatLng(lat, lng, grid) {
		const row = Math.round(((lat - grid.minLat) / (grid.maxLat - grid.minLat)) * (grid.N - 1));
		const col = Math.round(((lng - grid.minLng) / (grid.maxLng - grid.minLng)) * (grid.N - 1));

		if (row < 0 || row >= grid.N || col < 0 || col >= grid.N) return -1;

		return row * grid.N + col;
}

class MinHeap {
		constructor() {
				this.items = [];
		}

		push(node) {
				this.items.push(node);
				this.bubbleUp(this.items.length - 1);
		}

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

function stepMultiplier(cell) {
		return cell === C.CELL_CROSSING ? C.CROSSING_DISTANCE_FACTOR : 1;
}

function computeDistanceField(grid, maxKm, originLat, originLng) {
		const { pts, N } = grid;
		const costs = new Array(pts.length).fill(Infinity);

		const originIdx = gridIndexFromLatLng(originLat, originLng, grid);
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

				const row = Math.floor(idx / N);
				const col = idx % N;

				for (let dr = -1; dr <= 1; dr++) {
						for (let dc = -1; dc <= 1; dc++) {
								if (!C.NEIGHBOR_MODE_8 && Math.abs(dr) + Math.abs(dc) !== 1) continue;
								if (dr === 0 && dc === 0) continue;

								const nr = row + dr;
								const nc = col + dc;

								if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;

								const nIdx = nr * N + nc;
								const cell = pts[nIdx].cell;

								if (cell === C.CELL_WATER) continue;

								const stepKm = turf.distance(
										turf.point([pts[idx].lng, pts[idx].lat]),
										turf.point([pts[nIdx].lng, pts[nIdx].lat]),
										{ units: C.DISTANCE_UNITS }
								);

								const newCost = baseCost + stepKm * stepMultiplier(cell);

								if (newCost < costs[nIdx] && newCost <= maxKm) {
										costs[nIdx] = newCost;
										heap.push({ idx: nIdx, cost: newCost });
								}
						}
				}
		}

		return costs;
}

function extractEndpointAtBearing(originLat, originLng, bearingDeg, maxKm, grid, costs) {
		const origin = turf.point([originLng, originLat]);
		const step = maxKm / C.EXTRACTION_STEPS_DIVISOR;

		let lastValid = [originLng, originLat];

		for (let d = 0; d <= maxKm; d += step) {
				const pt = turf.destination(origin, d, bearingDeg, { units: C.DISTANCE_UNITS });
				const [lng, lat] = pt.geometry.coordinates;

				const idx = gridIndexFromLatLng(lat, lng, grid);
				if (idx < 0) break;
				if (grid.pts[idx].cell === C.CELL_WATER) break;
				if (costs[idx] > maxKm) break;

				lastValid = [lng, lat];
		}

		return lastValid;
}

self.onmessage = async function (evt) {
		const { clat, clng, outerKm, innerKm } = evt.data;

		const originLat = clat;
		const originLng = clng;

		try {
				self.postMessage({ type: 'status', msg: 'Loading land data…' });
				await ensureLandData();

				if (!isLandPoint(originLat, originLng) && !isCrossingPoint(originLat, originLng)) {
						self.postMessage({ type: 'error', msg: 'Origin must be on land.' });
						return;
				}

				self.postMessage({ type: 'status', msg: 'Building grid…' });
				const grid = buildGrid(originLat, originLng, outerKm);

				self.postMessage({
						type: 'grid',
						pts: grid.pts.filter(p => p.cell !== C.CELL_WATER)
				});

				self.postMessage({ type: 'status', msg: 'Computing propagation field…' });

				const outerCosts = computeDistanceField(grid, outerKm, originLat, originLng);
				const innerCosts = computeDistanceField(grid, innerKm, originLat, originLng);

				const outerRing = [];
				const innerRing = [];

				for (let i = 0; i < C.VECTOR_COUNT; i++) {
						const bearingDeg = i * C.VECTOR_STEP_DEG;

						outerRing.push(extractEndpointAtBearing(originLat, originLng, bearingDeg, outerKm, grid, outerCosts));
						innerRing.push(extractEndpointAtBearing(originLat, originLng, bearingDeg, innerKm, grid, innerCosts));

						if (C.VECTOR_COUNT >= 12 && i % Math.max(1, Math.floor(C.VECTOR_COUNT / 12)) === 0) {
								const pct = Math.min(99, Math.round((i / C.VECTOR_COUNT) * 100));
								self.postMessage({ type: 'progress', pct });
						}
				}

				const outerClosed = [...outerRing, outerRing[0]];
				const innerClosed = [...innerRing, innerRing[0]];

				const outerGeo = {
						type: 'Feature',
						geometry: { type: 'Polygon', coordinates: [outerClosed] },
						properties: {}
				};

				const innerGeo = {
						type: 'Feature',
						geometry: { type: 'Polygon', coordinates: [innerClosed] },
						properties: {}
				};

				self.postMessage({ type: 'done', outerRing, innerRing, outerGeo, innerGeo });
		} catch (err) {
				self.postMessage({
						type: 'error',
						msg: err && err.message ? err.message : String(err)
				});
		}
};
