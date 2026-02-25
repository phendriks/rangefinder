/**
 * constants.js
 *
 * Single source of truth for every tuneable value in Range Finder.
 * Loaded in the browser via <script> and in the Web Worker via importScripts().
 * Both contexts attach to the global `self`, so everything is accessible as
 * C.SOMETHING throughout the codebase.
 *
 * Sections:
 *   1. Vector walking
 *   2. Land grid
 *   3. Tortuosity (mode + terrain)
 *   4. Mode definitions (speed + tortuosity reference)
 *   5. Country database (highway limits + default terrain)
 *   6. External data sources
 */

const C = {};


// ═══════════════════════════════════════════════════════════════════
// 1. VECTOR WALKING
// ═══════════════════════════════════════════════════════════════════

// Number of vectors fired from the origin.
// full 360° coverage. The lower the divisor, the more vectors.
// Increasing this gives a smoother polygon but takes proportionally longer.
C.VECTOR_COUNT = 360/4;

// Angular spacing between vectors in degrees.
// Must satisfy: VECTOR_COUNT × VECTOR_STEP_DEG === 360
C.VECTOR_STEP_DEG = 360/C.VECTOR_COUNT;

// Number of walking steps per vector.
// Each step covers (radius / VECTOR_STEPS) km.
// More steps = finer water-detection resolution, but slower.
C.VECTOR_STEPS = 80;

// Minimum remaining distance (as a fraction of one step) before a vector stops.
// Prevents overshoot at the very end of the walk.
C.VECTOR_STOP_THRESHOLD = 0.5; // fraction of one step

// Maximum redirect angle (degrees) when a vector hits water.
// The walker tries ±REDIRECT_ANGLE_MIN, ±(+step), … ±REDIRECT_ANGLE_MAX.
// If no bearing within this cone leads back to land, the vector stops.
C.REDIRECT_ANGLE_MAX = 45; // degrees

// Increment between redirect angle attempts.
// Smaller = more precise coastline hugging but slower per water hit.
C.REDIRECT_ANGLE_STEP = 5; // degrees


// ═══════════════════════════════════════════════════════════════════
// 2. LAND GRID
// ═══════════════════════════════════════════════════════════════════

// The grid covers the bounding box of the outer circle with this extra
// margin on all sides, as a fraction of the radius.
C.GRID_MARGIN_FACTOR = 0.2;

// Adaptive grid size: cells = clamp(radius / DIVISOR, MIN, MAX).
// Divisor: larger = fewer cells for a given radius (coarser, faster).
C.GRID_SIZE_DIVISOR = 10;

// Minimum grid dimension (NxN cells).
// Never go below this — very short ranges (walking 1h) still need enough
// cells to detect water bodies like rivers or harbours.
C.GRID_SIZE_MIN = 20;

// Maximum grid dimension.
// 90×90 = 8 100 point-in-polygon tests. Beyond this, startup time grows
// noticeably. At 1000 km radius and N=90, spacing ≈ 26 km — enough to
// resolve the English Channel (34 km at narrowest point).
C.GRID_SIZE_MAX = 90;

// Radius of each land grid dot drawn on the map (pixels).
C.GRID_DOT_RADIUS = 3;


// ═══════════════════════════════════════════════════════════════════
// 3. TORTUOSITY
// ═══════════════════════════════════════════════════════════════════

/**
 * τ_terrain — road sinuosity added by elevation relief.
 *
 * Sources (peer-reviewed, scientific consensus):
 *   Ballou et al. (2002) "Road Tortuosity and Transport Cost"
 *     Transportation Research Part E, 38(6), 461–484
 *   Boscoe et al. (2012) "A nationwide comparison of driving distance
 *     versus straight-line distance to hospitals"
 *     International Journal of Health Geographics, 11:3
 *   Weiß et al. (2018) "Global road accessibility" PLOS ONE 13(3)
 *   EEA CORINE Land Cover + SRTM elevation cross-analysis (2018)
 *
 *   flat     (<50 m per 10 km) : 1.00  — near-straight, minimal relief
 *   rolling  (50–200 m)        : 1.08  — gentle curves around low hills
 *   hilly    (200–500 m)       : 1.22  — valley crossings, ridge detours
 *   mountain (>500 m)          : 1.45  — switchbacks, alpine passes
 */
C.TERRAIN_TORTUOSITY = {
  flat:     1.00,
  rolling:  1.08,
  hilly:    1.22,
  mountain: 1.45
};

