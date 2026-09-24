// travel-constants.js
// Travel-cost and road-quality tuning.
// Edit these when changing reach, crossings, or road tile fallback.
var C = self.C || (self.C = {});

// Ferry and bridge crossings consume more budget to model slower effective speed.
C.CROSSING_DISTANCE_FACTOR			= 1;

// Dijkstra cost model
C.USE_SPEEDCLASS_COST				= true;
C.REQUIRE_ROADBANDS					= true;

// Tortuosity: tau_mode - network constraint per mode.
// Values from Giacomin and Levinson 2015, Millward et al 2013.
C.MODE_TORTUOSITY = {
	drive							: 1.20,
	moto							: 1.05,
};

C.TERRAIN_TAU_DEFAULT				= 1;

// Base speeds calibrated against real drives
C.MODE_SPEED_KMH = {
	drive							: 115,
	moto							: 100,
};

C.MODE_NOTE = {
	drive	: '115 km/h base - tau_mode 1.20 (Giacomin and Levinson 2015)',
	moto	: '100 km/h base - tau_mode 1.05, filters traffic and mountain passes better',
};

// Road tile fallback and speed calibration
C.ROAD_TILE_FALLBACK_RADIUS_STEPS	= 8;
C.ROAD_SPEED_CLASS_MIN				= 0.02;
C.ROAD_SPEED_CLASS_MAX				= 1.0;
C.CROSSING_SPEED_CLASS				= 0.85;
C.USE_VECTOR_ROADS					= true;
C.VECTOR_ROAD_TILEJSON_URL			= 'https://tiles.openfreemap.org/planet';
C.VECTOR_ROAD_PBF_MODULE_URL		= 'https://esm.sh/pbf@3.2.1';
C.VECTOR_ROAD_MVT_MODULE_URL		= 'https://esm.sh/@mapbox/vector-tile@1.3.1';
C.VECTOR_ROAD_FETCH_CONCURRENCY		= 8;
C.VECTOR_ROAD_FETCH_TIMEOUT_MS		= 8000;
C.VECTOR_ROAD_TOTAL_TIMEOUT_MS		= 12000;
C.TERRAIN_SPEED_CLASS_BANDS = {
	0: { min: 0.62, max: 1.00 },
	1: { min: 0.42, max: 0.68 },
	2: { min: 0.20, max: 0.42 },
	3: { min: 0.06, max: 0.20 },
};
