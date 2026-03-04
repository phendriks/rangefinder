'use strict';

// country-props.js - properties for countries listed in C.COUNTRY_DB.
// Loaded via script tag in the browser.

// Defaults chosen to keep data small. Any country not listed in OVERRIDES uses DEFAULTS.
C.COUNTRY_PROPS_DEFAULTS = {
	highway						: 120,
	terrain						: 'rolling',
};

C.COUNTRY_PROPS_OVERRIDES = {
	'Albania'					: { highway: 110, terrain: 'hilly' },
	'Austria'					: { highway: 130, terrain: 'hilly' },
	'Belarus'					: { terrain: 'flat' },
	'Belgium'					: { terrain: 'flat' },
	'Bosnia'					: { highway: 130, terrain: 'hilly' },
	'Bulgaria'					: { highway: 140 },
	'Croatia'					: { highway: 130 },
	'Cyprus'					: { highway: 100 },
	'Czech Rep.'				: { highway: 130 },
	'Denmark'					: { highway: 130, terrain: 'flat' },
	'Estonia'					: { highway: 110, terrain: 'flat' },
	'Finland'					: { terrain: 'flat' },
	'France'					: { highway: 130 },
	'Germany'					: { highway: 130 },
	'Greece'					: { highway: 130, terrain: 'hilly' },
	'Hungary'					: { highway: 130, terrain: 'flat' },
	'Iceland'					: { highway: 90, terrain: 'mountain' },
	'Italy'						: { highway: 130 },
	'Kosovo'					: { highway: 110, terrain: 'hilly' },
	'Latvia'					: { highway: 110, terrain: 'flat' },
	'Lithuania'				: { highway: 130, terrain: 'flat' },
	'Luxembourg'				: { highway: 130 },
	'Malta'					: { highway: 80, terrain: 'flat' },
	'Moldova'					: { highway: 110 },
	'Montenegro'				: { highway: 130, terrain: 'mountain' },
	'Netherlands'				: { highway: 100, terrain: 'flat' },
	'N. Macedonia'			: { highway: 130, terrain: 'hilly' },
	'Norway'					: { highway: 110, terrain: 'mountain' },
	'Poland'					: { highway: 140, terrain: 'flat' },
	'Romania'					: { highway: 130 },
	'Serbia'					: { highway: 130 },
	'Slovakia'					: { highway: 130, terrain: 'hilly' },
	'Slovenia'					: { highway: 130, terrain: 'hilly' },
	'Switzerland'				: { terrain: 'mountain' },
	'Tunisia'					: { highway: 110, terrain: 'flat' },
	'Libya'						: { terrain: 'flat' },
	'Egypt'						: { terrain: 'flat' },
	'Israel'					: { highway: 110, terrain: 'hilly' },
	'Palestine'				: { highway: 110, terrain: 'hilly' },
	'Lebanon'					: { highway: 110, terrain: 'mountain' },
	'W. Sahara'				: { highway: 110, terrain: 'flat' },
	'Ukraine'					: { highway: 130 },
	'UK'						: { highway: 112 },
};
