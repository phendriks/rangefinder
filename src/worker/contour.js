// contour.js
// Contour extraction helpers for range-worker.

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
