/**
 * range-worker.js — Web Worker; UI thread never freezes.
 *
 * Grid cells: C.CELL_WATER (0), C.CELL_LAND (1), C.CELL_CROSSING (2).
 * Crossing cells are passable but consume stepKm × C.CROSSING_DISTANCE_FACTOR.
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


// -- Land data --

let landFeatures = null;

async function ensureLandData() {
  if (landFeatures) return;

  const resp = await fetch(C.LAND_DATA_URL);
  if (!resp.ok) throw new Error(`Land data fetch failed (HTTP ${resp.status})`);

  const topo = await resp.json();
  if (!topo.objects?.land) throw new Error('Unexpected TopoJSON structure — missing topo.objects.land');

  const collection = topojson.feature(topo, topo.objects.land);
  if (!Array.isArray(collection.features) || !collection.features.length)
    throw new Error('Land FeatureCollection is empty after TopoJSON conversion');

  landFeatures = collection.features;
}

function isLandPoint(lat, lng) {
  const pt = turf.point([lng, lat]);
  for (let i = 0; i < landFeatures.length; i++) {
    if (turf.booleanPointInPolygon(pt, landFeatures[i])) return true;
  }
  return false;
}


// -- Crossing zone test --

function isCrossingZone(lat, lng) {
  for (let i = 0; i < C.CROSSING_ZONES.length; i++) {
    const z = C.CROSSING_ZONES[i];
    if (lat >= z[1] && lat <= z[2] && lng >= z[3] && lng <= z[4]) return true;
  }
  return false;
}


// -- Cell classification --

function classifyCell(lat, lng) {
  if (isLandPoint(lat, lng))   return C.CELL_LAND;
  if (isCrossingZone(lat, lng)) return C.CELL_CROSSING;
  return C.CELL_WATER;
}


// -- Land grid --

function buildGrid(clat, clng, radiusKm) {
  const N = Math.max(C.GRID_SIZE_MIN, Math.min(C.GRID_SIZE_MAX,
    Math.round(radiusKm / C.GRID_SIZE_DIVISOR)));

  const lngKmPerDeg = C.LAT_KM_PER_DEG * Math.cos(clat * Math.PI / 180);
  const m           = C.GRID_MARGIN_FACTOR;

  const latSpan = (radiusKm * (1 + m)) / C.LAT_KM_PER_DEG;
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

function gridCell(lat, lng, g) {
  if (lat < g.minLat || lat > g.maxLat || lng < g.minLng || lng > g.maxLng)
    return C.CELL_WATER;

  const i = Math.max(0, Math.min(g.N - 1,
    Math.round(((lat - g.minLat) / (g.maxLat - g.minLat)) * (g.N - 1))));
  const j = Math.max(0, Math.min(g.N - 1,
    Math.round(((lng - g.minLng) / (g.maxLng - g.minLng)) * (g.N - 1))));

  return g.pts[i * g.N + j].cell;
}


// -- Bearing helpers --

function normBearing(b) { return ((b % 360) + 360) % 360; }

function bearingDiff(a, b) {
  let d = normBearing(b) - normBearing(a);
  if (d >  180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function recoveredBearing(brg, origBrg) {
  return Math.abs(bearingDiff(brg, origBrg)) <= C.RECOVERY_RETURN_THRESHOLD_DEG;
}


// -- Redirect scan --

function scanForPassable(lat, lng, fromBrg, stepKm, maxAngle, grid) {
  for (let ang = C.REDIRECT_ANGLE_STEP; ang <= maxAngle; ang += C.REDIRECT_ANGLE_STEP) {
    for (const sign of [-1, 1]) {
      const tb  = normBearing(fromBrg + sign * ang);
      const tp  = turf.destination(turf.point([lng, lat]), stepKm, tb, { units: 'kilometers' });
      const tc  = gridCell(tp.geometry.coordinates[1], tp.geometry.coordinates[0], grid);
      if (tc === C.CELL_LAND || tc === C.CELL_CROSSING) return tb;
    }
  }
  return null;
}


// -- Vector walking --

function walkVector(clat, clng, originalBearing, distKm, grid) {
  const stepKm = distKm / C.VECTOR_STEPS;
  const minRem = stepKm * C.VECTOR_STOP_THRESHOLD;

  let lat = clat, lng = clng;
  let brg = originalBearing;
  let rem = distKm;

  let recovering        = false;
  let recoveryStepsLeft = 0;

  while (rem > minRem) {
    const s   = Math.min(stepKm, rem);
    const nxt = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
    const nlng = nxt.geometry.coordinates[0];
    const nlat = nxt.geometry.coordinates[1];
    const cell = gridCell(nlat, nlng, grid);

    if (cell === C.CELL_LAND || cell === C.CELL_CROSSING) {
      lat = nlat; lng = nlng;
      rem -= cell === C.CELL_CROSSING ? s * C.CROSSING_DISTANCE_FACTOR : s;

      if (recovering) {
        if (recoveredBearing(brg, originalBearing)) {
          brg = originalBearing;
          recovering = false;
        } else if (--recoveryStepsLeft <= 0) {
          break;
        }
      }
      continue;
    }

    // Water
    if (!recovering) {
      const redirectBrg = scanForPassable(lat, lng, brg, s, C.REDIRECT_ANGLE_MAX, grid);
      if (redirectBrg !== null) { brg = redirectBrg; continue; }
      recovering        = true;
      recoveryStepsLeft = C.RECOVERY_MAX_STEPS;
    }

    const recoveryBrg = scanForPassable(lat, lng, originalBearing, s, C.RECOVERY_SCAN_ANGLE_MAX, grid);
    if (recoveryBrg === null) break;

    brg = recoveryBrg;
    const rp   = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
    const rlng = rp.geometry.coordinates[0];
    const rlat = rp.geometry.coordinates[1];
    const rc   = gridCell(rlat, rlng, grid);

    if (rc === C.CELL_WATER) break;

    lat = rlat; lng = rlng;
    rem -= rc === C.CELL_CROSSING ? s * C.CROSSING_DISTANCE_FACTOR : s;

    if (recoveredBearing(brg, originalBearing)) {
      brg = originalBearing;
      recovering = false;
    } else if (--recoveryStepsLeft <= 0) {
      break;
    }
  }

  return [lng, lat];
}


// -- Main --

self.onmessage = async function (evt) {
  const { clat, clng, outerKm, innerKm } = evt.data;

  try {
    self.postMessage({ type: 'status', msg: 'Loading Natural Earth land data…' });
    await ensureLandData();

    if (!isLandPoint(clat, clng)) {
      self.postMessage({ type: 'error', msg: 'Starting point appears to be in water. Please choose a point on land.' });
      return;
    }

    const N = Math.max(C.GRID_SIZE_MIN, Math.min(C.GRID_SIZE_MAX,
      Math.round(outerKm / C.GRID_SIZE_DIVISOR)));
    self.postMessage({ type: 'status', msg: `Building ${N}×${N} land grid…` });
    const grid = buildGrid(clat, clng, outerKm);

    self.postMessage({ type: 'grid', pts: grid.pts.filter(p => p.cell !== C.CELL_WATER) });

    self.postMessage({ type: 'status', msg: `Walking ${C.VECTOR_COUNT} vectors…` });

    const outerRing    = [];
    const innerRing    = [];
    const progressEvery = Math.max(1, Math.round(C.VECTOR_COUNT / 8));

    for (let i = 0; i < C.VECTOR_COUNT; i++) {
      const deg = i * C.VECTOR_STEP_DEG;
      outerRing.push(walkVector(clat, clng, deg, outerKm, grid));
      innerRing.push(walkVector(clat, clng, deg, innerKm, grid));

      if (i % progressEvery === 0)
        self.postMessage({ type: 'progress', pct: Math.round((i / C.VECTOR_COUNT) * 100) });
    }

    const outerClosed = [...outerRing, outerRing[0]];
    const innerClosed = [...innerRing, innerRing[0]];

    const outerGeo = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [outerClosed] }, properties: {} };
    const innerGeo = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [innerClosed] }, properties: {} };

    self.postMessage({ type: 'progress', pct: 100 });
    self.postMessage({ type: 'done', outerRing, innerRing, outerGeo, innerGeo });

  } catch (err) {
    self.postMessage({ type: 'error', msg: `Worker error: ${err.message || String(err)}` });
  }
};
