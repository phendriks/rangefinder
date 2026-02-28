// constants.js - single source of truth for all tuneable values.
// Loaded via script tag in the browser and importScripts() in the worker.

const C = {}; 

C.VECTOR_COUNT				= 90;
C.VECTOR_STEP_DEG			= 360 / C.VECTOR_COUNT;

C.CELL_WATER				= 0;
C.CELL_LAND					= 1;
C.CELL_CROSSING				= 2;

C.NEIGHBOR_MODE_8			= true;
C.DISTANCE_UNITS			= 'kilometers';

C.EXTRACTION_STEPS_DIVISOR	= 120;

// Geodesy
C.EARTH_RADIUS_KM				= 6371;
C.KM_PER_DEG_LAT				= 111;

// Isobands
C.ISOBAND_UNREACHED_COST_FACTOR	= 1000;

// Delaunay neighbor controls
C.DELAUNAY_MAX_EDGE_FACTOR		= 3;

// Delaunay jitter breaks grid degeneracy for triangulation.
C.DELAUNAY_JITTER_FACTOR		= 0.15;
C.DELAUNAY_JITTER_SEED			= 1;
C.DELAUNAY_JITTER_HASH_A		= 12.9898;
C.DELAUNAY_JITTER_HASH_B		= 43758.5453;
C.DELAUNAY_JITTER_SALT_STEP	= 1013;

// Ferry/bridge crossings consume more budget to model slower effective speed.
C.CROSSING_DISTANCE_FACTOR	= 1.5;

// Land grid
C.GRID_MARGIN_FACTOR		= 0.2;	 // padding around outer radius bounding box as a fraction
C.GRID_SIZE_DIVISOR			= 10;		// N = clamp(outerKm / divisor, min, max)
C.GRID_SIZE_MIN				= 20;
C.GRID_SIZE_MAX				= 90;
C.GRID_SIZE_BONUS			= 2;

// Tortuosity: tau_terrain - road sinuosity added by elevation relief.
// Values from Ballou 2002, Boscoe 2012, Weiss 2018 / EEA CORINE 2018.
C.TERRAIN_TORTUOSITY = {
	flat					: 1.00,	// under 50m per 10km, near-straight roads
	rolling					: 1.08,	// 50 to 200m, gentle curves
	hilly					: 1.22,	// 200 to 500m, valley crossings and ridge detours
	mountain				: 1.45,	// over 500m, switchbacks and alpine passes
};

// Tortuosity: tau_mode - network constraint per mode.
// Values from Giacomin & Levinson 2015, Millward et al 2013.
C.MODE_TORTUOSITY = {
	walk					: 1.05,
	run						: 1.05,
	cycle					: 1.08,
	moto					: 1.15,
	drive					: 1.20,
};

// Base speeds calibrated against real drives: 115 / (1.20 * 1.08) = 88.7 km/h crow-flies.
C.MODE_SPEED_KMH = {
	drive:	115,
	moto:	115,
	cycle:	18,
	run:	10,
	walk:	5,
};

C.MODE_NOTE = {
	drive: '115 km/h base, tau_mode 1.20 (Giacomin & Levinson 2015)',
	moto:	'115 km/h base, tau_mode 1.15, filters traffic and handles mountain passes better',
	cycle: '18 km/h base, tau_mode 1.08 (Millward et al. 2013)',
	run:	 '10 km/h base, tau_mode 1.05, open land accessible',
	walk:	'5 km/h base, tau_mode 1.05, open land accessible',
};

