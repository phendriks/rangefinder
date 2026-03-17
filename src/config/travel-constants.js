// travel-constants.js
// Travel-cost and road-quality tuning.
// Edit these when changing reach, speedClass behaviour, crossings, or road tile fallback.
var C = self.C || (self.C = {});

// Speed class scoring
C.SPEED_CLASS_WEIGHTS				= [1, 0.8, 0.3, 0.15];
C.SPEED_CLASS_DETERMINANTS			= [150, 125, 100, 75];

// Ferry/bridge crossings consume more budget to model slower effective speed.
C.CROSSING_DISTANCE_FACTOR			= 1;

// Dijkstra cost model
C.USE_SPEEDCLASS_COST				= true;
C.REQUIRE_ROADBANDS					= true;

// Tortuosity: tau_mode - network constraint per mode.
// Values from Giacomin & Levinson 2015, Millward et al 2013.
C.MODE_TORTUOSITY = {
	drive							: 1.20,
	moto							: 1.15,
};

C.TERRAIN_TAU_DEFAULT				= 1;

// Base speeds calibrated against 'real' drives
C.MODE_SPEED_KMH = {
	drive							: 120,
	moto							: 110,
};

C.MODE_NOTE = {
	drive	: '120 km/h base, tau_mode 1.20 (Giacomin & Levinson 2015)',
	moto	: '110 km/h base, tau_mode 1.15, filters traffic and handles mountain passes better',
};

// Roads tiles
C.TILE_KEY_EPSILON					= 1e-9;

// Road speed weights (relative travel capability per km)
C.ROAD_SPEED_WEIGHT_FAST			= 1.0;   // motorway and trunks
C.ROAD_SPEED_WEIGHT_MAIN			= 0.6; // primary and secondary
C.ROAD_SPEED_WEIGHT_MID				= 0.3; // tertiary
C.ROAD_SPEED_WEIGHT_LOCAL			= 0.1; // residential

// Road density saturation midpoint (capability units)
C.ROAD_CAP_HALF						= 300;

// Road tile fallback and speed calibration
C.ROAD_TILE_FALLBACK_RADIUS_STEPS	= 8; // search missing tiles up to 4 degrees away
C.ROAD_SPEED_CLASS_MIN				= 0.5;
C.ROAD_SPEED_CLASS_MAX				= 1;
C.CROSSING_SPEED_CLASS				= 0.85;

// Calibrated score shaping
C.ROAD_CALIBRATED_DENSITY_WEIGHT	= 0.35; // higher = rounder/more generous
C.ROAD_CALIBRATED_FAST_SHARE_WEIGHT	= 0.25; // higher = motorway-heavy areas score better

// Shape variation folded into the single speedClass function.
// Higher = more texture from road hierarchy; lower = rounder/steadier reach.
C.ROAD_VARIATION_STRENGTH			= 0.75;

// Rare fallback when a land cell still has no nearby tile coverage
C.ROAD_TILE_DEFAULT_FAST_KM			= 0;
C.ROAD_TILE_DEFAULT_MAIN_KM			= 6;
C.ROAD_TILE_DEFAULT_MID_KM			= 12;
C.ROAD_TILE_DEFAULT_LOCAL_KM		= 18;