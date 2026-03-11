// constants.js
const C = {}; 

// Cell identification
C.CELL_WATER					= 0;
C.CELL_LAND						= 1;
C.CELL_CROSSING					= 2;

// Point attributes
C.ROAD_TYPE_MOTORWAY			= 0;
C.ROAD_TYPE_LOCAL				= 1;

C.SPEED_CLASS_MAX				= 0;
C.SPEED_CLASS_AVERAGE			= 1;
C.SPEED_CLASS_LOW				= 2;

// Roads classification
C.ROAD_PROXIMITY_RADIUS_KM		= 8;

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
C.DELAUNAY_JITTER_SALT_STEP		= 1013;

// Ferry/bridge crossings consume more budget to model slower effective speed.
C.CROSSING_DISTANCE_FACTOR		= 1.5;

// Polygon buffering
// Small absolute buffer in kilometres to reduce false coastal misses.
C.POLYGON_BUFFER_KM				= 10;

// Land grid

C.GRID_MARGIN_FACTOR			= 0.2;	// padding around outer radius bounding box as a fraction
C.GRID_SIZE_DIVISOR				= 10;	// N = clamp(outerKm / divisor, min, max)
C.GRID_SIZE_MIN					= 40;
C.GRID_SIZE_MAX					= 90;
C.GRID_SIZE_BONUS				= 2;

C.SITES_DENSITY_FACTOR			= 3;

C.GRID_DOT_RADIUS					= 2;
C.GRID_DOT_RADIUS_CROSSING_BONUS	= 1;
C.POINT_INSPECT_RADIUS_PX			= 18;

C.SITE_COLOUR_LAND				= '#28a050';
C.SITE_COLOUR_CROSSING			= '#e08020';
C.SITE_COLOUR_WATER				= '#2b6cc4';

C.SITE_FILL_OPACITY_LAND		= 0.55;
C.SITE_FILL_OPACITY_CROSSING	= 0.55;
C.SITE_FILL_OPACITY_WATER		= 0.25;

// Sampling
C.LLOYD_ITERATIONS				= 2;
C.LLOYD_ALPHA					= 0.2;
C.LLOYD_JITTER_FACTOR			= .75;
C.LLOYD_HASH_CELL_FACTOR		= 1.6;
C.RASTER_HASH_CELL_FACTOR		= 2.0;

// Mesh contour
C.CONTOUR_KEY_SCALE				= 1000;
C.CONTOUR_MAX_STEPS				= 200000;
C.CONTOUR_MIN_RING_POINTS		= 4;
C.CONTOUR_SIMPLIFY_MIN_KM		= 1.2;
C.CONTOUR_SMOOTH_ITERATIONS		= 1;
C.CONTOUR_AREA_RATIO_MIN		= 0.85;
C.CONTOUR_AREA_RATIO_MAX		= 1.15;


// Tortuosity: tau_mode - network constraint per mode.
// Values from Giacomin & Levinson 2015, Millward et al 2013.
C.MODE_TORTUOSITY = {
	drive						: 1.20,
	moto						: 1.15,
};

C.TERRAIN_TAU_DEFAULT = 1;

// Base speeds calibrated against 'real' drives
C.MODE_SPEED_KMH = {
	drive						: 105,
	moto						: 100,
};

C.MODE_NOTE = {
	drive	: '105 km/h base, tau_mode 1.20 (Giacomin & Levinson 2015)',
	moto	: '100 km/h base, tau_mode 1.15, filters traffic and handles mountain passes better',
};

	// Country polygons are loaded from countries-natural-earth.js
C.COUNTRY_POLYGONS					= [];

C.COUNTRY_POLYGONS_SOURCE			= 'naturalearth';

// Crossing polygons are loaded from crossing-polygons.js
C.CROSSING_POLYGONS					= [];

// External data and geocoding
C.LAND_DATA_URL						= '';
C.NOMINATIM_URL						= 'https://nominatim.openstreetmap.org';
C.NOMINATIM_HEADERS					= { 'Accept-Language': 'en', 'User-Agent': 'RangeFinderApp/1.0' };

C.GEOCODE_MAX_RESULTS				= 3;
C.GEOCODE_DEBOUNCE_MS				= 1200;
C.GEOCODE_MIN_QUERY_LENGTH			= 3;

// Debug
C.DEBUG_COUNTRY_REGRESSION			= false;
C.REVERSE_GEOCODE_MAX_DISTANCE_M	= 25;
C.REVERSE_GEOCODE_ZOOM				= 18;

// Europe bounds
C.EUROPE_BBOX_MIN_LNG				= -25;
C.EUROPE_BBOX_MIN_LAT				= 34;
C.EUROPE_BBOX_MAX_LNG				= 45;
C.EUROPE_BBOX_MAX_LAT				= 72;

// Roads tiles
C.ROADS_TILE_SIZE_DEG				= 1;

// Road speed weights (relative travel capability per km)
C.ROAD_SPEED_WEIGHT_FAST			= 1;	// motorway and trunks
C.ROAD_SPEED_WEIGHT_MAIN			= 0.7;	// primary and secondary
C.ROAD_SPEED_WEIGHT_MID				= 0.4;	// tertiary
C.ROAD_SPEED_WEIGHT_LOCAL			= 0.2;	// residential

// Road density saturation midpoint (capability units)
C.ROAD_CAP_HALF						= 300;

// Map and UI layout
C.MAP_INITIAL_CENTER				= [48, 10];
C.MAP_INITIAL_ZOOM					= 5;
C.MAP_GEOCODE_ZOOM					= 10;	// zoom level used when flying to a geocoded result
C.MAP_FIT_PADDING_PX				= 40;	// px padding passed to fitBounds
C.MOBILE_BREAKPOINT_PX				= 640;
C.SIDEBAR_WIDTH_PX					= 300;
C.SHEET_TRANSITION_MS				= 350;	// wait after CSS sheet animation before calling invalidateSize
C.CANVAS_PADDING					= 0.5;	// Leaflet canvas renderer padding factor

C.EP_MARKER_SIZE_PX					= 18;	// width and height of numbered endpoint markers
C.EP_MARKER_Z_OFFSET				= 100;	// zIndexOffset keeps endpoint markers above polygons

// Expose as C on both window (browser) and global scope (worker)
self.C = C;
