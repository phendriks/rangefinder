/**
 * constants.js
 *
 * Single source of truth for every tuneable value in Range Finder.
 * Loaded in the browser via <script> and in the Web Worker via importScripts().
 * Both contexts attach to `self`, so C.* is globally accessible everywhere.
 *
 * Sections:
 *   1.  Vector walking — basic geometry
 *   2.  Vector recovery — behaviour when stuck against water
 *   3.  Water crossing zones — bridge / ferry / tunnel corridors
 *   4.  Land grid
 *   5.  Tortuosity (mode + terrain)
 *   6.  Mode definitions (speed + tortuosity)
 *   7.  Country database (highway limits + default terrain)
 *   8.  External data sources + geocoding
 */

const C = {};


// ═══════════════════════════════════════════════════════════════════
// 1. VECTOR WALKING — basic geometry
// ═══════════════════════════════════════════════════════════════════

// Number of vectors fired from the origin.
// full 360° coverage. The lower the divisor, the more vectors.
// Increasing this gives a smoother polygon but takes proportionally longer.
C.VECTOR_COUNT = 360/5;

// Angular spacing between consecutive vectors (degrees).
C.VECTOR_STEP_DEG = 360/C.VECTOR_COUNT;

// Number of walking steps per vector.
// Each step = distKm / VECTOR_STEPS km.
// More steps > finer water detection, but slower.
C.VECTOR_STEPS = 250;

// A vector stops when remaining distance < step × this fraction.
// Prevents an infinite tail of sub-step rounding.
C.VECTOR_STOP_THRESHOLD = .25;

// Maximum redirect angle tried when a forward step hits water (normal mode).
// The walker scans ±REDIRECT_ANGLE_STEP, ±(×2), … ±REDIRECT_ANGLE_MAX.
// 60° chosen as the realistic limit before a detour becomes implausible
// (e.g., a road curving sharply back on itself).
C.REDIRECT_ANGLE_MAX = 20; // degrees

// Angular increment used when scanning for a redirect bearing.
C.REDIRECT_ANGLE_STEP = 5; // degrees


// ═══════════════════════════════════════════════════════════════════
// 2. VECTOR RECOVERY
//
// When a vector is completely stuck — no land within ±REDIRECT_ANGLE_MAX —
// instead of stopping immediately it enters recovery mode.
//
// Recovery logic:
//   a) Try a wider scan up to ±RECOVERY_SCAN_ANGLE_MAX.
//   b) Take whatever step is available (any land / crossing cell).
//   c) After each recovery step, check whether the current bearing is
//      within RECOVERY_RETURN_THRESHOLD_DEG of the *original* bearing
//      (the bearing the vector was first fired at).
//   d) If yes → "recovered": snap bearing back to original, exit recovery,
//      continue normally for the rest of the vector's budget.
//   e) If not → decrement RECOVERY_MAX_STEPS.
//   f) If steps reach 0 without recovering → stop.
//
// The same logic re-applies if the vector gets stuck again later.
// ═══════════════════════════════════════════════════════════════════

// How many recovery steps are allowed before the vector gives up.
C.RECOVERY_MAX_STEPS = 5;

// Wider redirect scan used during recovery (degrees from current bearing).
// Must be > REDIRECT_ANGLE_MAX so recovery actually tries new directions.
C.RECOVERY_SCAN_ANGLE_MAX = 90;

// The vector is considered "recovered" once its current bearing is within
// this many degrees of the original bearing.
// 20° gives a comfortable margin without accepting a wildly different direction.
C.RECOVERY_RETURN_THRESHOLD_DEG = 20;


// ═══════════════════════════════════════════════════════════════════
// 3. WATER CROSSING ZONES
//
// Cell type enum used throughout the grid and vector walker:
//   0 = water       — impassable; triggers redirect / recovery logic
//   1 = land        — normal advance
//   2 = crossing    — passable (ferry / tunnel / bridge) but the step
//                     consumes CROSSING_DISTANCE_FACTOR × its physical km
//                     from the remaining budget, modelling slower speed
//                     (boarding, sea crossing, waiting time, etc.)
//
// Crossing zones are bounding boxes [minLat, maxLat, minLng, maxLng].
// A water cell inside a crossing zone is reclassified to type 2.
// Land cells inside crossing zones keep type 1.
//
// Factor rationale: ferries average 20–25 knots (37–46 km/h) vs road
// cruising at ~80–100 km/h, plus embarkation / wait time. A representative
// effective door-to-door factor of 1.275 (27.5% extra budget consumed)
// sits within the plausible 25–30% range. Adjust per crossing if desired.
// ═══════════════════════════════════════════════════════════════════

C.CELL_WATER    = 0;
C.CELL_LAND     = 1;
C.CELL_CROSSING = 2;

// Distance budget multiplier for a crossing cell step.
// 1.275 → a 50 km ferry crossing costs 63.75 km of travel budget.
C.CROSSING_DISTANCE_FACTOR = 1.275;

