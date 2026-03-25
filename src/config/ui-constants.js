// ui-constants.js
// Browser/UI and map presentation settings.
// Edit these when changing layout, map defaults, or geocoder behaviour.
var C = self.C || (self.C = {});

// External data and geocoding
C.NOMINATIM_URL					= 'https://nominatim.openstreetmap.org';
C.NOMINATIM_HEADERS				= { 'Accept-Language': 'en', 'User-Agent': 'RangeFinderApp/1.0' };
C.GEOCODE_MAX_RESULTS				= 3;
C.GEOCODE_DEBOUNCE_MS				= 1200;
C.GEOCODE_MIN_QUERY_LENGTH			= 3;
C.REVERSE_GEOCODE_MAX_DISTANCE_M	= 25;
C.REVERSE_GEOCODE_ZOOM				= 18;

// Map and UI layout
C.MAP_INITIAL_CENTER				= [48, 10];
C.MAP_INITIAL_ZOOM					= 5;
C.MAP_GEOCODE_ZOOM					= 10;
C.MAP_FIT_PADDING_PX				= 40;
C.MOBILE_BREAKPOINT_PX				= 640;
C.SIDEBAR_WIDTH_PX					= 300;
C.SHEET_TRANSITION_MS				= 350;
C.CANVAS_PADDING					= 0.5;

// Input ranges
C.UI_TIME_MIN_HOURS					= 0.5;
C.UI_TIME_MAX_HOURS					= 24;
C.UI_TIME_STEP_HOURS				= 0.5;
C.UI_DIST_MIN_KM					= 10;
C.UI_DIST_MAX_KM					= 5000;
C.UI_DIST_STEP_KM					= 10;
