# Range Finder
Static browser app that computes reachable areas on a map.

Running at: https://rangefinder.pimhendriks-09.workers.dev/


## Live fast-road geometry

Calculations optionally load a bounded set of OpenFreeMap vector tiles and extract motorways, trunks, their ramps, and primary expressways. These lines become explicit
mesh edges while the existing synthetic road/terrain tiles remain the fallback. A bounded set of ordinary-cost support points is placed on both sides of the sampled
roads so the contour can transition out of fast-road corridors at finer resolution. 

The worker selects zoom 4-8 adaptively, requests no more than 200 tiles per calculation, caches tile promises, and falls back without failing when metadata, decoder modules, or tiles are unavailable. Road data uses the OpenMapTiles schema and OpenStreetMap data. No routing API is called; Dijkstra and contour generation is runtime.

Set `C.USE_VECTOR_ROADS = false` in
`src/config/travel-constants.js` to disable live road loading. (it's a lot faster without)

Drive mode extracts motorways, trunks, ramps, and primary expressways. Cycle mode instead extracts cycle-accessible ordinary roads, tracks, and paths; it adaptively
uses detail up to zoom 12 for small ranges while retaining the shared 200-tile and 15,000-node limits. 

Mode calibration references:

- Giacomin and Levinson (2015), *Road network circuity in metropolitan areas*,
  https://doi.org/10.1068/b130131p
- Rupi, Schweizer, and Bernardi (2018), *Evaluating cyclist patterns using GPS data
  from smartphones*, https://doi.org/10.1049/iet-its.2017.0285
