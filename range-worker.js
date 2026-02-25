/**
 * range-worker.js
 *
 * Web Worker, runs in a background thread so the UI never freezes.
 *
 * All tuneable values live in constants.js (C.*).
 *
 * Steps:
 *  1. Load Natural Earth land polygons (URL from C.LAND_DATA_URL)
 *  2. Build an adaptive land grid over the range area
 *  3. Walk C.VECTOR_COUNT vectors (C.VECTOR_STEP_DEG apart) for outer + inner radii
 *  4. Post results back to the main thread
 *
 * Messages IN:  { clat, clng, outerKm, innerKm }
 * Messages OUT:
 *   { type: 'status',   msg }
 *   { type: 'grid',     pts: [{lat, lng, land}] }
 *   { type: 'progress', pct }
 *   { type: 'done',     outerRing, innerRing, outerGeo, innerGeo }
 *   { type: 'error',    msg }
 */

importScripts(
  'https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js',
  'constants.js'
);

//  Land data (cached after first successful load) 
// Stored as a flat Array of GeoJSON Feature<Polygon|MultiPolygon>
// so isLandPoint can iterate them directly.
let landFeatures = null;

async function ensureLandData() {
  if (landFeatures) return; // already loaded

  const resp = await fetch(C.LAND_DATA_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch land data (HTTP ${resp.status}) from ${C.LAND_DATA_URL}`);
  }

  const topo = await resp.json();

  if (!topo.objects || !topo.objects.land) {
    throw new Error('Unexpected TopoJSON structure — missing topo.objects.land');
  }

  // topojson.feature returns a GeoJSON FeatureCollection
  const collection = topojson.feature(topo, topo.objects.land);

  if (!collection || !Array.isArray(collection.features) || collection.features.length === 0) {
    throw new Error('Land FeatureCollection is empty after TopoJSON conversion');
  }

  landFeatures = collection.features;
}


//  Point-in-land test 
// Iterates over each Feature individually.
// turf.booleanPointInPolygon requires a single Feature, not a FeatureCollection.
function isLandPoint(lat, lng) {
  const pt = turf.point([lng, lat]);
  for (let i = 0; i < landFeatures.length; i++) {
    if (turf.booleanPointInPolygon(pt, landFeatures[i])) return true;
  }
  return false;
}


//  Land grid 
/**
 * Build a flat array of {lat, lng, land} objects.
 *
 * Grid size N: clamp(outerKm / C.GRID_SIZE_DIVISOR, MIN, MAX)
 * Bounding box: outerKm × (1 + C.GRID_MARGIN_FACTOR) on each side.
 */
function buildGrid(clat, clng, radiusKm) {
  const raw = Math.round(radiusKm / C.GRID_SIZE_DIVISOR);
  const N   = Math.max(C.GRID_SIZE_MIN, Math.min(C.GRID_SIZE_MAX, raw));

  const margin = C.GRID_MARGIN_FACTOR;

  // Degrees of latitude per km (constant worldwide)
  const latKmPerDeg = 111.32;
  // Degrees of longitude per km (shrinks toward poles)
  const lngKmPerDeg = 111.32 * Math.cos(clat * Math.PI / 180);

  const latSpan = (radiusKm * (1 + margin)) / latKmPerDeg;
  const lngSpan = (radiusKm * (1 + margin)) / lngKmPerDeg;

  const minLat = clat - latSpan,  maxLat = clat + latSpan;
  const minLng = clng - lngSpan,  maxLng = clng + lngSpan;

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


//  Fast grid lookup 
// Nearest-neighbour lookup. Returns false for out-of-bounds coordinates
// (treating them as water so vectors stop safely at the grid edge).
function gridIsLand(lat, lng, g) {
  if (lat < g.minLat || lat > g.maxLat ||
      lng < g.minLng || lng > g.maxLng) return false;

  const fi = ((lat - g.minLat) / (g.maxLat - g.minLat)) * (g.N - 1);
  const fj = ((lng - g.minLng) / (g.maxLng - g.minLng)) * (g.N - 1);
  const i  = Math.max(0, Math.min(g.N - 1, Math.round(fi)));
  const j  = Math.max(0, Math.min(g.N - 1, Math.round(fj)));

  return g.pts[i * g.N + j].land;
}


//  Vector walking 
/**
 * Walk a single vector from (clat, clng) along `bearingDeg` for up to
 * `distKm` kilometres.
 *
 * - VECTOR_STEPS steps, each (distKm / VECTOR_STEPS) km long
 * - Land hit  > advance normally
 * - Water hit > scan ±REDIRECT_ANGLE_STEP … ±REDIRECT_ANGLE_MAX for
 *               the smallest bearing change that leads back to land
 * - No redirect found within the cone > stop here
 *
 * Returns endpoint as [lng, lat] (GeoJSON order).
 */
function walkVector(clat, clng, bearingDeg, distKm, grid) {
  const steps    = C.VECTOR_STEPS;
  const stepKm   = distKm / steps;
  const minRem   = stepKm * C.VECTOR_STOP_THRESHOLD;

  let lat = clat;
  let lng = clng;
  let brg = bearingDeg;
  let rem = distKm;

  while (rem > minRem) {
    const s = Math.min(stepKm, rem);

    const nxt  = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
    const nlng = nxt.geometry.coordinates[0];
    const nlat = nxt.geometry.coordinates[1];

    if (gridIsLand(nlat, nlng, grid)) {
      // Normal advance
      lat = nlat;
      lng = nlng;
      rem -= s;
    } else {
      // Water hit, search for smallest redirect back to land
      let redirectBrg = null;

      scan:
      for (let ang = C.REDIRECT_ANGLE_STEP;
               ang <= C.REDIRECT_ANGLE_MAX;
               ang += C.REDIRECT_ANGLE_STEP) {
        for (const sign of [-1, 1]) {
          const tb   = ((brg + sign * ang) % 360 + 360) % 360;
          const tp   = turf.destination(turf.point([lng, lat]), s, tb, { units: 'kilometers' });
          const tlng = tp.geometry.coordinates[0];
          const tlat = tp.geometry.coordinates[1];
          if (gridIsLand(tlat, tlng, grid)) {
            redirectBrg = tb;
            break scan;
          }
        }
      }

      if (redirectBrg === null) {
        // No land found within the redirect cone — stop the vector
        break;
      }

      // Take one redirected step and continue
      brg = redirectBrg;
      const ap = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
      lat = ap.geometry.coordinates[1];
      lng = ap.geometry.coordinates[0];
      rem -= s;
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

    // 2. Origin sanity check
    if (!isLandPoint(clat, clng)) {
      self.postMessage({
        type: 'error',
        msg:  'Starting point appears to be in water. Please choose a point on land.'
      });
      return;
    }

    // 3. Build land grid
    const raw = Math.round(outerKm / C.GRID_SIZE_DIVISOR);
    const N   = Math.max(C.GRID_SIZE_MIN, Math.min(C.GRID_SIZE_MAX, raw));
    self.postMessage({ type: 'status', msg: `Building ${N}×${N} land grid…` });

    const grid = buildGrid(clat, clng, outerKm);

    // Send land-only points to main thread for map display
    self.postMessage({ type: 'grid', pts: grid.pts.filter(p => p.land) });

    // 4. Walk vectors
    self.postMessage({ type: 'status', msg: `Walking ${C.VECTOR_COUNT} vectors…` });

    const outerRing = [];
    const innerRing = [];

    // Report progress every 1/8th of the total vectors
    const progressInterval = Math.max(1, Math.round(C.VECTOR_COUNT / 8));

    for (let i = 0; i < C.VECTOR_COUNT; i++) {
      const deg = i * C.VECTOR_STEP_DEG;
      outerRing.push(walkVector(clat, clng, deg, outerKm, grid));
      innerRing.push(walkVector(clat, clng, deg, innerKm, grid));

      if (i % progressInterval === 0) {
        self.postMessage({ type: 'progress', pct: Math.round((i / C.VECTOR_COUNT) * 100) });
      }
    }

    // 5. Close rings (GeoJSON polygon: first === last)
    const outerClosed = [...outerRing, outerRing[0]];
    const innerClosed = [...innerRing, innerRing[0]];

    // 6. Build GeoJSON features
    const outerGeo = {
      type:       'Feature',
      geometry:   { type: 'Polygon', coordinates: [outerClosed] },
      properties: {}
    };
    const innerGeo = {
      type:       'Feature',
      geometry:   { type: 'Polygon', coordinates: [innerClosed] },
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