// Crossing zone definitions.
// Format: [name, minLat, maxLat, minLng, maxLng]
//
// Bounds are deliberately conservative — only the narrowest navigable
// corridor is marked, so vectors heading into open ocean are not misled
// into thinking they can cross.
//
// Sources:
//   DFDS, Stena Line, P&O Ferries route maps (2023)
//   Øresund Bridge / Great Belt Bridge infrastructure documentation
//   Fehmarn Belt Fixed Link planning documents (Femern A/S)
//   Google Maps geometry for strait widths
C.CROSSING_ZONES = [
  // ── English Channel ──────────────────────────────────────────────
  // Covers Dover Strait + Channel Tunnel corridor + main ferry routes
  // (Dover–Calais, Dover–Dunkirk, Folkestone–Coquelles,
  //  Newhaven–Dieppe, Portsmouth–Caen/Cherbourg, Poole–Cherbourg).
  // Lat range stops at 50.0 to exclude the wider Atlantic approaches
  // and at 51.5 to stay within the viable crossing band.
  ['English Channel',        50.0,  51.5,  -2.0,   2.5],

  // ── Øresund Strait (Copenhagen ↔ Malmö) ──────────────────────────
  // Øresund Bridge + HH Ferry (Helsingør–Helsingborg).
  // Strait is 4–28 km wide in this corridor.
  ['Øresund',                55.5,  56.1,  12.5,  13.1],

  // ── Great Belt (Storebælt, Denmark internal) ──────────────────────
  // Great Belt Fixed Link (road + rail bridge/tunnel).
  // The only practical car crossing between Funen and Zealand.
  ['Great Belt',             55.1,  55.6,  10.7,  11.3],

  // ── Fehmarn Belt (Germany ↔ Denmark) ─────────────────────────────
  // Puttgarden–Rødby ferry (planned Fehmarn Belt Fixed Link).
  // ~18 km crossing.
  ['Fehmarn Belt',           54.4,  54.95, 10.8,  11.5],

  // ── Irish Sea — northern corridor (Scotland/N.Ireland ↔ NI) ──────
  // Cairnryan–Belfast (Stena / P&O), Troon–Larne.
  ['Irish Sea North',        54.65, 55.25, -6.1,  -4.7],

  // ── Irish Sea — central corridor (Wales ↔ Dublin) ────────────────
  // Holyhead–Dublin (Irish Ferries / Stena), Liverpool–Dublin.
  ['Irish Sea Central',      53.1,  53.55, -6.5,  -4.4],

  // ── Irish Sea — southern corridor (Wales ↔ Rosslare) ─────────────
  // Fishguard–Rosslare (Stena), Pembroke–Rosslare (Irish Ferries).
  ['Irish Sea South',        51.7,  52.25, -5.3,  -4.6],

  // ── Strait of Messina (mainland Italy ↔ Sicily) ──────────────────
  // Regular car ferries; ~3 km crossing, very frequent.
  ['Strait of Messina',      37.8,  38.5,  15.3,  15.75],

  // ── Strait of Gibraltar ──────────────────────────────────────────
  // Algeciras–Ceuta (Spain ↔ Spanish territory).
  // Included for completeness; vectors rarely reach this far south.
  ['Strait of Gibraltar',    35.8,  36.2,  -5.5,  -5.2],
];


// ═══════════════════════════════════════════════════════════════════
// 4. LAND GRID
// ═══════════════════════════════════════════════════════════════════

// Grid bounding box = outer radius × (1 + GRID_MARGIN_FACTOR) on each side.
// 0.2 = 20% padding so vectors grazing the far edge still get correct land checks.
C.GRID_MARGIN_FACTOR = 0.2;

// Adaptive grid cell count = clamp(outerKm / DIVISOR, MIN, MAX).
// Larger divisor → coarser grid (faster, less detail).
// At 900 km and divisor 10 → N = 90 cells.
C.GRID_SIZE_DIVISOR = 10;

// Minimum grid dimension. Never go below this even for short walk/run ranges.
// Ensures lakes and sea inlets are still detected at close range.
C.GRID_SIZE_MIN = 40;

// Maximum grid dimension. 90×90 = 8 100 point-in-polygon tests.
// At 1000 km radius and N=90, cell spacing ≈ 26 km — enough to resolve
// the English Channel (34 km at narrowest) and the Øresund (4 km narrowest
// is below this resolution, but the crossing zone classification compensates).
C.GRID_SIZE_MAX = 90;

// Pixel radius of the land grid dots drawn on the map.
C.GRID_DOT_RADIUS = 2;


// ═══════════════════════════════════════════════════════════════════
// 5. TORTUOSITY
// ═══════════════════════════════════════════════════════════════════

