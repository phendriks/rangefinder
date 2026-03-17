// ui-constants.js
// Browser/UI and map presentation settings.
// Edit these when changing layout, map defaults, colours, markers, or geocoder behaviour.
var C = self.C || (self.C = {});

C.GRID_DOT_RADIUS					= 2;
C.GRID_DOT_RADIUS_CROSSING_BONUS	= 1;
C.POINT_INSPECT_RADIUS_PX			= 18;

C.SITE_COLOUR_LAND					= '#28a050';
C.SITE_COLOUR_CROSSING				= '#e08020';
C.SITE_COLOUR_WATER					= '#2b6cc4';

C.SITE_FILL_OPACITY_LAND			= 0.35;
C.SITE_FILL_OPACITY_CROSSING		= 0.35;
C.SITE_FILL_OPACITY_WATER			= 0.15;

// External data and geocoding
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
C.MAP_GEOCODE_ZOOM					= 10; // zoom level used when flying to a geocoded result
C.MAP_FIT_PADDING_PX				= 40; // px padding passed to fitBounds
C.MOBILE_BREAKPOINT_PX				= 640;
C.SIDEBAR_WIDTH_PX					= 300;
C.SHEET_TRANSITION_MS				= 350; // wait after CSS sheet animation before calling invalidateSize
C.CANVAS_PADDING					= 0.5; // Leaflet canvas renderer padding factor

C.EP_MARKER_SIZE_PX					= 18; // width and height of numbered endpoint markers
C.EP_MARKER_Z_OFFSET				= 100; // zIndexOffset keeps endpoint markers above polygons
C.EP_MARKER_ANCHOR_PX				= 9; // anchor for endpoint marker icons

C.UI_TIME_MIN_HOURS					= 0.5;
C.UI_TIME_MAX_HOURS					= 24;
C.UI_TIME_STEP_HOURS				= 0.5;
C.UI_DIST_MIN_KM					= 10;
C.UI_DIST_MAX_KM					= 5000;
C.UI_DIST_STEP_KM					= 10;

C.UI_POINT_INSPECT_OFFSET_PX		= 14;