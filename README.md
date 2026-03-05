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
src/data/countries-natural-earth.js:

	python3 scripts/build-country-polygons.py

To use a higher detail dataset:

	python3 scripts/build-country-polygons.py --50m
