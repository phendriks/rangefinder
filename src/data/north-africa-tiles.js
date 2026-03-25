// north-africa-tiles.js
// Synthetic network tiles for North Africa.

const NORTH_AFRICA_BOUNDS = {
	minLat: 15,
	maxLat: 38,
	minLng: -18,
	maxLng: 36
};

const NORTH_AFRICA_HUBS = [
	{ lat: 33.5731, lng: -7.5898, weight: 0.76, radiusKm: 220 },
	{ lat: 34.0209, lng: -6.8416, weight: 0.58, radiusKm: 180 },
	{ lat: 35.7595, lng: -5.8340, weight: 0.48, radiusKm: 160 },
	{ lat: 36.7538, lng: 3.0588, weight: 0.78, radiusKm: 240 },
	{ lat: 35.6971, lng: -0.6308, weight: 0.52, radiusKm: 180 },
	{ lat: 36.8065, lng: 10.1815, weight: 0.70, radiusKm: 220 },
	{ lat: 32.8872, lng: 13.1913, weight: 0.52, radiusKm: 180 },
	{ lat: 31.2001, lng: 29.9187, weight: 0.76, radiusKm: 220 },
	{ lat: 30.0444, lng: 31.2357, weight: 0.98, radiusKm: 320 },
	{ lat: 29.9668, lng: 32.5498, weight: 0.42, radiusKm: 170 },
	{ lat: 15.5007, lng: 32.5599, weight: 0.36, radiusKm: 170 }
];

const NORTH_AFRICA_CORRIDORS = [
	{ path: [[-7.5898, 33.5731], [-6.8416, 34.0209], [-5.8340, 35.7595]], weight: 0.76, radiusKm: 180 },
	{ path: [[-1.9070, 34.6814], [-0.6308, 35.6971], [3.0588, 36.7538], [5.3698, 36.7539], [10.1815, 36.8065]], weight: 0.84, radiusKm: 180 },
	{ path: [[13.1913, 32.8872], [20.0686, 32.1167], [29.9187, 31.2001], [31.2357, 30.0444]], weight: 0.76, radiusKm: 180 },
	{ path: [[31.2357, 30.0444], [32.5498, 29.9668], [32.8998, 24.0889]], weight: 0.90, radiusKm: 150 }
];

const NORTH_AFRICA_BASE_DENSITY = 0.09;
const NORTH_AFRICA_BACKBONE_SCALE = 0.92;
const NORTH_AFRICA_NOISE_SEED = 23;
const NORTH_AFRICA_DESERT_EDGE_LAT = 29;
const NORTH_AFRICA_DEEP_DESERT_LAT = 25;
const NORTH_AFRICA_DESERT_MIN_LNG = -9;
const NORTH_AFRICA_DESERT_MAX_LNG = 31;
const NORTH_AFRICA_COAST_MIN_LAT = 30;
const NORTH_AFRICA_COAST_MAX_LAT = 37.5;
const NORTH_AFRICA_NILE_MIN_LNG = 29;
const NORTH_AFRICA_NILE_MAX_LNG = 33.5;

const NORTH_AFRICA_TERRAIN_RELIEF_HUBS = [
	{ lat: 33.5731, lng: -7.5898, weight: 0.40, radiusKm: 200 },
	{ lat: 36.7538, lng: 3.0588, weight: 0.44, radiusKm: 220 },
	{ lat: 30.0444, lng: 31.2357, weight: 0.66, radiusKm: 260 }
];

const NORTH_AFRICA_TERRAIN_RELIEF_PATHS = [
	{ path: [[-7.5898, 33.5731], [3.0588, 36.7538], [10.1815, 36.8065], [31.2357, 30.0444]], weight: 0.48, radiusKm: 180 },
	{ path: [[31.2357, 30.0444], [32.5498, 29.9668], [32.8998, 24.0889], [32.5599, 15.5007]], weight: 0.72, radiusKm: 130 }
];

const NORTH_AFRICA_TERRAIN_MOUNTAIN_PATHS = [
	{ path: [[-10.0, 29.5], [-7.0, 31.5], [-4.0, 33.5], [1.0, 35.0], [7.0, 35.5]], weight: 0.58, radiusKm: 170 }
];

const NORTH_AFRICA_TERRAIN_ROUGH_ZONES = [
	{ minLat: 25, maxLat: 34, minLng: -11, maxLng: 8, weight: 0.18 },
	{ minLat: 25, maxLat: 33, minLng: 20, maxLng: 29, weight: 0.14 }
];

