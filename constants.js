'use strict';

// constants.js — single source of truth for all tuneable values.
// Loaded via script tag in the browser and importScripts() in the worker.

const C = {};


// Vectors

C.VECTOR_COUNT = 90;
C.VECTOR_STEP_DEG = 360 / C.VECTOR_COUNT;
C.REDIRECT_ANGLE_MAX = 35;


// Layout and UI

C.MOBILE_BREAKPOINT_PX = 640;
C.SIDEBAR_WIDTH_PX = 300;
C.SHEET_TRANSITION_MS = 350;

C.MAP_INITIAL_CENTER = [48, 10];
C.MAP_INITIAL_ZOOM = 5;
C.MAP_GEOCODE_ZOOM = 10;
C.MAP_FIT_PADDING_PX = 40;


// Cell types

C.CELL_WATER = 0;
C.CELL_LAND = 1;
C.CELL_CROSSING = 2;


// Propagation

C.NEIGHBOR_MODE_8 = true;
C.DISTANCE_UNITS = 'kilometers';
C.EXTRACTION_STEPS_DIVISOR = 120;


// Crossings

C.CROSSING_DISTANCE_FACTOR = 1.275;

// Crossing zones as bounding boxes: [name, minLat, maxLat, minLng, maxLng]
C.CROSSING_ZONES = [
	['English Channel',     50.0,  51.5,  -2.0,   2.5],
	['Oresund',             55.5,  56.1,  12.5,  13.1],
	['Great Belt',          55.1,  55.6,  10.7,  11.3],
	['Fehmarn Belt',        54.4,  54.95, 10.8,  11.5],
	['Irish Sea North',     54.65, 55.25, -6.1,  -4.7],
	['Irish Sea Central',   53.1,  53.55, -6.5,  -4.4],
	['Irish Sea South',     51.7,  52.25, -5.3,  -4.6],
	['Strait of Messina',   37.8,  38.5,  15.3,  15.75],
	['Strait of Gibraltar', 35.8,  36.2,  -5.5,  -5.2]
];


// Land grid

C.GRID_MARGIN_FACTOR = 0.2;
C.GRID_SIZE_DIVISOR = 5;
C.GRID_SIZE_MIN = 20;
C.GRID_SIZE_MAX = 90;

C.GRID_DOT_RADIUS = 2;


// Tortuosity

C.TERRAIN_TORTUOSITY = {
	flat: 1.00,
	rolling: 1.08,
	hilly: 1.22,
	mountain: 1.45
};

C.MODE_TORTUOSITY = {
	walk: 1.05,
	run: 1.05,
	cycle: 1.08,
	moto: 1.15,
	drive: 1.20
};

C.MODE_SPEED_KMH = {
	drive: 115,
	moto: 115,
	cycle: 18,
	run: 10,
	walk: 5
};

C.MODE_NOTE = {
	drive: '115 km/h base, tau_mode 1.20 (Giacomin & Levinson 2015)',
	moto: '115 km/h base, tau_mode 1.15, filters traffic and handles mountain passes better',
	cycle: '18 km/h base, tau_mode 1.08 (Millward et al. 2013)',
	run: '10 km/h base, tau_mode 1.05, open land accessible',
	walk: '5 km/h base, tau_mode 1.05, open land accessible'
};


// Country database: [name, minLat, maxLat, minLng, maxLng, highwayKmh, defaultTerrain]

