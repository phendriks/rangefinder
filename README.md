# Range Finder

Explore how far you can travel by car or bicycle within a time or distance range.
Select a starting point, set minimum and maximum limits, and view the reachable
area on the map.

Range Finder is a static browser app. Routing and polygon calculations run locally
in a worker, without a routing API. Results are estimates using road and terrain data.

## Getting started

From the project directory:

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000/). Internet access is needed for map tiles,
geocoding, road data, and CDN libraries.

Choose an address, click the map, or press **Use my location**. Select **Drive** or
**Cycle**, enter your limits, then press **Show Range**. Enable **Inspect grid** to
explore the underlying points. Geolocation requires HTTPS or localhost and permission.

## Background preparation

Selecting a location starts loading nearby road tiles and preparing the calculation.
**Show Range** reuses matching work. Tiles, decoded roads, and results remain cached
in browser memory; changing only the minimum limit also reuses the distance field.
Mobile and low-memory devices use smaller caches and preload limits.

## Development

Configuration is in `src/config/`:

- `base-constants.js`: shared enums and geometry
- `travel-constants.js`: speeds, travel costs, road loading, and cache budgets
- `shape-constants.js`: sampling, contours, and tile/node limits
- `ui-constants.js`: map defaults and controls

Run cache and worker lifecycle tests with Node.js:

```sh
node scripts/test-caching.cjs
```

Regenerate country boundaries from Natural Earth:

```sh
python3 scripts/build-country-polygons.py
```

Add `--50m` for higher detail.

## Data and libraries

Roads use OpenStreetMap and OpenMapTiles via OpenFreeMap, with regional fallback
data in `src/data/`. Land boundaries come from Natural Earth; geocoding uses
Nominatim. The app uses Leaflet, Turf.js, and Delaunator.

Travel calibration references: [Giacomin & Levinson (2015)](https://doi.org/10.1068/b130131p)
and [Rupi et al. (2018)](https://doi.org/10.1049/iet-its.2017.0285).