// Country database: [name, minLat, maxLat, minLng, maxLng, highwayKmh, defaultTerrain]
// Speeds from EUR-Lex and national road authority publications.
// Terrain generalised from SRTM 90m and EEA CORINE Land Cover 2018.
C.COUNTRY_DB = [
	['Albania',			39.6, 42.7,	19.2,	21.1,	110, 'hilly'],
	['Austria',			46.4, 49.0,	 9.5,	17.2,	130, 'hilly'],
	['Belarus',			51.3, 56.2,	23.2,	32.8,	120, 'flat'],
	['Belgium',			49.5, 51.5,	 2.5,	 6.4,	120, 'flat'],
	['Bosnia',			42.6, 45.3,	15.7,	19.7,	130, 'hilly'],
	['Bulgaria',		41.2, 44.2,	22.4,	28.6,	140, 'rolling'],
	['Croatia',			42.4, 46.6,	13.5,	19.5,	130, 'rolling'],
	['Cyprus',			34.5, 35.7,	32.3,	34.6,	100, 'rolling'],
	['Czech Rep.',		48.6, 51.1,	12.1,	18.9,	130, 'rolling'],
	['Denmark',			54.6, 57.8,	 8.1,	15.2,	130, 'flat'],
	['Estonia',			57.5, 59.7,	21.8,	28.2,	110, 'flat'],
	['Finland',			59.8, 70.1,	19.1,	31.6,	120, 'flat'],
	['France',			42.3, 51.1,	-4.8,	 8.2,	130, 'rolling'],
	['Germany',			47.3, 55.1,	 5.9,	15.0,	130, 'rolling'],
	['Greece',			34.8, 41.8,	19.4,	26.6,	130, 'hilly'],
	['Hungary',			45.7, 48.6,	16.1,	22.9,	130, 'flat'],
	['Iceland',			63.4, 66.6, -24.5, -13.5,	 90, 'mountain'],
	['Ireland',			51.4, 55.4, -10.5,	-6.0,	120, 'rolling'],
	['Italy',			36.6, 47.1,	 6.6,	18.5,	130, 'rolling'],
	['Kosovo',			41.9, 43.3,	20.0,	21.8,	110, 'hilly'],
	['Latvia',			55.7, 58.1,	20.9,	28.2,	110, 'flat'],
	['Lithuania',		53.9, 56.5,	21.0,	26.9,	130, 'flat'],
	['Luxembourg',		49.4, 50.2,	 5.7,	 6.5,	130, 'rolling'],
	['Malta',			35.8, 36.1,	14.2,	14.6,	 80, 'flat'],
	['Moldova',			45.5, 48.5,	26.6,	30.2,	110, 'rolling'],
	['Montenegro',		41.9, 43.6,	18.4,	20.4,	130, 'mountain'],
	['Netherlands',	 	50.8, 53.6,	 3.4,	 7.2,	100, 'flat'],
	['N. Macedonia',	40.9, 42.4,	20.5,	23.0,	130, 'hilly'],
	['Norway',			57.9, 71.2,	 4.5,	31.1,	110, 'mountain'],
	['Poland',			49.0, 54.9,	14.1,	24.2,	140, 'flat'],
	['Portugal',		36.9, 42.2,	-9.5,	-6.2,	120, 'rolling'],
	['Romania',			43.6, 48.3,	22.0,	30.1,	130, 'rolling'],
	['Serbia',			42.2, 46.2,	19.0,	23.0,	130, 'rolling'],
	['Slovakia',		47.7, 49.6,	16.8,	22.6,	130, 'hilly'],
	['Slovenia',		45.4, 46.9,	13.4,	16.6,	130, 'hilly'],
	['Spain',			36.0, 43.8,	-9.3,	 4.3,	120, 'rolling'],
	['Sweden',			55.3, 69.1,	11.1,	24.2,	120, 'rolling'],
	['Switzerland',	 	45.8, 47.9,	 5.9,	10.5,	120, 'mountain'],
	['Turkey',			35.8, 42.1,	26.0,	44.8,	120, 'rolling'],
	['Morocco',			21.420734, 35.759988,	-17.020428,	-1.124551,	120, 'rolling'],
	['Algeria',			19.057364, 37.118381,	 -8.6844,	11.999506,	120, 'rolling'],
	['Tunisia',			30.307556, 37.349994,	 7.524482,	11.488787,	110, 'flat'],
	['Libya',			19.58047, 33.136996,	 9.319411,	25.16482,	120, 'flat'],
	['Egypt',			22.0, 31.58568,	24.70007,	36.86623,	120, 'flat'],
	['Israel',			29.501326, 33.277426,	34.265433,	35.836397,	110, 'hilly'],
	['Palestine',		31.353435, 32.532511,	34.927408,	35.545665,	110, 'hilly'],
	['Jordan',			29.197495, 33.378686,	34.922603,	39.195468,	120, 'rolling'],
	['Lebanon',			33.08904, 34.644914,	35.126053,	36.61175,	110, 'mountain'],
	['Syria',			32.312938, 37.229873,	35.700798,	42.349591,	120, 'rolling'],
	['W. Sahara',		20.999752, 27.656426,	-17.063423,	-8.665124,	110, 'flat'],
	['Ukraine',			44.4, 52.4,	22.1,	40.2,	130, 'rolling'],
	['UK',				49.9, 60.9,	-8.2,	 2.0,	112, 'rolling'],
];

// Country polygons are loaded from country-polygons.js in the browser.
C.COUNTRY_POLYGONS			= [];


