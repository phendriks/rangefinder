// north-america-tiles.js
// Synthetic network tiles for North America.

const NORTH_AMERICA_BOUNDS = {
	minLat: 7,
	maxLat: 84,
	minLng: -180,
	maxLng: -12
};

const NORTH_AMERICA_HUBS = [
	{ lat: 49.2827, lng: -123.1207, weight: 0.72, radiusKm: 240 },
	{ lat: 47.6062, lng: -122.3321, weight: 0.78, radiusKm: 260 },
	{ lat: 45.5152, lng: -122.6784, weight: 0.62, radiusKm: 220 },
	{ lat: 37.7749, lng: -122.4194, weight: 0.82, radiusKm: 280 },
	{ lat: 34.0522, lng: -118.2437, weight: 0.92, radiusKm: 340 },
	{ lat: 32.7157, lng: -117.1611, weight: 0.62, radiusKm: 220 },
	{ lat: 41.8781, lng: -87.6298, weight: 0.92, radiusKm: 340 },
	{ lat: 43.6532, lng: -79.3832, weight: 0.84, radiusKm: 320 },
	{ lat: 45.5019, lng: -73.5674, weight: 0.78, radiusKm: 300 },
	{ lat: 40.7128, lng: -74.0060, weight: 1.00, radiusKm: 360 },
	{ lat: 42.3601, lng: -71.0589, weight: 0.72, radiusKm: 260 },
	{ lat: 38.9072, lng: -77.0369, weight: 0.74, radiusKm: 280 },
	{ lat: 25.7617, lng: -80.1918, weight: 0.76, radiusKm: 260 },
	{ lat: 29.7604, lng: -95.3698, weight: 0.72, radiusKm: 280 },
	{ lat: 32.7767, lng: -96.7970, weight: 0.78, radiusKm: 280 },
	{ lat: 30.2672, lng: -97.7431, weight: 0.62, radiusKm: 220 },
	{ lat: 19.4326, lng: -99.1332, weight: 0.94, radiusKm: 360 },
	{ lat: 20.6597, lng: -103.3496, weight: 0.68, radiusKm: 260 },
	{ lat: 25.6866, lng: -100.3161, weight: 0.70, radiusKm: 260 },
	{ lat: 14.6349, lng: -90.5069, weight: 0.54, radiusKm: 180 },
	{ lat: 9.9281, lng: -84.0907, weight: 0.48, radiusKm: 160 },
	{ lat: 8.9824, lng: -79.5199, weight: 0.46, radiusKm: 160 },
	{ lat: 23.1136, lng: -82.3666, weight: 0.52, radiusKm: 180 },
	{ lat: 18.4861, lng: -69.9312, weight: 0.44, radiusKm: 150 },
	{ lat: 18.4655, lng: -66.1057, weight: 0.44, radiusKm: 150 },
	{ lat: 51.0447, lng: -114.0719, weight: 0.58, radiusKm: 220 },
	{ lat: 53.5461, lng: -113.4938, weight: 0.54, radiusKm: 220 },
	{ lat: 61.2181, lng: -149.9003, weight: 0.40, radiusKm: 200 }
];

const NORTH_AMERICA_CORRIDORS = [
	{ path: [[-123.1207, 49.2827], [-122.3321, 47.6062], [-122.6784, 45.5152]], weight: 0.74, radiusKm: 180 },
	{ path: [[-122.4194, 37.7749], [-121.4944, 38.5816], [-118.2437, 34.0522], [-117.1611, 32.7157]], weight: 0.86, radiusKm: 220 },
	{ path: [[-87.6298, 41.8781], [-83.0458, 42.3314], [-79.3832, 43.6532], [-73.5674, 45.5019]], weight: 0.92, radiusKm: 230 },
	{ path: [[-77.0369, 38.9072], [-75.1652, 39.9526], [-74.0060, 40.7128], [-71.0589, 42.3601]], weight: 0.96, radiusKm: 220 },
	{ path: [[-96.7970, 32.7767], [-97.7431, 30.2672], [-98.4936, 29.4241], [-95.3698, 29.7604]], weight: 0.82, radiusKm: 220 },
	{ path: [[-80.1918, 25.7617], [-81.3792, 28.5383], [-82.4572, 27.9506]], weight: 0.70, radiusKm: 180 },
	{ path: [[-99.1332, 19.4326], [-103.3496, 20.6597], [-100.3161, 25.6866], [-97.4975, 25.9017]], weight: 0.82, radiusKm: 240 },
	{ path: [[-106.4850, 31.7619], [-106.4245, 31.6904], [-99.1332, 19.4326]], weight: 0.58, radiusKm: 220 },
	{ path: [[-90.5069, 14.6349], [-89.2182, 13.6929], [-86.2514, 12.1364], [-84.0907, 9.9281], [-79.5199, 8.9824]], weight: 0.48, radiusKm: 170 },
	{ path: [[-114.0719, 51.0447], [-113.4938, 53.5461]], weight: 0.44, radiusKm: 170 }
];