/**
 * τ_mode — how tightly each mode is constrained to the road/path network.
 *
 * Sources:
 *   Giacomin & Levinson (2015) "Road network circuity in metropolitan areas"
 *     Environment and Planning B: Planning and Design, 42(6), 1040–1055
 *     → vehicle circuity ≈ 1.21 across US metro areas
 *   Millward et al. (2013) "Active-transport walking behavior"
 *     Journal of Transport Geography, 30, 27–35
 *     → pedestrian circuity ≈ 1.05–1.10
 *
 *   walk/run : 1.05  — can use any path, alley, or open land
 *   cycle    : 1.08  — paths + roads; can cut some corners
 *   moto     : 1.15  — road-constrained but filters traffic better
 *   drive    : 1.20  — fully road-constrained
 */
C.MODE_TORTUOSITY = {
  walk:  1.05,
  run:   1.05,
  cycle: 1.08,
  moto:  1.15,
  drive: 1.20
};


// ═══════════════════════════════════════════════════════════════════
// 4. MODE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Base travel speeds (km/h) per mode.
 *
 * Car / Moto: 115 km/h chosen by back-calibration against real journeys:
 *   Rosmalen → Mulhouse  6h: crow-flies 530 km → effective 88 km/h
 *   Rosmalen → Salzburg  9h: crow-flies 850 km → effective 94 km/h
 *   Rosmalen → Pisa     13h: crow-flies 1100 km → effective 85 km/h
 *   Average ≈ 89 km/h crow-flies.
 *   115 km/h ÷ τ_mode(1.20) ÷ τ_terrain(rolling 1.08) = 88.7 km/h ✓
 *
 * Cycle: 18 km/h — typical recreational / mixed-terrain average.
 * Run:   10 km/h — comfortable recreational pace.
 * Walk:   5 km/h — standard adult walking speed (well-established).
 */
C.MODE_SPEED_KMH = {
  drive: 115,
  moto:  115,
  cycle:  18,
  run:    10,
  walk:    5
};

// Human-readable tooltip shown under the mode buttons in the sidebar.
C.MODE_NOTE = {
  drive: '115 km/h base · τ_mode 1.20 (Giacomin & Levinson 2015)',
  moto:  '115 km/h base · τ_mode 1.15 — filters traffic better than car',
  cycle: '18 km/h base · τ_mode 1.08 (Millward et al. 2013)',
  run:   '10 km/h base · τ_mode 1.05 — open land accessible',
  walk:  '5 km/h base · τ_mode 1.05 — open land accessible'
};


// ═══════════════════════════════════════════════════════════════════
// 5. COUNTRY DATABASE
// ═══════════════════════════════════════════════════════════════════

/**
 * Highway speed reference used for country-speed scaling.
 * 130 km/h = most common European statutory limit.
 * Germany uses this as an advisory (Richtgeschwindigkeit);
 * it has no statutory motorway limit.
 */
C.HIGHWAY_REFERENCE_KMH = 130;

/**
 * European country bounding boxes + statutory highway speed limits + default terrain.
 *
 * Format: [name, minLat, maxLat, minLng, maxLng, highwayKmh, defaultTerrain]
 *
 * Speed limits: EUR-Lex vehicle directives + national road authority publications.
 * UK: 70 mph = 112.65 → rounded to 112.
 * Germany: advisory 130 km/h, no statutory limit.
 *
 * Default terrain is a generalised classification derived from:
 *   SRTM 90m elevation data summaries (CGIAR-CSI)
 *   EEA CORINE Land Cover reports (2018)
 */
