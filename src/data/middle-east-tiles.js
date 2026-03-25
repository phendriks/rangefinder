// middle-east-tiles.js
// Synthetic network tiles for the Middle East.

const MIDDLE_EAST_BOUNDS = {
	minLat: 12,
	maxLat: 43,
	minLng: 24,
	maxLng: 64
};

const MIDDLE_EAST_HUBS = [
	{ lat: 41.0082, lng: 28.9784, weight: 0.84, radiusKm: 260 },
	{ lat: 39.9334, lng: 32.8597, weight: 0.70, radiusKm: 240 },
	{ lat: 38.4237, lng: 27.1428, weight: 0.52, radiusKm: 180 },
	{ lat: 33.3152, lng: 44.3661, weight: 0.72, radiusKm: 240 },
	{ lat: 36.3538, lng: 43.1571, weight: 0.42, radiusKm: 180 },
	{ lat: 35.6892, lng: 51.3890, weight: 0.98, radiusKm: 320 },
	{ lat: 32.6546, lng: 51.6680, weight: 0.64, radiusKm: 220 },
	{ lat: 29.5918, lng: 52.5837, weight: 0.46, radiusKm: 180 },
	{ lat: 36.2605, lng: 59.6168, weight: 0.46, radiusKm: 180 },
	{ lat: 31.7683, lng: 35.2137, weight: 0.44, radiusKm: 160 },
	{ lat: 32.0853, lng: 34.7818, weight: 0.56, radiusKm: 170 },
	{ lat: 33.8938, lng: 35.5018, weight: 0.42, radiusKm: 150 },
	{ lat: 33.5138, lng: 36.2765, weight: 0.48, radiusKm: 180 },
	{ lat: 31.9539, lng: 35.9106, weight: 0.42, radiusKm: 160 },
	{ lat: 24.7136, lng: 46.6753, weight: 0.72, radiusKm: 240 },
	{ lat: 21.4858, lng: 39.1925, weight: 0.56, radiusKm: 180 },
	{ lat: 24.4539, lng: 54.3773, weight: 0.62, radiusKm: 180 },
	{ lat: 25.2048, lng: 55.2708, weight: 0.74, radiusKm: 190 },
	{ lat: 29.3759, lng: 47.9774, weight: 0.44, radiusKm: 160 },
	{ lat: 23.5880, lng: 58.3829, weight: 0.42, radiusKm: 160 }
];

const MIDDLE_EAST_CORRIDORS = [
	{ path: [[28.9784, 41.0082], [32.8597, 39.9334], [37.3825, 37.0662], [44.3661, 33.3152]], weight: 0.78, radiusKm: 210 },
	{ path: [[34.7818, 32.0853], [35.9106, 31.9539], [36.2765, 33.5138], [35.5018, 33.8938]], weight: 0.54, radiusKm: 130 },
	{ path: [[43.1571, 36.3538], [44.3661, 33.3152], [47.9774, 29.3759], [51.5310, 25.2854], [55.2708, 25.2048], [54.3773, 24.4539], [58.3829, 23.5880]], weight: 0.86, radiusKm: 180 },
	{ path: [[51.3890, 35.6892], [51.6680, 32.6546], [52.5837, 29.5918]], weight: 0.74, radiusKm: 170 },
	{ path: [[39.1925, 21.4858], [39.8579, 21.3891], [46.6753, 24.7136]], weight: 0.58, radiusKm: 170 }
];

