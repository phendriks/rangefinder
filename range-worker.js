/**
 * range-worker.js
 *
 * Web Worker, runs in background thread so the UI never freezes.
 *
 * Steps:
 *  1. Load Natural Earth 110m land polygons (TopoJSON via jsDelivr CDN)
 *  2. Build an NxN grid of land/water booleans covering the range area
 *  3. Fire 72 vectors (every 5deg) for both outer and inner radii
 *  4. Each vector walks forward in steps; water hits trigger a redirect
 *     search up to 60deg, if none found the vector stops
 *  5. Post results back to the main thread
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
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js'
);

//  Land data (cached after first load) 
// landFeatures is an Array of GeoJSON Feature<Polygon|MultiPolygon>
let landFeatures = null;

async function ensureLandData() {
  if (landFeatures) return;

  const url  = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch land data (HTTP ${resp.status})`);

  const topo = await resp.json();

  // world-atlas v2 stores land as topo.objects.land (a GeometryCollection)
  if (!topo.objects || !topo.objects.land) {
    throw new Error('Unexpected TopoJSON structure, missing topo.objects.land');
  }

  // topojson.feature returns a GeoJSON FeatureCollection
  const collection = topojson.feature(topo, topo.objects.land);

  if (!collection || !collection.features || !collection.features.length) {
    throw new Error('Land FeatureCollection is empty after conversion');
  }

  // Store as a flat array so isLandPoint can iterate
  landFeatures = collection.features;
}


//  Point-in-land test 
// Must iterate over every feature in the collection.
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
 * Build a flat array of {lat, lng, land} objects covering the bounding box
 * of the outer circle, with a 20% margin on each side.
 *
 * Grid size N is adaptive:
 *   small ranges (cycle/walk) > finer grid (~50 cells)
 *   large ranges (drive 9h)   > coarser grid (~90 cells) to keep it fast
 *
 * At 1000 km radius and N=90 the cell spacing is ~26 km,
 * enough to resolve the English Channel (34 km at narrowest).
 */
function buildGrid(clat, clng, radiusKm) {
  const N = Math.max(40, Math.min(90, Math.round(radiusKm / 10)));

  const latDeg = (radiusKm * 1.2) / 111.32;
  const lngDeg = (radiusKm * 1.2) / (111.32 * Math.cos(clat * Math.PI / 180));

  const minLat = clat - latDeg,  maxLat = clat + latDeg;
  const minLng = clng - lngDeg,  maxLng = clng + lngDeg;

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
/**
 * Nearest-neighbour lookup against the precomputed grid.
 * Returns false for points outside the grid boundary
 * (treating out-of-bounds as water stops the vector safely).
 */
function gridIsLand(lat, lng, g) {
  if (lat < g.minLat || lat > g.maxLat ||
      lng < g.minLng || lng > g.maxLng) return false;

  const i = Math.round(((lat - g.minLat) / (g.maxLat - g.minLat)) * (g.N - 1));
  const j = Math.round(((lng - g.minLng) / (g.maxLng - g.minLng)) * (g.N - 1));
  const ci = Math.max(0, Math.min(g.N - 1, i));
  const cj = Math.max(0, Math.min(g.N - 1, j));

  return g.pts[ci * g.N + cj].land;
}


//  Vector walking 
/**
 * Walk a single vector from (clat, clng) along `bearingDeg` for up to
 * `distKm` kilometres.
 *
 * At each step:
 *   - If the next position is land > advance
 *   - If it is water > scan 5deg, 10deg, . 60deg for a redirect bearing
 *     that leads back to land (smallest angle tried first)
 *   - If no redirect within 60deg works > stop here
 *
 * Returns the endpoint as [lng, lat] (GeoJSON coordinate order).
 */
function walkVector(clat, clng, bearingDeg, distKm, grid) {
  const STEPS    = 80;
  const stepKm   = distKm / STEPS;
  const halfStep = stepKm * 0.5;

  let lat = clat;
  let lng = clng;
  let brg = bearingDeg;
  let rem = distKm;

  while (rem > halfStep) {
    const s   = Math.min(stepKm, rem);
    const nxt = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
    const nlng = nxt.geometry.coordinates[0];
    const nlat = nxt.geometry.coordinates[1];

    if (gridIsLand(nlat, nlng, grid)) {
      // Normal advance
      lat = nlat; lng = nlng; rem -= s;
    } else {
      // Water, search for smallest redirect angle back to land
      let redirectBrg = null;

      outer:
      for (let ang = 5; ang <= 60; ang += 5) {
        for (const sign of [-1, 1]) {
          const tb  = ((brg + sign * ang) % 360 + 360) % 360;
          const tp  = turf.destination(turf.point([lng, lat]), s, tb, { units: 'kilometers' });
          const tlng = tp.geometry.coordinates[0];
          const tlat = tp.geometry.coordinates[1];
          if (gridIsLand(tlat, tlng, grid)) {
            redirectBrg = tb;
            break outer;
          }
        }
      }

      if (redirectBrg === null) {
        // Cannot navigate back to land within 60deg, stop
        break;
      }

      // Take one redirected step and continue
      brg = redirectBrg;
      const ap  = turf.destination(turf.point([lng, lat]), s, brg, { units: 'kilometers' });
      lat = ap.geometry.coordinates[1];
      lng = ap.geometry.coordinates[0];
      rem -= s;
    }
  }

  return [lng, lat];
}


//  Main message handler 
self.onmessage = async function (evt) {
  const { clat, clng, outerKm, innerKm } = evt.data;

  try {
    // 1. Load land data
    self.postMessage({ type: 'status', msg: 'Loading Natural Earth land data.' });
    await ensureLandData();

    // 2. Sanity-check: origin must be on land
    if (!isLandPoint(clat, clng)) {
      self.postMessage({
        type: 'error',
        msg:  'Starting point appears to be in water. Please choose a point on land.'
      });
      return;
    }

    // 3. Build land grid
    const N = Math.max(40, Math.min(90, Math.round(outerKm / 10)));
    self.postMessage({ type: 'status', msg: `Building ${N}x${N} land grid.` });
    const grid = buildGrid(clat, clng, outerKm);

    // Send grid back for map visualisation (land points only to keep payload small)
    self.postMessage({ type: 'grid', pts: grid.pts.filter(p => p.land) });

    // 4. Walk 72 vectors (one every 5deg)
    self.postMessage({ type: 'status', msg: 'Walking 72 vectors.' });

    const outerRing = [];
    const innerRing = [];

    for (let i = 0; i < 72; i++) {
      const deg = i * 5;
      outerRing.push(walkVector(clat, clng, deg, outerKm, grid));
      innerRing.push(walkVector(clat, clng, deg, innerKm, grid));

      // Post progress every 9 vectors (every 45deg)
      if (i % 9 === 0) {
        self.postMessage({ type: 'progress', pct: Math.round((i / 72) * 100) });
      }
    }

    // 5. Close rings (GeoJSON polygon: first coord must equal last)
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

    // 7. Done, send everything back
    self.postMessage({ type: 'progress', pct: 100 });
    self.postMessage({ type: 'done', outerRing, innerRing, outerGeo, innerGeo });

  } catch (err) {
    self.postMessage({
      type: 'error',
      msg:  `Worker error: ${err.message || String(err)}`
    });
  }
};