// Crossing zones as bounding boxes: [name, minLat, maxLat, minLng, maxLng]
C.CROSSING_ZONES = [
	['English Channel',		50.0,	51.5,	-2.0,	 2.5],	// Dover Strait + tunnel + main ferries
	['Oresund',				55.5,	56.1,	12.5,	13.1],	// Copenhagen to Malmo bridge + HH ferry
	['Great Belt',			55.1,	55.6,	10.7,	11.3],	// Funen to Zealand fixed link
	['Fehmarn Belt',		54.4,	54.95, 10.8,	11.5],	// Puttgarden to Rodby ferry
	['Irish Sea North',		54.65,	55.25, -6.1,	-4.7],	// Cairnryan to Belfast
	['Irish Sea Central',	53.1,	53.55, -6.5,	-4.4],	// Holyhead to Dublin
	['Irish Sea South',		51.7,	52.25, -5.3,	-4.6],	// Fishguard/Pembroke to Rosslare
	['Strait of Messina',	37.8,	38.5,	15.3,	15.75], // mainland Italy to Sicily
	['Strait of Gibraltar',	35.8,	36.2,	-5.5,	-5.2],	// Algeciras to Ceuta
];

// Crossing polygons improve accuracy over bounding boxes.
// Format: [name, [ring, ring, ...]] where ring is an array of [lng, lat].
// Use CROSSING_ZONES as a fallback if polygons are missing.
C.CROSSING_POLYGONS = [
	['English Channel', [
		[
			[-1.95, 50.75],
			[ 1.95, 50.75],
			[ 1.95, 51.35],
			[-1.95, 51.35],
			[-1.95, 50.75],
		],
		[
			[-5.90, 49.85],
			[-1.10, 49.85],
			[-1.10, 50.75],
			[-5.90, 50.75],
			[-5.90, 49.85],
		],
	]],

	['Oresund', [
		[
			[12.40, 55.45],
			[13.25, 55.45],
			[13.25, 56.15],
			[12.40, 56.15],
			[12.40, 55.45],
		],
	]],
	['Great Belt', [
		[
			[10.55, 55.05],
			[11.40, 55.05],
			[11.40, 55.65],
			[10.55, 55.65],
			[10.55, 55.05],
		],
	]],
	['Fehmarn Belt', [
		[
			[10.65, 54.35],
			[11.65, 54.35],
			[11.65, 55.00],
			[10.65, 55.00],
			[10.65, 54.35],
		],
	]],
	['Irish Sea North', [
		[
			[-6.25, 54.55],
			[-4.55, 54.55],
			[-4.55, 55.35],
			[-6.25, 55.35],
			[-6.25, 54.55],
		],
	]],
	['Irish Sea Central', [
		[
			[-6.65, 53.00],
			[-4.25, 53.00],
			[-4.25, 53.65],
			[-6.65, 53.65],
			[-6.65, 53.00],
		],
	]],
	['Irish Sea South', [
		[
			[-5.40, 51.60],
			[-4.45, 51.60],
			[-4.45, 52.35],
			[-5.40, 52.35],
			[-5.40, 51.60],
		],
	]],
	['Strait of Messina', [
		[
			[15.20, 37.75],
			[15.85, 37.75],
			[15.85, 38.55],
			[15.20, 38.55],
			[15.20, 37.75],
		],
	]],
	['Strait of Gibraltar', [
		[
			[-5.65, 35.70],
			[-5.05, 35.70],
			[-5.05, 36.30],
			[-5.65, 36.30],
			[-5.65, 35.70],
		],
	]],
];

// External data and geocoding

C.LAND_DATA_URL						= 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
C.NOMINATIM_URL						= 'https://nominatim.openstreetmap.org';
C.NOMINATIM_HEADERS					= { 'Accept-Language': 'en', 'User-Agent': 'RangeFinderApp/1.0' };

C.GEOCODE_MAX_RESULTS				= 3;
C.GEOCODE_DEBOUNCE_MS				= 1200;
C.GEOCODE_MIN_QUERY_LENGTH			= 3;
C.REVERSE_GEOCODE_MAX_DISTANCE_M	= 25;
C.REVERSE_GEOCODE_ZOOM				= 18;

// Map and UI layout

C.MAP_INITIAL_CENTER				= [48, 10];
C.MAP_INITIAL_ZOOM					= 5;
C.MAP_GEOCODE_ZOOM					= 10;	 // zoom level used when flying to a geocoded result
C.MAP_FIT_PADDING_PX				= 40;	 // px padding passed to fitBounds
C.MOBILE_BREAKPOINT_PX				= 640;
C.SIDEBAR_WIDTH_PX					= 300;
C.SHEET_TRANSITION_MS				= 350;	// wait after CSS sheet animation before calling invalidateSize
C.CANVAS_PADDING					= 0.5;	// Leaflet canvas renderer padding factor

C.EP_MARKER_SIZE_PX					= 18;	 // width and height of numbered endpoint markers
C.EP_MARKER_Z_OFFSET				= 100;	// zIndexOffset keeps endpoint markers above polygons

// Expose as C on both window (browser) and global scope (worker)
self.C = C;