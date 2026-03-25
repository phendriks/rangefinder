// shape-constants.js
// Mesh, grid, and contour generation settings.
// Edit these when changing how the reachable area is sampled, smoothed, or simplified.
var C = self.C || (self.C = {});

// Isobands
C.ISOBAND_UNREACHED_COST_FACTOR		= 1000;

// Small buffer in absolute kilometres to reduce false coastal misses.
C.POLYGON_BUFFER_KM					= 10;

// Land grid
C.GRID_MARGIN_FACTOR					= 0.2;
C.GRID_SIZE_DIVISOR					= 10;
C.GRID_SIZE_MIN						= 40;
C.GRID_SIZE_MAX						= 90;

// Sampling
C.LLOYD_ITERATIONS					= 1;
C.LLOYD_ALPHA						= 0.2;
C.LLOYD_JITTER_FACTOR				= 0.75;
C.LLOYD_HASH_CELL_FACTOR			= 1.6;
C.RASTER_HASH_CELL_FACTOR			= 2.0;

// Delaunay neighbor controls
C.DELAUNAY_MAX_EDGE_FACTOR			= 3;
C.DELAUNAY_JITTER_FACTOR				= 0.15;

// Mesh contour
C.CONTOUR_KEY_SCALE					= 1000;
C.CONTOUR_MAX_STEPS					= 200000;
C.CONTOUR_MIN_RING_POINTS			= 4;
C.CONTOUR_SIMPLIFY_MIN_KM			= 1.2;
C.CONTOUR_SMOOTH_ITERATIONS		= 1;
C.CONTOUR_AREA_RATIO					= 0.15;
