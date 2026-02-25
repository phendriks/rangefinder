/**
 * range-worker.js
 *
 * Runs in a Web Worker (background thread) so the UI never freezes.
 *
 * Steps:
 *  1. Load Natural Earth 110m land polygons via jsDelivr CDN (cached after first use)
 *  2. Build an N×N grid of land/water booleans covering the range area
 *  3. Fire 72 vectors (every 5°) from the origin for both outer and inner radii
 *  4. Each vector walks in steps; if it hits water it tries to redirect ≤ 60°,
 *     otherwise it stops
 *  5. Post results back to the main thread
 *
 * Messages sent TO worker:   { clat, clng, outerKm, innerKm }
 * Messages received FROM worker:
 *   { type: 'status',   msg }
 *   { type: 'grid',     pts: [{lat, lng, land}] }
 *   { type: 'progress', pct }
 *   { type: 'done',     outerRing, innerRing, outerGeo, innerGeo }
 *   { type: 'error',    msg }
 */

// ─── CDN imports ──────────────────────────────────────────────────
importScripts(
  'https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js'
);

// ─── Land data cache ──────────────────────────────────────────────
let landGeo = null; // GeoJSON FeatureCollection of land polygons

async function ensureLandData() {
  if (landGeo) return;

  // Natural Earth 110m land via world-atlas (TopoJSON, ~400 KB)
  const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
    .then(r => { if (!r.ok) throw new Error('Land data fetch failed'); return r.json(); });

  // Convert to GeoJSON
  landGeo = topojson.feature(topo, topo.objects.land);
}

// ─── Point-in-land test ───────────────────────────────────────────
function isLandPoint(lat, lng) {
  return turf.booleanPointInPolygon(turf.point([lng, lat]), landGeo);
}


// ─── Land grid ────────────────────────────────────────────────────
/**
 * Build an N×N grid of {lat, lng, land} points covering the circle area.
 * The grid is used for fast land lookups during vector walking.
 *
 * Grid spacing = (2 × radiusKm × 1.2) / (N - 1)
 * For driving 9h: ~1000 km radius → N=80 gives ~30 km spacing — fine for
 * detecting major water bodies (English Channel is 33 km at narrowest).
 */
function buildGrid(clat, clng, radiusKm) {
  // Adaptive grid size: coarser for large ranges (performance), finer for small ones
  const N = Math.max(50, Math.min(100, Math.round(radiusKm / 8)));

  const latSpan = (radiusKm * 1.2) / 111.32;
  const lngSpan = (radiusKm * 1.2) / (111.32 * Math.cos(clat * Math.PI / 180));

  const minLat = clat - latSpan, maxLat = clat + latSpan;
  const minLng = clng - lngSpan, maxLng = clng + lngSpan;

  const pts = [];
  for (let i = 0; i < N; i++) {
    const lat = minLat + (i / (N - 1)) * (maxLat - minLat);
    for (let j = 0; j < N; j++) {
      const lng = minLng + (j / (N - 1)) * (maxLng - minLng);
      pts.push({ lat, lng, land: isLandPoint(lat, lng) });
    }
  }

  return { pts, N, minLat, maxLat, minLng, maxLng };
}

/**
 * Look up whether a lat/lng is land according to the precomputed grid.
 * Uses nearest-neighbour lookup (fast integer math).
 * Points outside the grid boundary return false (treated as water).
 */
function gridIsLand(lat, lng, g) {
  if (lat < g.minLat || lat > g.maxLat || lng < g.minLng || lng > g.maxLng) {
    return false; // outside grid = treat as water (don't venture there)
  }

  const fi = ((lat - g.minLat) / (g.maxLat - g.minLat)) * (g.N - 1);
  const fj = ((lng - g.minLng) / (g.maxLng - g.minLng)) * (g.N - 1);
  const i  = Math.max(0, Math.min(g.N - 1, Math.round(fi)));
  const j  = Math.max(0, Math.min(g.N - 1, Math.round(fj)));

  return g.pts[i * g.N + j].land;
}