const MIDDLE_EAST_BASE_DENSITY = 0.11;
const MIDDLE_EAST_BACKBONE_SCALE = 1.00;
const MIDDLE_EAST_NOISE_SEED = 37;
const MIDDLE_EAST_ARABIAN_MIN_LNG = 41;
const MIDDLE_EAST_ARABIAN_MAX_LNG = 54;
const MIDDLE_EAST_ARABIAN_MIN_LAT = 18;
const MIDDLE_EAST_ARABIAN_MAX_LAT = 28;
const MIDDLE_EAST_SYRIAN_MIN_LNG = 37;
const MIDDLE_EAST_SYRIAN_MAX_LNG = 44;
const MIDDLE_EAST_SYRIAN_MIN_LAT = 30;
const MIDDLE_EAST_SYRIAN_MAX_LAT = 36;
const MIDDLE_EAST_TURKEY_MIN_LAT = 36;
const MIDDLE_EAST_TURKEY_MAX_LAT = 42;
const MIDDLE_EAST_TURKEY_MIN_LNG = 26;
const MIDDLE_EAST_TURKEY_MAX_LNG = 36;
const MIDDLE_EAST_GULF_MIN_LNG = 47;
const MIDDLE_EAST_GULF_MAX_LNG = 56;
const MIDDLE_EAST_GULF_MIN_LAT = 23;
const MIDDLE_EAST_GULF_MAX_LAT = 30;

const MIDDLE_EAST_TERRAIN_RELIEF_HUBS = [
	{ lat: 41.0082, lng: 28.9784, weight: 0.44, radiusKm: 220 },
	{ lat: 35.6892, lng: 51.3890, weight: 0.54, radiusKm: 260 },
	{ lat: 32.0853, lng: 34.7818, weight: 0.42, radiusKm: 150 },
	{ lat: 24.4539, lng: 54.3773, weight: 0.50, radiusKm: 180 },
	{ lat: 24.7136, lng: 46.6753, weight: 0.62, radiusKm: 220 }
];

const MIDDLE_EAST_TERRAIN_RELIEF_PATHS = [
	{ path: [[34.7818, 32.0853], [35.9106, 31.9539], [36.2765, 33.5138], [35.5018, 33.8938]], weight: 0.42, radiusKm: 120 },
	{ path: [[43.0, 37.0], [44.3661, 33.3152], [47.9774, 29.3759]], weight: 0.40, radiusKm: 150 },
	{ path: [[39.1925, 21.4858], [46.6753, 24.7136], [50.0, 25.0], [54.3773, 24.4539], [55.2708, 25.2048]], weight: 0.44, radiusKm: 180 },
	{ path: [[51.5310, 25.2854], [54.3773, 24.4539], [55.2708, 25.2048]], weight: 0.26, radiusKm: 120 }
];

const MIDDLE_EAST_TERRAIN_MOUNTAIN_PATHS = [
	{ path: [[26.0, 39.0], [35.0, 39.0], [40.0, 38.0], [44.0, 37.0]], weight: 0.46, radiusKm: 170 },
	{ path: [[44.0, 37.0], [47.0, 35.0], [50.0, 33.0], [53.0, 29.5]], weight: 0.68, radiusKm: 180 },
	{ path: [[35.0, 37.0], [37.5, 36.5], [40.5, 38.0]], weight: 0.28, radiusKm: 140 }
];

const MIDDLE_EAST_TERRAIN_ROUGH_ZONES = [
	{ minLat: 33, maxLat: 40, minLng: 30, maxLng: 44, weight: 0.18 },
	{ minLat: 28, maxLat: 37, minLng: 46, maxLng: 58, weight: 0.18 },
	{ minLat: 17, maxLat: 22, minLng: 52, maxLng: 58, weight: 0.14 }
];

const MIDDLE_EAST_TERRAIN_HARSH_ZONES = [
	{ minLat: 18, maxLat: 29, minLng: 40, maxLng: 53, weight: 0.62 },
	{ minLat: 30, maxLat: 36, minLng: 37, maxLng: 45, weight: 0.34 }
];

const MIDDLE_EAST_TERRAIN_EXTREME_ZONES = [
	{ minLat: 18, maxLat: 25, minLng: 45, maxLng: 52, weight: 0.66 },
	{ minLat: 20, maxLat: 26, minLng: 51, maxLng: 56, weight: 0.56 }
];