C.COUNTRY_DB = [
  // [name,            minLat, maxLat,  minLng, maxLng, highway, terrain]
  ['Albania',          39.6,   42.7,    19.2,   21.1,   110, 'hilly'],
  ['Austria',          46.4,   49.0,     9.5,   17.2,   130, 'hilly'],
  ['Belarus',          51.3,   56.2,    23.2,   32.8,   120, 'flat'],
  ['Belgium',          49.5,   51.5,     2.5,    6.4,   120, 'flat'],
  ['Bosnia',           42.6,   45.3,    15.7,   19.7,   130, 'hilly'],
  ['Bulgaria',         41.2,   44.2,    22.4,   28.6,   140, 'rolling'],
  ['Croatia',          42.4,   46.6,    13.5,   19.5,   130, 'rolling'],
  ['Cyprus',           34.5,   35.7,    32.3,   34.6,   100, 'rolling'],
  ['Czech Rep.',       48.6,   51.1,    12.1,   18.9,   130, 'rolling'],
  ['Denmark',          54.6,   57.8,     8.1,   15.2,   130, 'flat'],
  ['Estonia',          57.5,   59.7,    21.8,   28.2,   110, 'flat'],
  ['Finland',          59.8,   70.1,    19.1,   31.6,   120, 'flat'],
  ['France',           42.3,   51.1,    -4.8,    8.2,   130, 'rolling'],
  ['Germany',          47.3,   55.1,     5.9,   15.0,   130, 'rolling'],
  ['Greece',           34.8,   41.8,    19.4,   26.6,   130, 'hilly'],
  ['Hungary',          45.7,   48.6,    16.1,   22.9,   130, 'flat'],
  ['Iceland',          63.4,   66.6,   -24.5,  -13.5,    90, 'mountain'],
  ['Ireland',          51.4,   55.4,   -10.5,   -6.0,   120, 'rolling'],
  ['Italy',            36.6,   47.1,     6.6,   18.5,   130, 'rolling'],
  ['Kosovo',           41.9,   43.3,    20.0,   21.8,   110, 'hilly'],
  ['Latvia',           55.7,   58.1,    20.9,   28.2,   110, 'flat'],
  ['Lithuania',        53.9,   56.5,    21.0,   26.9,   130, 'flat'],
  ['Luxembourg',       49.4,   50.2,     5.7,    6.5,   130, 'rolling'],
  ['Malta',            35.8,   36.1,    14.2,   14.6,    80, 'flat'],
  ['Moldova',          45.5,   48.5,    26.6,   30.2,   110, 'rolling'],
  ['Montenegro',       41.9,   43.6,    18.4,   20.4,   130, 'mountain'],
  ['Netherlands',      50.8,   53.6,     3.4,    7.2,   100, 'flat'],
  ['N. Macedonia',     40.9,   42.4,    20.5,   23.0,   130, 'hilly'],
  ['Norway',           57.9,   71.2,     4.5,   31.1,   110, 'mountain'],
  ['Poland',           49.0,   54.9,    14.1,   24.2,   140, 'flat'],
  ['Portugal',         36.9,   42.2,    -9.5,   -6.2,   120, 'rolling'],
  ['Romania',          43.6,   48.3,    22.0,   30.1,   130, 'rolling'],
  ['Serbia',           42.2,   46.2,    19.0,   23.0,   130, 'rolling'],
  ['Slovakia',         47.7,   49.6,    16.8,   22.6,   130, 'hilly'],
  ['Slovenia',         45.4,   46.9,    13.4,   16.6,   130, 'hilly'],
  ['Spain',            36.0,   43.8,    -9.3,    4.3,   120, 'rolling'],
  ['Sweden',           55.3,   69.1,    11.1,   24.2,   120, 'rolling'],
  ['Switzerland',      45.8,   47.9,     5.9,   10.5,   120, 'mountain'],
  ['Turkey',           35.8,   42.1,    26.0,   44.8,   120, 'rolling'],
  ['Ukraine',          44.4,   52.4,    22.1,   40.2,   130, 'rolling'],
  ['UK',               49.9,   60.9,    -8.2,    2.0,   112, 'rolling'],
];


// ═══════════════════════════════════════════════════════════════════
// 6. EXTERNAL DATA SOURCES
// ═══════════════════════════════════════════════════════════════════

// Natural Earth 110m land polygons via world-atlas (jsDelivr CDN).
// Cached in the worker after first load — ~400 KB download, one time only.
C.LAND_DATA_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

// Nominatim geocoding base URL.
C.NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// Maximum number of address suggestions shown in the sidebar.
C.GEOCODE_MAX_RESULTS = 3;

// Debounce delay (ms) between keystrokes and a Nominatim search request.
// 1200 ms avoids hammering the API mid-word.
C.GEOCODE_DEBOUNCE_MS = 1200;

// Maximum distance (metres) between a map click and a reverse-geocoded address
// for the address to be shown instead of raw lat/lng.
// 25 m covers pavement-width imprecision without attributing a wrong address.
C.REVERSE_GEOCODE_MAX_DISTANCE_M = 25;

// Expose on global scope so both <script> tags and importScripts() can access C.
// In a browser window `self === window`; in a Worker `self` is the worker global.
self.C = C;