// ─── Vector walking ───────────────────────────────────────────────
/**
 * Walk a single vector from the origin along a bearing for up to distKm.
 *
 * Rules:
 *  - Take steps of distKm / STEPS each iteration
 *  - If the next step lands on a grid cell marked LAND → advance normally
 *  - If the next step lands on WATER → try to redirect:
 *      Try bearing offsets ±5°, ±10°, … ±60° (smallest angle first)
 *      If any offset leads back to land → take that bearing and continue
 *      If no offset within ±60° finds land → STOP here
 *  - When remaining distance ≤ half a step → STOP
 *
 * Returns [lng, lat] of the endpoint (GeoJSON coordinate order).
 */
function walkVector(clat, clng, bearingDeg, distKm, grid) {
  const STEPS   = 80;
  const stepKm  = distKm / STEPS;
  const halfStep = stepKm * 0.5;

  let lat = clat, lng = clng;
  let brg = bearingDeg;
  let rem = distKm;

  while (rem > halfStep) {
    const s = Math.min(stepKm, rem);

    // Compute next candidate position
    const nxt = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
    const nlng = nxt.geometry.coordinates[0];
    const nlat = nxt.geometry.coordinates[1];

    if (gridIsLand(nlat, nlng, grid)) {
      // Advance
      lat = nlat; lng = nlng; rem -= s;
    } else {
      // Water hit — find minimum redirect angle that leads back to land
      let redirectBrg = null;

      scan:
      for (let ang = 5; ang <= 60; ang += 5) {
        // Try both sides; prefer left turn first (arbitrary, but consistent)
        for (const sign of [-1, 1]) {
          const tb  = ((brg + sign * ang) + 360) % 360;
          const tp  = turf.destination(turf.point([lng, lat]), s, tb, { units: 'kilometers' });
          const tlng = tp.geometry.coordinates[0];
          const tlat = tp.geometry.coordinates[1];

          if (gridIsLand(tlat, tlng, grid)) {
            redirectBrg = tb;
            break scan;
          }
        }
      }

      if (redirectBrg === null) {
        // Cannot navigate back to land within 60° — stop vector here
        break;
      }

      // Redirect: take one step with the new bearing and continue
      brg = redirectBrg;
      const ap  = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
      lat = ap.geometry.coordinates[1];
      lng = ap.geometry.coordinates[0];
      rem -= s;
    }
  }

  return [lng, lat]; // GeoJSON [lng, lat]
}


// ─── Main handler ─────────────────────────────────────────────────
self.onmessage = async function (evt) {
  const { clat, clng, outerKm, innerKm } = evt.data;

  try {
    // 1. Load land data (cached after first call)
    self.postMessage({ type: 'status', msg: 'Loading Natural Earth land data…' });
    await ensureLandData();

    // 2. Verify origin is on land
    if (!isLandPoint(clat, clng)) {
      self.postMessage({ type: 'error', msg: 'Starting point appears to be in water. Please select a point on land.' });
      return;
    }

    // 3. Build land grid
    const radiusKm = outerKm;
    self.postMessage({ type: 'status', msg: `Building land grid (${Math.max(50, Math.min(100, Math.round(radiusKm / 8)))}² cells)…` });
    const grid = buildGrid(clat, clng, radiusKm);

    // Send grid to main thread for visualisation
    self.postMessage({ type: 'grid', pts: grid.pts });

    // 4. Walk 72 vectors (every 5°) for both outer and inner radii
    self.postMessage({ type: 'status', msg: 'Walking 72 vectors…' });

    const outerRing = []; // 72 [lng, lat] endpoints
    const innerRing = [];

    for (let deg = 0; deg < 360; deg += 5) {
      outerRing.push(walkVector(clat, clng, deg, outerKm, grid));
      innerRing.push(walkVector(clat, clng, deg, innerKm, grid));

      // Report progress every 36° (every 8th vector)
      if (deg % 36 === 0) {
        self.postMessage({ type: 'progress', pct: Math.round((deg / 360) * 100) });
      }
    }

    // 5. Close rings (GeoJSON requires first = last)
    const outerClosed = [...outerRing, outerRing[0]];
    const innerClosed = [...innerRing, innerRing[0]];

    // 6. Build GeoJSON features
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

    // 7. Return everything
    self.postMessage({
      type:       'done',
      outerRing,  // 72 endpoints (for numbered markers)
      innerRing,
      outerGeo,
      innerGeo
    });

  } catch (err) {
    self.postMessage({ type: 'error', msg: err.message || String(err) });
  }
};