function getMiddleEastBonusScore(lat, lng)
{
	var bonusScore = 0;

	if (lat >= MIDDLE_EAST_TURKEY_MIN_LAT && lat <= MIDDLE_EAST_TURKEY_MAX_LAT
		&& lng >= MIDDLE_EAST_TURKEY_MIN_LNG && lng <= MIDDLE_EAST_TURKEY_MAX_LNG) {
		bonusScore += 0.10;
	}

	if (lat >= MIDDLE_EAST_GULF_MIN_LAT && lat <= MIDDLE_EAST_GULF_MAX_LAT
		&& lng >= MIDDLE_EAST_GULF_MIN_LNG && lng <= MIDDLE_EAST_GULF_MAX_LNG) {
		bonusScore += 0.10;
	}

	return clampNetworkUnit(bonusScore);
}

function getMiddleEastPenaltyScore(lat, lng)
{
	var penaltyScore = 0;

	if (lat >= MIDDLE_EAST_ARABIAN_MIN_LAT && lat <= MIDDLE_EAST_ARABIAN_MAX_LAT
		&& lng >= MIDDLE_EAST_ARABIAN_MIN_LNG && lng <= MIDDLE_EAST_ARABIAN_MAX_LNG) {
		penaltyScore += 0.48;
	}

	if (lat >= MIDDLE_EAST_SYRIAN_MIN_LAT && lat <= MIDDLE_EAST_SYRIAN_MAX_LAT
		&& lng >= MIDDLE_EAST_SYRIAN_MIN_LNG && lng <= MIDDLE_EAST_SYRIAN_MAX_LNG) {
		penaltyScore += 0.22;
	}

	if (lng > 56 && lat > 31) {
		penaltyScore += 0.12;
	}

	return clampNetworkUnit(penaltyScore);
}

function getMiddleEastTerrainPenaltyScore(lat, lng)
{
	var penaltyScore = 0;

	if (lat >= 18 && lat <= 29 && lng >= 40 && lng <= 54) {
		penaltyScore += 0.22;
	}
	if (lat >= 30 && lat <= 36 && lng >= 37 && lng <= 45) {
		penaltyScore += 0.14;
	}

	return clampNetworkUnit(penaltyScore);
}

function getMiddleEastTerrainReliefScore(lat, lng)
{
	var reliefScore = 0;

	if (lat >= 31 && lat <= 37 && lng >= 32 && lng <= 48) {
		reliefScore += 0.18;
	}
	if (lat >= 23 && lat <= 30 && lng >= 49 && lng <= 56) {
		reliefScore += 0.12;
	}
	if (lat >= 23 && lat <= 26 && lng >= 45 && lng <= 48.5) {
		reliefScore += 0.22;
	}

	return clampNetworkUnit(reliefScore);
}

registerSyntheticNetworkRegion({
	bounds: MIDDLE_EAST_BOUNDS,
	hubs: MIDDLE_EAST_HUBS,
	corridors: MIDDLE_EAST_CORRIDORS,
	baseDensity: MIDDLE_EAST_BASE_DENSITY,
	backboneScale: MIDDLE_EAST_BACKBONE_SCALE,
	noiseSeed: MIDDLE_EAST_NOISE_SEED,
	getBonusScore: getMiddleEastBonusScore,
	getPenaltyScore: getMiddleEastPenaltyScore,
	terrainBaseScore: 0.16,
	terrainNoiseSeed: 337,
	terrainReliefHubs: MIDDLE_EAST_TERRAIN_RELIEF_HUBS,
	terrainReliefPaths: MIDDLE_EAST_TERRAIN_RELIEF_PATHS,
	terrainMountainPaths: MIDDLE_EAST_TERRAIN_MOUNTAIN_PATHS,
	terrainRoughZones: MIDDLE_EAST_TERRAIN_ROUGH_ZONES,
	terrainHarshZones: MIDDLE_EAST_TERRAIN_HARSH_ZONES,
	terrainExtremeZones: MIDDLE_EAST_TERRAIN_EXTREME_ZONES,
	getTerrainPenaltyScore: getMiddleEastTerrainPenaltyScore,
	getTerrainReliefScore: getMiddleEastTerrainReliefScore,
	fastSpan: 30,
	mainSpan: 36,
	midSpan: 40,
	localSpan: 52
});
