/**
 * range-worker.js
 *
 * Web Worker — runs in a background thread so the UI never freezes.
 * All tuneable values live in constants.js (C.*).
 *
 * Key behaviours:
 *   - Grid cells are classified as C.CELL_WATER (0), C.CELL_LAND (1),
 *     or C.CELL_CROSSING (2) — water inside a known ferry/bridge corridor.
 *   - Crossing cells are traversable but cost more budget
 *     (step × C.CROSSING_DISTANCE_FACTOR).
 *   - When a vector gets stuck (no redirect within ±REDIRECT_ANGLE_MAX),
 *     it enters recovery mode: it remembers its original bearing and gets
 *     up to RECOVERY_MAX_STEPS attempts with a wider scan to work its way
 *     back. If it returns within RECOVERY_RETURN_THRESHOLD_DEG of the
 *     original bearing it continues normally. If it exhausts recovery steps
 *     without returning, the vector stops. The same logic re-applies if
 *     the vector gets stuck again later.
 *
 * Messages IN:  { clat, clng, outerKm, innerKm }
 * Messages OUT:
 *   { type: 'status',   msg }
 *   { type: 'grid',     pts: [{lat, lng, cell}] }
 *   { type: 'progress', pct }
 *   { type: 'done',     outerRing, innerRing, outerGeo, innerGeo }
 *   { type: 'error',    msg }
 */

importScripts(
  'https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js',
  'constants.js'
);


//  Land data cache 
// Stored as a flat Array of GeoJSON Feature so isLandPoint can
// iterate each polygon individually (FeatureCollection not accepted
// by turf.booleanPointInPolygon).
let landFeatures = null;

async function ensureLandData() {
  if (landFeatures) return;

  const resp = await fetch(C.LAND_DATA_URL);
  if (!resp.ok) throw new Error(`Land data fetch failed (HTTP ${resp.status})`);

  const topo = await resp.json();

  if (!topo.objects?.land) {
    throw new Error('Unexpected TopoJSON structure — missing topo.objects.land');
  }

  const collection = topojson.feature(topo, topo.objects.land);

  if (!Array.isArray(collection.features) || !collection.features.length) {
    throw new Error('Land FeatureCollection is empty after TopoJSON conversion');
  }

  landFeatures = collection.features;
}


//  Raw land test (polygon level) 
function isLandPoint(lat, lng) {
  const pt = turf.point([lng, lat]);
  for (let i = 0; i < landFeatures.length; i++) {
    if (turf.booleanPointInPolygon(pt, landFeatures[i])) return true;
  }
  return false;
}


//  Crossing zone test 
// Returns true if (lat, lng) falls inside any defined crossing corridor.
function isCrossingZone(lat, lng) {
  for (let i = 0; i < C.CROSSING_ZONES.length; i++) {
    const z = C.CROSSING_ZONES[i]; // [name, minLat, maxLat, minLng, maxLng]
    if (lat >= z[1] && lat <= z[2] && lng >= z[3] && lng <= z[4]) return true;
  }
  return false;
}


//  Cell classification 
// Combines land polygon test + crossing zone test into the 0/1/2 enum.
function classifyCell(lat, lng) {
  if (isLandPoint(lat, lng)) return C.CELL_LAND;
  if (isCrossingZone(lat, lng)) return C.CELL_CROSSING;
  return C.CELL_WATER;
}


//  Land grid 
/**
 * Build a flat array of {lat, lng, cell} objects covering the bounding box
 * of the outer radius with C.GRID_MARGIN_FACTOR padding on each side.
 * Grid size N is adaptive: clamp(outerKm / DIVISOR, MIN, MAX).
 */
