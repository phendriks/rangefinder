'use strict';

// crossing-props.js - properties for named crossings.
// Loaded via script tag in the browser.

C.CROSSING_TYPE_BRIDGE				= 1;
C.CROSSING_TYPE_TUNNEL				= 2;
C.CROSSING_TYPE_FERRY				= 3;
C.CROSSING_TYPE_TRAIN				= 4;

C.CROSSING_MODE_CAR					= 1;
C.CROSSING_MODE_TRAIN				= 2;
C.CROSSING_MODE_FOOT				= 4;

C.CROSSING_PROPS_DEFAULTS = {
	type							: C.CROSSING_TYPE_FERRY,
	modes							: C.CROSSING_MODE_CAR,
};

C.CROSSING_PROPS_OVERRIDES = {
	'English Channel'				: { type: C.CROSSING_TYPE_TRAIN, modes: C.CROSSING_MODE_CAR | C.CROSSING_MODE_TRAIN },
	'Oresund'						: { type: C.CROSSING_TYPE_BRIDGE, modes: C.CROSSING_MODE_CAR | C.CROSSING_MODE_TRAIN },
	'Great Belt'					: { type: C.CROSSING_TYPE_BRIDGE, modes: C.CROSSING_MODE_CAR | C.CROSSING_MODE_TRAIN },
	'Fehmarn Belt'					: { type: C.CROSSING_TYPE_FERRY, modes: C.CROSSING_MODE_CAR },
	'Irish Sea North'				: { type: C.CROSSING_TYPE_FERRY, modes: C.CROSSING_MODE_CAR },
	'Irish Sea Central'				: { type: C.CROSSING_TYPE_FERRY, modes: C.CROSSING_MODE_CAR },
	'Irish Sea South'				: { type: C.CROSSING_TYPE_FERRY, modes: C.CROSSING_MODE_CAR },
	'Strait of Messina'				: { type: C.CROSSING_TYPE_FERRY, modes: C.CROSSING_MODE_CAR },
	'Strait of Gibraltar'			: { type: C.CROSSING_TYPE_FERRY, modes: C.CROSSING_MODE_CAR },
};