C.COUNTRY_DB = [
	['Albania',       39.6, 42.7,  19.2,  21.1,  110, 'hilly'],
	['Austria',       46.4, 49.0,   9.5,  17.2,  130, 'hilly'],
	['Belarus',       51.3, 56.2,  23.2,  32.8,  120, 'flat'],
	['Belgium',       49.5, 51.5,   2.5,   6.4,  120, 'flat'],
	['Bosnia',        42.6, 45.3,  15.7,  19.7,  130, 'hilly'],
	['Bulgaria',      41.2, 44.2,  22.4,  28.6,  140, 'rolling'],
	['Croatia',       42.4, 46.6,  13.5,  19.5,  130, 'rolling'],
	['Cyprus',        34.5, 35.7,  32.3,  34.6,  100, 'rolling'],
	['Czech Rep.',    48.6, 51.1,  12.1,  18.9,  130, 'rolling'],
	['Denmark',       54.6, 57.8,   8.1,  15.2,  130, 'flat'],
	['Estonia',       57.5, 59.7,  21.8,  28.2,  110, 'flat'],
	['Finland',       59.8, 70.1,  19.1,  31.6,  120, 'flat'],
	['France',        42.3, 51.1,  -4.8,   8.2,  130, 'rolling'],
	['Germany',       47.3, 55.1,   5.9,  15.0,  130, 'rolling'],
	['Greece',        34.8, 41.8,  19.4,  26.6,  130, 'hilly'],
	['Hungary',       45.7, 48.6,  16.1,  22.9,  130, 'flat'],
	['Iceland',       63.4, 66.6, -24.5, -13.5,   90, 'mountain'],
	['Ireland',       51.4, 55.4, -10.5,  -6.0,  120, 'rolling'],
	['Italy',         36.6, 47.1,   6.6,  18.5,  130, 'rolling'],
	['Kosovo',        41.9, 43.3,  20.0,  21.8,  110, 'hilly'],
	['Latvia',        55.7, 58.1,  20.9,  28.2,  110, 'flat'],
	['Lithuania',     53.9, 56.5,  21.0,  26.9,  130, 'flat'],
	['Luxembourg',    49.4, 50.2,   5.7,   6.5,  130, 'rolling'],
	['Malta',         35.8, 36.1,  14.2,  14.6,   80, 'flat'],
	['Moldova',       45.5, 48.5,  26.6,  30.2,  110, 'rolling'],
	['Montenegro',    41.9, 43.6,  18.4,  20.4,  130, 'mountain'],
	['Netherlands',   50.8, 53.6,   3.4,   7.2,  100, 'flat'],
	['N. Macedonia',  40.9, 42.4,  20.5,  23.0,  130, 'hilly'],
	['Norway',        57.9, 71.2,   4.5,  31.1,  110, 'mountain'],
	['Poland',        49.0, 54.9,  14.1,  24.2,  140, 'flat'],
	['Portugal',      36.9, 42.2,  -9.5,  -6.2,  120, 'rolling'],
	['Romania',       43.6, 48.3,  22.0,  30.1,  130, 'rolling'],
	['Serbia',        42.2, 46.2,  19.0,  23.0,  130, 'rolling'],
	['Slovakia',      47.7, 49.6,  16.8,  22.6,  130, 'hilly'],
	['Slovenia',      45.4, 46.9,  13.4,  16.6,  130, 'hilly'],
	['Spain',         36.0, 43.8,  -9.3,   4.3,  120, 'rolling'],
	['Sweden',        55.3, 69.1,  11.1,  24.2,  120, 'rolling'],
	['Switzerland',   45.8, 47.9,   5.9,  10.5,  120, 'mountain'],
	['Turkey',        35.8, 42.1,  26.0,  44.8,  120, 'rolling'],
	['Ukraine',       44.4, 52.4,  22.1,  40.2,  130, 'rolling'],
	['UK',            49.9, 60.9,  -8.2,   2.0,  112, 'rolling']
];


// External data and geocoding

C.LAND_DATA_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

C.NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
C.NOMINATIM_HEADERS = {
	'Accept-Language': 'en',
	'User-Agent': 'RangeFinderApp/1.0'
};

C.GEOCODE_MAX_RESULTS = 3;
C.GEOCODE_DEBOUNCE_MS = 1200;
C.GEOCODE_MIN_QUERY_LENGTH = 3;

C.REVERSE_GEOCODE_MAX_DISTANCE_M = 25;
C.REVERSE_GEOCODE_ZOOM = 18;


// Expose as C on both window (browser) and global scope (worker)

self.C = C;
