'use strict';

// C is loaded via <script src="constants.js"> before this file.


// Country lookup

const BBOX_MIN_LNG			= 0;
const BBOX_MIN_LAT			= 1;
const BBOX_MAX_LNG			= 2;
const BBOX_MAX_LAT			= 3;

let countryPolyIndex			= null;
let countryBoundsIndex			= null;
let countryNameList				= null;
let countryPropsCache			= null;

function bufferCountryPolygonIfNeeded(poly) {
	const bufferKm = Number(C.POLYGON_BUFFER_KM) || 0;
	if (!(bufferKm > 0)) return poly;
	const buffered = turf.buffer(poly, bufferKm, { units: 'kilometers' });
	return buffered || poly;
}

function ensureCountriesLoaded() {
	if (countryPolyIndex) return;
	countryPolyIndex = {};
	countryBoundsIndex = {};
	countryNameList = [];
	if (!C.COUNTRY_POLYGONS || !C.COUNTRY_POLYGONS.length) return;
	for (const entry of C.COUNTRY_POLYGONS) {
		const polys = [];
		let cMinLng = Infinity, cMinLat = Infinity, cMaxLng = -Infinity, cMaxLat = -Infinity;
		for (const ring of entry.polys) {
			let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
			for (const pt of ring) {
				const lng = pt[0];
				const lat = pt[1];
				if (lng < minLng) minLng = lng;
				if (lat < minLat) minLat = lat;
				if (lng > maxLng) maxLng = lng;
				if (lat > maxLat) maxLat = lat;
			}
			const poly = bufferCountryPolygonIfNeeded(turf.polygon([ring]));
			const bufferedBbox = turf.bbox(poly);
			if (bufferedBbox[0] < cMinLng) cMinLng = bufferedBbox[0];
			if (bufferedBbox[1] < cMinLat) cMinLat = bufferedBbox[1];
			if (bufferedBbox[2] > cMaxLng) cMaxLng = bufferedBbox[2];
			if (bufferedBbox[3] > cMaxLat) cMaxLat = bufferedBbox[3];
			polys.push({
				poly,
				bbox:					[bufferedBbox[0], bufferedBbox[1], bufferedBbox[2], bufferedBbox[3]],
			});
		}
		countryPolyIndex[entry.name] = polys;
		countryNameList.push(entry.name);
		if (cMinLng !== Infinity) {
			countryBoundsIndex[entry.name] = [cMinLng, cMinLat, cMaxLng, cMaxLat];
		}
	}
}

function getCountryProps(name) {
	if (!countryPropsCache) countryPropsCache = {};
	let props = countryPropsCache[name];
	if (props) return props;
	const d = C.COUNTRY_PROPS_DEFAULTS || {};
	const o = (C.COUNTRY_PROPS_OVERRIDES && C.COUNTRY_PROPS_OVERRIDES[name]) || null;
	props = {
		highway						: d.highway,
		terrain						: d.terrain,
	};
	if (o) {
		if (o.highway !== undefined) props.highway = o.highway;
		if (o.terrain !== undefined) props.terrain = o.terrain;
	}
	countryPropsCache[name] = props;
	return props;
}

function getCountryBboxArea(name) {
	if (!countryBoundsIndex) return Infinity;
	const bb = countryBoundsIndex[name];
	if (!bb) return Infinity;
	return (bb[BBOX_MAX_LNG] - bb[BBOX_MIN_LNG]) * (bb[BBOX_MAX_LAT] - bb[BBOX_MIN_LAT]);
}


function countryAt(lat, lng) {
	ensureCountriesLoaded();
	const hits = [];
	const names = countryNameList || [];
	for (const name of names) {
		const bb = countryBoundsIndex ? countryBoundsIndex[name] : null;
		if (bb) {
			if (lng < bb[BBOX_MIN_LNG] || lng > bb[BBOX_MAX_LNG] || lat < bb[BBOX_MIN_LAT] || lat > bb[BBOX_MAX_LAT]) continue;
		}
		hits.push(name);
	}
	if (!hits.length) return null;
	const p = turf.point([lng, lat]);
	hits.sort((a, b) => getCountryBboxArea(a) - getCountryBboxArea(b));
	for (const hit of hits) {
		const name = hit;
		const polys = countryPolyIndex ? countryPolyIndex[name] : null;
		const props = getCountryProps(name);
		if (polys && polys.length) {
			for (const item of polys) {
				const bb = item.bbox;
				if (lng < bb[BBOX_MIN_LNG] || lng > bb[BBOX_MAX_LNG] || lat < bb[BBOX_MIN_LAT] || lat > bb[BBOX_MAX_LAT]) continue;
				if (turf.booleanPointInPolygon(p, item.poly)) {
					return { name: name, highway: props.highway, terrain: props.terrain };
				}
			}
			continue;
		}
		return { name: name, highway: props.highway, terrain: props.terrain };
	}
	const fallbackName = hits[0];
	const fallbackProps = getCountryProps(fallbackName);
	return { name: fallbackName, highway: fallbackProps.highway, terrain: fallbackProps.terrain };
}

function runCountryRegression() {
	if (!C.DEBUG_COUNTRY_REGRESSION) return;
	const pts = [
		[48.8566, 2.3522],
		[52.5200, 13.4050],
		[41.9028, 12.4964],
		[40.4168, -3.7038],
		[48.2082, 16.3738],
		[50.8503, 4.3517],
		[47.2692, 11.4041],
		[42.8782, -8.5448],
		[51.5074, -0.1278],
		[53.3498, -6.2603],
		[37.5079, 15.0830],
		[55.6761, 12.5683],
		[36.1408, -5.3536],
		[38.1157, 13.3615],
		[46.2044, 6.1432],
		[45.4642, 9.1900],
		[0.0, 0.0],
	];
	const out = [];
	for (const pt of pts) {
		const c = countryAt(pt[0], pt[1]);
		out.push(c ? (c.name + ':' + c.highway + ':' + c.terrain) : 'null');
	}
	console.log('countryRegression', out.join('|'));
}

runCountryRegression();