const NORTH_AFRICA_TERRAIN_HARSH_ZONES = [
	{ minLat: 19, maxLat: 29, minLng: -10, maxLng: 33, weight: 0.58 },
	{ minLat: 22, maxLat: 31, minLng: 8, maxLng: 26, weight: 0.36 }
];

const NORTH_AFRICA_TERRAIN_EXTREME_ZONES = [
	{ minLat: 15, maxLat: 25, minLng: -5, maxLng: 31, weight: 0.92 },
	{ minLat: 17, maxLat: 24, minLng: 9, maxLng: 27, weight: 0.78 }
];

function getNorthAfricaBonusScore(lat, lng)
{
	var bonusScore = 0;

	if (lat >= NORTH_AFRICA_COAST_MIN_LAT && lat <= NORTH_AFRICA_COAST_MAX_LAT) {
		bonusScore += 0.10;
	}

	if (lng >= NORTH_AFRICA_NILE_MIN_LNG && lng <= NORTH_AFRICA_NILE_MAX_LNG && lat >= 22 && lat <= 32) {
		bonusScore += 0.20;
	}

	return clampNetworkUnit(bonusScore);
}

function getNorthAfricaPenaltyScore(lat, lng)
{
	var penaltyScore = 0;

	if (lat < NORTH_AFRICA_DESERT_EDGE_LAT && lng >= NORTH_AFRICA_DESERT_MIN_LNG && lng <= NORTH_AFRICA_DESERT_MAX_LNG) {
		penaltyScore += ((NORTH_AFRICA_DESERT_EDGE_LAT - lat) / 12) * 0.70;
	}

	if (lat < NORTH_AFRICA_DEEP_DESERT_LAT && lng >= -2 && lng <= 30) {
		penaltyScore += ((NORTH_AFRICA_DEEP_DESERT_LAT - lat) / 10) * 0.35;
	}

	return clampNetworkUnit(penaltyScore);
}

function getNorthAfricaTerrainPenaltyScore(lat, lng)
{
	var penaltyScore = 0;

	if (lat < 28 && lng >= -5 && lng <= 30) {
		penaltyScore += ((28 - lat) / 13) * 0.30;
	}
	if (lat < 23 && lng >= 5 && lng <= 27) {
		penaltyScore += ((23 - lat) / 8) * 0.26;
	}

	return clampNetworkUnit(penaltyScore);
}

function getNorthAfricaTerrainReliefScore(lat, lng)
{
	var reliefScore = 0;

	if (lat >= 30 && lat <= 37.5) {
		reliefScore += 0.18;
	}
	if (lng >= 29 && lng <= 33.5 && lat >= 22 && lat <= 32) {
		reliefScore += 0.34;
	}

	return clampNetworkUnit(reliefScore);
}

registerSyntheticNetworkRegion({
	bounds: NORTH_AFRICA_BOUNDS,
	hubs: NORTH_AFRICA_HUBS,
	corridors: NORTH_AFRICA_CORRIDORS,
	baseDensity: NORTH_AFRICA_BASE_DENSITY,
	backboneScale: NORTH_AFRICA_BACKBONE_SCALE,
	noiseSeed: NORTH_AFRICA_NOISE_SEED,
	getBonusScore: getNorthAfricaBonusScore,
	getPenaltyScore: getNorthAfricaPenaltyScore,
	terrainBaseScore: 0.18,
	terrainNoiseSeed: 223,
	terrainReliefHubs: NORTH_AFRICA_TERRAIN_RELIEF_HUBS,
	terrainReliefPaths: NORTH_AFRICA_TERRAIN_RELIEF_PATHS,
	terrainMountainPaths: NORTH_AFRICA_TERRAIN_MOUNTAIN_PATHS,
	terrainRoughZones: NORTH_AFRICA_TERRAIN_ROUGH_ZONES,
	terrainHarshZones: NORTH_AFRICA_TERRAIN_HARSH_ZONES,
	terrainExtremeZones: NORTH_AFRICA_TERRAIN_EXTREME_ZONES,
	getTerrainPenaltyScore: getNorthAfricaTerrainPenaltyScore,
	getTerrainReliefScore: getNorthAfricaTerrainReliefScore,
	fastBase: 0,
	fastSpan: 24,
	mainBase: 7,
	mainSpan: 34,
	midBase: 16,
	midSpan: 38,
	localBase: 23,
	localSpan: 50
});
