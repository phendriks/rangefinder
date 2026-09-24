# Range Finder

Static browser app that computes reachable areas on a map.

## Run locally

From the project root:

	python3 -m http.server 8000

Open:

	http://localhost:8000/

Notes:
- This app uses Leaflet and Turf via CDN.
- The worker is loaded from src/worker.

## Natural Earth country polygons


To generate a global set from Natural Earth and write it into
src/data/countriesNaturalEarth.js:

	python3 scripts/build-country-polygons.py

To use a higher detail dataset:

	python3 scripts/build-country-polygons.py --50m

## Config files

- `src/config/base-constants.js`: shared primitives and global bounds
- `src/config/travel-constants.js`: routing, roads, crossings, and `speedClass` tuning
- `src/config/shape-constants.js`: grid, mesh, and contour generation
- `src/config/ui-constants.js`: map defaults, colours, and browser/UI behaviour

## Road tile sources

- `src/data/network-tiles.js`: shared network tile helpers and synthetic region registration
- `src/data/europe-tiles.js`: Europe road tiles plus synthesized terrain severity
- `src/data/north-america-tiles.js`: synthetic North America road and terrain tiles
- `src/data/north-africa-tiles.js`: synthetic North Africa road and terrain tiles
- `src/data/middle-east-tiles.js`: synthetic Middle East road and terrain tiles

## Live fast-road geometry

Calculations optionally load a bounded set of OpenFreeMap vector tiles and extract
motorways, trunks, their ramps, and primary expressways. These lines become explicit
mesh edges while the existing synthetic road/terrain tiles remain the fallback. A
bounded set of ordinary-cost support points is placed on both sides of the sampled
roads so the contour can transition out of fast-road corridors at finer resolution.

The worker selects zoom 4-8 adaptively, requests no more than 200 tiles per
calculation, caches tile promises, and falls back without failing when metadata,
decoder modules, or tiles are unavailable. Set `C.USE_VECTOR_ROADS = false` in
`src/config/travel-constants.js` to disable live road loading.

Road data uses the OpenMapTiles schema and OpenStreetMap data. No routing API is
called; Dijkstra and contour generation remain local.
