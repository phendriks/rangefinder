// base-constants.js
// Shared primitives used across the app.
// Edit these when changing core enums, Earth geometry, or shared loaded datasets.
var C = self.C || (self.C = {});

// Cell identification
C.CELL_WATER						= 0;
C.CELL_LAND							= 1;
C.CELL_CROSSING					= 2;

// Terrain severity bands
C.TERRAIN_NORMAL					= 0;
C.TERRAIN_ROUGH						= 1;
C.TERRAIN_HARSH						= 2;
C.TERRAIN_EXTREME					= 3;

// Geodesy
C.EARTH_RADIUS_KM					= 6371;
C.KM_PER_DEG_LAT					= 111;

// Country polygons are loaded from countriesNaturalEarth.js
C.COUNTRY_POLYGONS					= [];

// Crossing polygons are loaded from crossing-polygons.js
C.CROSSING_POLYGONS					= [];