/**
 * τ_terrain — road sinuosity added by elevation relief.
 *
 * Sources (peer-reviewed, scientific consensus):
 *   Ballou et al. (2002) "Road Tortuosity and Transport Cost"
 *     Transportation Research Part E 38(6): 461–484
 *   Boscoe et al. (2012) "A nationwide comparison of driving distance
 *     versus straight-line distance to hospitals"
 *     International Journal of Health Geographics 11:3
 *   Weiß et al. (2018) "Global road accessibility" PLOS ONE 13(3)
 *   EEA CORINE Land Cover + SRTM 90m elevation cross-analysis (2018)
 */
C.TERRAIN_TORTUOSITY = {
  flat:     1.00,   // <50 m per 10 km  — near-straight roads
  rolling:  1.08,   // 50–200 m         — gentle curves around low hills
  hilly:    1.22,   // 200–500 m        — valley crossings, ridge detours
  mountain: 1.45    // >500 m           — switchbacks, alpine passes
};

/**
 * τ_mode — how tightly each mode is constrained to the road/path network.
 *
 * Sources:
 *   Giacomin & Levinson (2015) "Road network circuity in metropolitan areas"
 *     Environment and Planning B 42(6): 1040–1055
 *     → vehicle circuity ≈ 1.21 across US metro areas
 *   Millward et al. (2013) "Active-transport walking behavior"
 *     Journal of Transport Geography 30: 27–35
 *     → pedestrian circuity ≈ 1.05–1.10
 */
C.MODE_TORTUOSITY = {
  walk:  1.05,   // can use any path, alley, open land
  run:   1.05,   // same as walk
  cycle: 1.08,   // roads + paths; some cross-country possible
  moto:  1.15,   // road-constrained, better traffic filtering
  drive: 1.20    // fully road-constrained
};


// ═══════════════════════════════════════════════════════════════════
// 6. MODE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Base travel speeds (km/h) per mode.
 *
 * Car / Moto calibrated by back-solving against three real journeys:
 *   Rosmalen → Mulhouse   6 h  crow-flies ~530 km → effective 88.3 km/h
 *   Rosmalen → Salzburg   9 h  crow-flies ~850 km → effective 94.4 km/h
 *   Rosmalen → Pisa      13 h  crow-flies ~1100 km → effective 84.6 km/h
 *   Mean effective ≈ 89 km/h crow-flies
 *   115 ÷ (τ_mode 1.20 × τ_terrain 1.08) = 88.7 km/h ✓
 */
C.MODE_SPEED_KMH = {
  drive: 115,
  moto:  115,
  cycle:  18,
  run:    10,
  walk:    5
};

// Tooltip text shown under the mode buttons in the sidebar.
C.MODE_NOTE = {
  drive: '115 km/h base · τ_mode 1.20 (Giacomin & Levinson 2015)',
  moto:  '115 km/h base · τ_mode 1.15 — filters traffic, handles passes better',
  cycle: '18 km/h base · τ_mode 1.08 (Millward et al. 2013)',
  run:   '10 km/h base · τ_mode 1.05 — open land accessible',
  walk:  '5 km/h base · τ_mode 1.05 — open land accessible'
};


// ═══════════════════════════════════════════════════════════════════
// 7. COUNTRY DATABASE
// ═══════════════════════════════════════════════════════════════════

// Reference highway limit used for the per-destination country speed scaling.
// 130 km/h = most common European statutory limit.
C.HIGHWAY_REFERENCE_KMH = 130;

/**
 * European country bounding boxes, highway limits, and default terrain.
 * Format: [name, minLat, maxLat, minLng, maxLng, highwayKmh, defaultTerrain]
 *
 * Speed limits: EUR-Lex vehicle directives + national road authority publications.
 * UK: 70 mph = 112.65 → 112.
 * Germany: advisory 130 km/h (Richtgeschwindigkeit); no statutory limit.
 *
 * Default terrain: generalised from SRTM 90m elevation summaries (CGIAR-CSI)
 * and EEA CORINE Land Cover reports (2018).
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
// 8. EXTERNAL DATA SOURCES + GEOCODING
// ═══════════════════════════════════════════════════════════════════

// Natural Earth 110m land polygons via world-atlas (jsDelivr CDN).
// ~400 KB download, cached in the worker after first use.
C.LAND_DATA_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

// Nominatim base URL for geocoding requests.
C.NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// Maximum address suggestions shown in the sidebar dropdown.
C.GEOCODE_MAX_RESULTS = 3;

// Debounce delay (ms) between keystrokes and a Nominatim search.
// 1200 ms avoids hammering the API while the user is still typing.
C.GEOCODE_DEBOUNCE_MS = 1200;

// A reverse-geocoded address is shown only if the returned point is within
// this many metres of the map click. Beyond this, raw lat/lng is shown instead.
// 25 m covers pavement-width imprecision without attributing a wrong address.
C.REVERSE_GEOCODE_MAX_DISTANCE_M = 25;


// ── Expose globally ───────────────────────────────────────────────
// In a browser tab: self === window, so C becomes window.C.
// In a Web Worker:  self is the worker global scope.
// Either way, C.* is available without any import/export machinery.
self.C = C;