const NORTH_AMERICA_BASE_DENSITY = 0.16;
const NORTH_AMERICA_BACKBONE_SCALE = 1.10;
const NORTH_AMERICA_NOISE_SEED = 11;
const NORTH_AMERICA_NORTH_PENALTY_LAT = 57;
const NORTH_AMERICA_HIGH_ARCTIC_PENALTY_LAT = 69;
const NORTH_AMERICA_GREENLAND_PENALTY_LNG = -75;
const NORTH_AMERICA_ALASKA_PENALTY_LNG = -133;
const NORTH_AMERICA_ALASKA_PENALTY_LAT = 55;
const NORTH_AMERICA_CONTIGUOUS_MIN_LAT = 24;
const NORTH_AMERICA_CONTIGUOUS_MAX_LAT = 50;
const NORTH_AMERICA_CONTIGUOUS_MIN_LNG = -125;
const NORTH_AMERICA_CONTIGUOUS_MAX_LNG = -66;
const NORTH_AMERICA_MEXICO_MIN_LAT = 15;
const NORTH_AMERICA_MEXICO_MAX_LAT = 27;
const NORTH_AMERICA_MEXICO_MIN_LNG = -106;
const NORTH_AMERICA_MEXICO_MAX_LNG = -86;
const NORTH_AMERICA_ONTARIO_MIN_LAT = 42;
const NORTH_AMERICA_ONTARIO_MAX_LAT = 51;
const NORTH_AMERICA_ONTARIO_MIN_LNG = -88;
const NORTH_AMERICA_ONTARIO_MAX_LNG = -66;

const NORTH_AMERICA_TERRAIN_RELIEF_HUBS = [
	{ lat: 41.8781, lng: -87.6298, weight: 0.70, radiusKm: 280 },
	{ lat: 40.7128, lng: -74.0060, weight: 0.78, radiusKm: 320 },
	{ lat: 43.6532, lng: -79.3832, weight: 0.68, radiusKm: 260 },
	{ lat: 29.7604, lng: -95.3698, weight: 0.50, radiusKm: 220 },
	{ lat: 19.4326, lng: -99.1332, weight: 0.56, radiusKm: 260 }
];

const NORTH_AMERICA_TERRAIN_RELIEF_PATHS = [
	{ path: [[-123.1207, 49.2827], [-97.1384, 49.8951], [-79.3832, 43.6532], [-74.0060, 40.7128]], weight: 0.72, radiusKm: 220 },
	{ path: [[-95.3698, 29.7604], [-90.0715, 29.9511], [-87.6298, 41.8781]], weight: 0.42, radiusKm: 200 },
	{ path: [[-99.1332, 19.4326], [-100.3161, 25.6866], [-97.4975, 25.9017]], weight: 0.44, radiusKm: 200 }
];

const NORTH_AMERICA_TERRAIN_MOUNTAIN_PATHS = [
	{ path: [[-149.9003, 61.2181], [-135.0, 59.0], [-123.1207, 49.2827], [-114.0719, 51.0447], [-111.8910, 40.7608], [-106.6504, 35.0844], [-105.9381, 35.6870]], weight: 1.00, radiusKm: 200 },
	{ path: [[-110.0, 30.0], [-106.0, 26.0], [-103.0, 23.0], [-99.0, 19.0]], weight: 0.56, radiusKm: 160 },
	{ path: [[-82.5, 35.0], [-80.0, 38.0], [-77.0, 40.5]], weight: 0.34, radiusKm: 130 }
];

const NORTH_AMERICA_TERRAIN_ROUGH_PATHS = [
	{ path: [[-114.0, 53.0], [-104.0, 50.0], [-97.0, 49.0]], weight: 0.20, radiusKm: 170 },
	{ path: [[-111.0, 32.0], [-108.0, 30.0], [-104.0, 28.0]], weight: 0.22, radiusKm: 160 }
];

const NORTH_AMERICA_TERRAIN_ROUGH_ZONES = [
	{ minLat: 23, maxLat: 32, minLng: -112, maxLng: -102, weight: 0.18 },
	{ minLat: 36, maxLat: 44, minLng: -119, maxLng: -114, weight: 0.14 },
	{ minLat: 36, maxLat: 46, minLng: -112, maxLng: -103, weight: 0.30 },
	{ minLat: 50, maxLat: 58, minLng: -126, maxLng: -112, weight: 0.22 },
	{ minLat: 58, maxLat: 66, minLng: -115, maxLng: -90, weight: 0.18 }
];

const NORTH_AMERICA_TERRAIN_HARSH_ZONES = [
	{ minLat: 60, maxLat: 75, minLng: -170, maxLng: -120, weight: 0.44 },
	{ minLat: 42, maxLat: 54, minLng: -118, maxLng: -108, weight: 0.22 },
	{ minLat: 65, maxLat: 82, minLng: -120, maxLng: -50, weight: 0.52 },
	{ minLat: 33, maxLat: 37, minLng: -118, maxLng: -113, weight: 0.20 }
];

const NORTH_AMERICA_TERRAIN_EXTREME_ZONES = [
	{ minLat: 70, maxLat: 84, minLng: -73, maxLng: -12, weight: 0.88 },
	{ minLat: 75, maxLat: 84, minLng: -120, maxLng: -60, weight: 0.72 }
];

