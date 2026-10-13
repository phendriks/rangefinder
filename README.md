# Range Finder

Static map app for estimating reachable driving and cycling areas. Calculations
run locally in a worker; no routing API is used.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/. Libraries and live road tiles require internet access.
**Use my location** requires HTTPS or localhost and asks for permission when pressed.

## Configuration

Files in `src/config/`:

- `base-constants.js`: shared enums and geometry constants
- `travel-constants.js`: travel costs, roads, and cache budgets
- `shape-constants.js`: mesh, contours, and tile/node limits
- `ui-constants.js`: map defaults and control behaviour

## Roads and caching

OpenFreeMap tiles supply driving roads and cycle-accessible roads, tracks, and
paths. Synthetic regional data in `src/data/` provides a fallback. Calculations
use at most 200 tiles and 15,000 road nodes, with zoom 4-8 for driving and up to 12
for cycling. Disable live roads with `C.USE_VECTOR_ROADS = false`.

Selecting a location starts background preparation, fetching nearby tiles first.
The persistent worker reuses tiles, decoded roads, tile scores, and matching
results. Changing only the minimum range reuses the mesh and distance field.
**Show Range** continues matching preparation already underway.

Caches stay in memory with smaller budgets and preload limits on mobile,
low-memory devices, and data-saving connections. Failed downloads are retried;
cancelled work cannot display stale results. Decoded memory budgets are estimates.

## Tests

```sh
node scripts/test-caching.cjs
```

## Country polygons

Regenerate `src/data/countriesNaturalEarth.js` from Natural Earth:

```sh
python3 scripts/build-country-polygons.py
```

Add `--50m` for higher detail.

## Sources

Roads: OpenStreetMap / OpenMapTiles via OpenFreeMap. Land: Natural Earth.
Mode calibration: [Giacomin & Levinson (2015)](https://doi.org/10.1068/b130131p)
and [Rupi et al. (2018)](https://doi.org/10.1049/iet-its.2017.0285).