function buildGrid(clat, clng, radiusKm) {
  const N = Math.max(
    C.GRID_SIZE_MIN,
    Math.min(C.GRID_SIZE_MAX, Math.round(radiusKm / C.GRID_SIZE_DIVISOR))
  );

  const latKmPerDeg = 111.32;
  const lngKmPerDeg = 111.32 * Math.cos(clat * Math.PI / 180);
  const m = C.GRID_MARGIN_FACTOR;

  const latSpan = (radiusKm * (1 + m)) / latKmPerDeg;
  const lngSpan = (radiusKm * (1 + m)) / lngKmPerDeg;

  const minLat = clat - latSpan, maxLat = clat + latSpan;
  const minLng = clng - lngSpan, maxLng = clng + lngSpan;

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


//  Grid lookup 
// Nearest-neighbour. Returns C.CELL_WATER for out-of-bounds positions so vectors stop safely at the grid edge.
function gridCell(lat, lng, g) {
  if (lat < g.minLat || lat > g.maxLat ||
      lng < g.minLng || lng > g.maxLng) return C.CELL_WATER;

  const i = Math.max(0, Math.min(g.N - 1,
    Math.round(((lat - g.minLat) / (g.maxLat - g.minLat)) * (g.N - 1))
  ));
  const j = Math.max(0, Math.min(g.N - 1,
    Math.round(((lng - g.minLng) / (g.maxLng - g.minLng)) * (g.N - 1))
  ));

  return g.pts[i * g.N + j].cell;
}


//  Bearing helpers 
function normBearing(b) { return ((b % 360) + 360) % 360; }

// Smallest signed angle between two bearings (-180 to +180).
function bearingDiff(a, b) {
  let d = normBearing(b) - normBearing(a);
  if (d >  180) d -= 360;
  if (d < -180) d += 360;
  return d;
}


//  Scan for a passable bearing 
/**
 * Starting from `fromBrg`, try offsets ±step, ±2×step … ±maxAngle.
 * Returns the first bearing that leads to a LAND or CROSSING cell,
 * or null if none found within the cone.
 */
function scanForPassable(lat, lng, fromBrg, stepKm, maxAngle, grid) {
  for (let ang = C.REDIRECT_ANGLE_STEP; ang <= maxAngle; ang += C.REDIRECT_ANGLE_STEP) {
    for (const sign of [-1, 1]) {
      const tb  = normBearing(fromBrg + sign * ang);
      const tp  = turf.destination(turf.point([lng, lat]), stepKm, tb, { units: 'kilometers' });
      const tlng = tp.geometry.coordinates[0];
      const tlat = tp.geometry.coordinates[1];
      const tc   = gridCell(tlat, tlng, grid);
      if (tc === C.CELL_LAND || tc === C.CELL_CROSSING) return tb;
    }
  }
  return null;
}


//  Vector walking 
/**
 * Walk a single vector from (clat, clng) along originalBearing for
 * up to distKm kilometres.
 *
 * Normal mode:
 *   - LAND step     → advance, consume stepKm from budget
 *   - CROSSING step → advance, consume stepKm × CROSSING_DISTANCE_FACTOR
 *   - WATER step    → try redirect within ±REDIRECT_ANGLE_MAX
 *                     • redirect found → take it, stay in normal mode
 *                     • no redirect   → enter recovery mode
 *
 * Recovery mode (entered when normal redirect fails):
 *   - Remember originalBearing at entry.
 *   - Each recovery step: try wider scan ±RECOVERY_SCAN_ANGLE_MAX.
 *     • passable bearing found → take it, decrement recoveryStepsLeft.
 *       If now within RECOVERY_RETURN_THRESHOLD_DEG of originalBearing
 *       → snap bearing back, exit recovery, continue normally.
 *     • nothing found at all → stop the vector.
 *   - If recoveryStepsLeft hits 0 without returning → stop.
 *
 * Returns endpoint as [lng, lat] (GeoJSON order).
 */
function walkVector(clat, clng, originalBearing, distKm, grid) {
  const stepKm  = distKm / C.VECTOR_STEPS;
  const minRem  = stepKm * C.VECTOR_STOP_THRESHOLD;

  let lat = clat;
  let lng = clng;
  let brg = originalBearing;
  let rem = distKm;

  // Recovery state
  let recovering        = false;
  let recoveryStepsLeft = 0;

  while (rem > minRem) {
    const s   = Math.min(stepKm, rem);
    const nxt = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
    const nlng = nxt.geometry.coordinates[0];
    const nlat = nxt.geometry.coordinates[1];
    const cell = gridCell(nlat, nlng, grid);

    //  LAND: normal advance 
    if (cell === C.CELL_LAND) {
      lat = nlat; lng = nlng; rem -= s;

      // If we were recovering, check whether we've returned to within the threshold of the original bearing
      if (recovering) {
        if (Math.abs(bearingDiff(brg, originalBearing)) <= C.RECOVERY_RETURN_THRESHOLD_DEG) {
          // Recovered — snap back and resume normal mode
          brg       = originalBearing;
          recovering = false;
        } else {
          recoveryStepsLeft--;
          if (recoveryStepsLeft <= 0) break; // exhausted recovery — stop
        }
      }
      continue;
    }

    //  CROSSING: advance at extra cost 
    if (cell === C.CELL_CROSSING) {
      lat  = nlat;
      lng  = nlng;
      rem -= s * C.CROSSING_DISTANCE_FACTOR; // crossing eats more budget

      if (recovering) {
        // Crossing counts as a recovery step; check return condition
        if (Math.abs(bearingDiff(brg, originalBearing)) <= C.RECOVERY_RETURN_THRESHOLD_DEG) {
          brg       = originalBearing;
          recovering = false;
        } else {
          recoveryStepsLeft--;
          if (recoveryStepsLeft <= 0) break;
        }
      }
      continue;
    }

    //  WATER 
    if (!recovering) {
      // Normal mode: try redirect within the standard cone
      const redirectBrg = scanForPassable(lat, lng, brg, s, C.REDIRECT_ANGLE_MAX, grid);
      if (redirectBrg !== null) {
        // Redirect found. Take it and stay in normal mode
        brg = redirectBrg;
        // We do NOT advance here; the next loop iteration will try the step with the new bearing (avoids double-advancing)
        continue;
      }

      // No redirect within standard cone — enter recovery
      recovering        = true;
      recoveryStepsLeft = C.RECOVERY_MAX_STEPS;
    }

    // Recovery mode: wider scan
    const recoveryBrg = scanForPassable(lat, lng, originalBearing, s, C.RECOVERY_SCAN_ANGLE_MAX, grid);
    if (recoveryBrg === null) {
      // Completely surrounded — stop
      break;
    }

    // Take the recovery step
    brg = recoveryBrg;
    const rp   = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
    const rlng = rp.geometry.coordinates[0];
    const rlat = rp.geometry.coordinates[1];
    const rc   = gridCell(rlat, rlng, grid);

    if (rc === C.CELL_WATER) {
      // Even the best recovery bearing leads to water — stop
      break;
    }

    const cost = rc === C.CELL_CROSSING ? s * C.CROSSING_DISTANCE_FACTOR : s;
    lat = rlat; lng = rlng; rem -= cost;

    // Check recovery return condition
    if (Math.abs(bearingDiff(brg, originalBearing)) <= C.RECOVERY_RETURN_THRESHOLD_DEG) {
      brg       = originalBearing;
      recovering = false;
    } else {
      recoveryStepsLeft--;
      if (recoveryStepsLeft <= 0) break;
    }
  }

  return [lng, lat]; // GeoJSON: [lng, lat]
}


//  Main message handler 
self.onmessage = async function (evt) {
  const { clat, clng, outerKm, innerKm } = evt.data;

  try {
    // 1. Load land data (cached after first call)
    self.postMessage({ type: 'status', msg: 'Loading Natural Earth land data…' });
    await ensureLandData();

    // 2. Origin must be on land
    if (!isLandPoint(clat, clng)) {
      self.postMessage({
        type: 'error',
        msg:  'Starting point appears to be in water. Please choose a point on land.'
      });
      return;
    }

    // 3. Build grid
    const N = Math.max(
      C.GRID_SIZE_MIN,
      Math.min(C.GRID_SIZE_MAX, Math.round(outerKm / C.GRID_SIZE_DIVISOR))
    );
    self.postMessage({ type: 'status', msg: `Building ${N}×${N} land grid…` });
    const grid = buildGrid(clat, clng, outerKm);

    // Send all non-water cells to the main thread for visualisation.
    // Include cell type so the map can colour land vs crossing differently.
    self.postMessage({
      type: 'grid',
      pts:  grid.pts.filter(p => p.cell !== C.CELL_WATER)
    });

    // 4. Walk vectors
    self.postMessage({ type: 'status', msg: `Walking ${C.VECTOR_COUNT} vectors…` });

    const outerRing = [];
    const innerRing = [];
    const progressEvery = Math.max(1, Math.round(C.VECTOR_COUNT / 8));

    for (let i = 0; i < C.VECTOR_COUNT; i++) {
      const deg = i * C.VECTOR_STEP_DEG;
      outerRing.push(walkVector(clat, clng, deg, outerKm, grid));
      innerRing.push(walkVector(clat, clng, deg, innerKm, grid));

      if (i % progressEvery === 0) {
        self.postMessage({ type: 'progress', pct: Math.round((i / C.VECTOR_COUNT) * 100) });
      }
    }

    // 5. Close rings (GeoJSON polygon: first coord === last coord)
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

    // 7. Done
    self.postMessage({ type: 'progress', pct: 100 });
    self.postMessage({ type: 'done', outerRing, innerRing, outerGeo, innerGeo });

  } catch (err) {
    self.postMessage({
      type: 'error',
      msg:  `Worker error: ${err.message || String(err)}`
    });
  }
};