function getNorthAmericaBonusScore(lat, lng)
{
	var bonusScore = 0;

	if (lat >= NORTH_AMERICA_CONTIGUOUS_MIN_LAT && lat <= NORTH_AMERICA_CONTIGUOUS_MAX_LAT
		&& lng >= NORTH_AMERICA_CONTIGUOUS_MIN_LNG && lng <= NORTH_AMERICA_CONTIGUOUS_MAX_LNG) {
		bonusScore += 0.10;
	}

	if (lat >= NORTH_AMERICA_MEXICO_MIN_LAT && lat <= NORTH_AMERICA_MEXICO_MAX_LAT
		&& lng >= NORTH_AMERICA_MEXICO_MIN_LNG && lng <= NORTH_AMERICA_MEXICO_MAX_LNG) {
		bonusScore += 0.10;
	}

	if (lat >= NORTH_AMERICA_ONTARIO_MIN_LAT && lat <= NORTH_AMERICA_ONTARIO_MAX_LAT
		&& lng >= NORTH_AMERICA_ONTARIO_MIN_LNG && lng <= NORTH_AMERICA_ONTARIO_MAX_LNG) {
		bonusScore += 0.08;
	}

	return clampNetworkUnit(bonusScore);
}

function getNorthAmericaPenaltyScore(lat, lng)
{
	var penaltyScore = 0;

	if (lat > NORTH_AMERICA_NORTH_PENALTY_LAT) {
		penaltyScore += ((lat - NORTH_AMERICA_NORTH_PENALTY_LAT) / 20) * 0.55;
	}

	if (lat > NORTH_AMERICA_HIGH_ARCTIC_PENALTY_LAT) {
		penaltyScore += ((lat - NORTH_AMERICA_HIGH_ARCTIC_PENALTY_LAT) / 10) * 0.35;
	}

	if (lng < NORTH_AMERICA_ALASKA_PENALTY_LNG && lat > NORTH_AMERICA_ALASKA_PENALTY_LAT) {
		penaltyScore += 0.20;
	}

	if (lng > NORTH_AMERICA_GREENLAND_PENALTY_LNG && lat > NORTH_AMERICA_NORTH_PENALTY_LAT) {
		penaltyScore += 0.36;
	}

	return clampNetworkUnit(penaltyScore);
}

function getNorthAmericaTerrainPenaltyScore(lat, lng)
{
	var penaltyScore = 0;

	if (lat > 57) {
		penaltyScore += ((lat - 57) / 20) * 0.35;
	}
	if (lng > -74 && lat > 68) {
		penaltyScore += 0.42;
	}
	if (lng < -140 && lat > 60) {
		penaltyScore += 0.20;
	}
	if (lat >= 37 && lat <= 46 && lng >= -112 && lng <= -103) {
		penaltyScore += 0.16;
	}

	return clampNetworkUnit(penaltyScore);
}

function getNorthAmericaTerrainReliefScore(lat, lng)
{
	var reliefScore = 0;

	if (lat >= 28 && lat <= 49 && lng >= -101 && lng <= -82) {
		reliefScore += 0.16;
	}
	if (lat >= 35 && lat <= 46 && lng >= -80 && lng <= -68) {
		reliefScore += 0.18;
	}
	if (lat >= 14 && lat <= 22 && lng >= -103 && lng <= -87) {
		reliefScore += 0.14;
	}

	return clampNetworkUnit(reliefScore);
}

registerSyntheticNetworkRegion({
	bounds: NORTH_AMERICA_BOUNDS,
	hubs: NORTH_AMERICA_HUBS,
	corridors: NORTH_AMERICA_CORRIDORS,
	baseDensity: NORTH_AMERICA_BASE_DENSITY,
	backboneScale: NORTH_AMERICA_BACKBONE_SCALE,
	noiseSeed: NORTH_AMERICA_NOISE_SEED,
	getBonusScore: getNorthAmericaBonusScore,
	getPenaltyScore: getNorthAmericaPenaltyScore,
	terrainBaseScore: 0.12,
	terrainNoiseSeed: 111,
	terrainReliefHubs: NORTH_AMERICA_TERRAIN_RELIEF_HUBS,
	terrainReliefPaths: NORTH_AMERICA_TERRAIN_RELIEF_PATHS,
	terrainMountainPaths: NORTH_AMERICA_TERRAIN_MOUNTAIN_PATHS,
	terrainRoughPaths: NORTH_AMERICA_TERRAIN_ROUGH_PATHS,
	terrainRoughZones: NORTH_AMERICA_TERRAIN_ROUGH_ZONES,
	terrainHarshZones: NORTH_AMERICA_TERRAIN_HARSH_ZONES,
	terrainExtremeZones: NORTH_AMERICA_TERRAIN_EXTREME_ZONES,
	getTerrainPenaltyScore: getNorthAmericaTerrainPenaltyScore,
	getTerrainReliefScore: getNorthAmericaTerrainReliefScore,
	fastSpan: 36,
	mainSpan: 40,
	midSpan: 44,
	localSpan: 56
});
