// network-tiles.js
// Shared network tile helpers and regional road plus terrain synthesis.

const NETWORK_TILE_SIZE_DEG = 0.5;
const NETWORK_TILE_CENTER_OFFSET_DEG = NETWORK_TILE_SIZE_DEG / 2;
const NETWORK_TILE_KEY_EPSILON = 1e-9;
const NETWORK_TILE_BUCKET_DEG = 3;
const NETWORK_SIGNAL_FALLOFF_POWER = 1.5;
const NETWORK_DISTANCE_FALLBACK_KM_PER_DEG = 111.32;
const ROAD_SIGNAL_WEIGHT_CORRIDOR = 0.60;
const ROAD_SIGNAL_WEIGHT_HUB = 0.32;
const ROAD_SIGNAL_WEIGHT_BONUS = 0.12;
const ROAD_SIGNAL_WEIGHT_NOISE = 0.06;
const ROAD_SIGNAL_WEIGHT_PENALTY = 0.55;
const ROAD_ACCESS_WEIGHT_DENSITY = 0.45;
const ROAD_ACCESS_WEIGHT_CORRIDOR = 0.18;
const ROAD_ACCESS_WEIGHT_HUB = 0.20;
const ROAD_ACCESS_WEIGHT_BONUS = 0.10;
const ROAD_ACCESS_WEIGHT_NOISE = 0.08;
const ROAD_ACCESS_WEIGHT_PENALTY = 0.38;
const ROAD_LOCAL_WEIGHT_DENSITY = 0.50;
const ROAD_LOCAL_WEIGHT_ACCESS = 0.18;
const ROAD_LOCAL_WEIGHT_HUB = 0.10;
const ROAD_LOCAL_WEIGHT_NOISE = 0.08;
const ROAD_LOCAL_WEIGHT_PENALTY = 0.25;
const ROAD_MAIN_BACKBONE_WEIGHT = 0.35;
const ROAD_MAIN_DENSITY_WEIGHT = 0.65;
const ROAD_MID_BACKBONE_WEIGHT = 0.20;
const ROAD_MID_ACCESS_WEIGHT = 0.80;
const ROAD_DEFAULT_FAST_BASE = 1;
const ROAD_DEFAULT_FAST_SPAN = 34;
const ROAD_DEFAULT_MAIN_BASE = 9;
const ROAD_DEFAULT_MAIN_SPAN = 38;
const ROAD_DEFAULT_MID_BASE = 18;
const ROAD_DEFAULT_MID_SPAN = 42;
const ROAD_DEFAULT_LOCAL_BASE = 25;
const ROAD_DEFAULT_LOCAL_SPAN = 54;
const ROAD_MAIN_MIN_GAP = 4;
const ROAD_MID_MIN_GAP = 6;
const ROAD_LOCAL_MIN_GAP = 6;
const TERRAIN_SCORE_DEFAULT = 0.10;
const TERRAIN_SMOOTH_CENTER_WEIGHT = 0.55;
const TERRAIN_SMOOTH_CARDINAL_WEIGHT = 0.1125;
const TERRAIN_SMOOTH_DIAGONAL_WEIGHT = 0.075;
const TERRAIN_NORMAL_THRESHOLD = 0.25;
const TERRAIN_ROUGH_THRESHOLD = 0.50;
const TERRAIN_HARSH_THRESHOLD = 0.80;
const TERRAIN_NOISE_WEIGHT = 0.04;
const TERRAIN_FEATURE_WEIGHT_PATH = 1.00;
const TERRAIN_FEATURE_WEIGHT_HUB = 1.00;
const TERRAIN_FEATURE_WEIGHT_ZONE = 1.00;

C.NETWORK_TILES = self.C && self.C.NETWORK_TILES ? self.C.NETWORK_TILES : Object.create(null);

const NETWORK_TILE_SOURCES = [];
const NETWORK_TILE_LAND_CACHE = Object.create(null);

let networkLandIndex = null;

function clampNetworkNumber(valueFloat, minValue, maxValue)
{
	return Math.max(minValue, Math.min(maxValue, valueFloat));
}

function clampNetworkUnit(valueFloat)
{
	return clampNetworkNumber(Number(valueFloat) || 0, 0, 1);
}

function roundNetworkInt(valueFloat)
{
	return Math.round(Number(valueFloat) || 0);
}

function normalizeRoadStats(stats)
{
	if (!stats) return null;

	var fast = Math.max(0, roundNetworkInt(stats.fast));
	var main = Math.max(fast + ROAD_MAIN_MIN_GAP, roundNetworkInt(stats.main));
	var mid = Math.max(main + ROAD_MID_MIN_GAP, roundNetworkInt(stats.mid));
	var local = Math.max(mid + ROAD_LOCAL_MIN_GAP, roundNetworkInt(stats.local));

	return {
		fast: fast,
		main: main,
		mid: mid,
		local: local
	};
}

function normalizeTerrainSeverity(terrainSeverity)
{
	if (terrainSeverity === C.TERRAIN_ROUGH || terrainSeverity === C.TERRAIN_HARSH || terrainSeverity === C.TERRAIN_EXTREME) {
		return terrainSeverity;
	}
	return C.TERRAIN_NORMAL;
}

function buildNetworkTileRecord(roadStats, terrainData)
{
	if (!roadStats && !terrainData) return null;

	var terrainSeverity = normalizeTerrainSeverity(terrainData && terrainData.terrainSeverity);
	var terrainScore = terrainData && Number.isFinite(terrainData.terrainScore)
		? clampNetworkUnit(terrainData.terrainScore)
		: TERRAIN_SCORE_DEFAULT;

	return {
		road: normalizeRoadStats(roadStats),
		terrainSeverity: terrainSeverity,
		terrainScore: terrainScore
	};
}

function registerNetworkTileSource(sourceFn)
{
	if (typeof sourceFn !== 'function') return;
	NETWORK_TILE_SOURCES.push(sourceFn);
}

function mergeNetworkTiles(networkTiles)
{
	if (!networkTiles) return;

	Object.keys(networkTiles).forEach(tileKey => {
		var record = networkTiles[tileKey];
		if (!record) return;
		C.NETWORK_TILES[tileKey] = buildNetworkTileRecord(record.road, record);
	});
}

function getNetworkTileSizeDeg()
{
	return NETWORK_TILE_SIZE_DEG;
}

function getRoadTileSizeDeg()
{
	return getNetworkTileSizeDeg();
}

function getNetworkTileUnitsFromLatLng(lat, lng)
{
	return {
		latUnits: Math.floor((lat / NETWORK_TILE_SIZE_DEG) + NETWORK_TILE_KEY_EPSILON),
		lngUnits: Math.floor((lng / NETWORK_TILE_SIZE_DEG) + NETWORK_TILE_KEY_EPSILON)
	};
}

function getRoadTileUnitsFromLatLng(lat, lng)
{
	return getNetworkTileUnitsFromLatLng(lat, lng);
}

function buildNetworkTileKeyFromUnits(latUnits, lngUnits)
{
	return (latUnits * NETWORK_TILE_SIZE_DEG).toFixed(1) + '_' + (lngUnits * NETWORK_TILE_SIZE_DEG).toFixed(1);
}

function buildRoadTileKeyFromUnits(latUnits, lngUnits)
{
	return buildNetworkTileKeyFromUnits(latUnits, lngUnits);
}

function getNetworkTileInfoFromLatLng(lat, lng)
{
	var units = getNetworkTileUnitsFromLatLng(lat, lng);
	return getNetworkTileInfoFromUnits(units.latUnits, units.lngUnits);
}

function getRoadTileInfoFromLatLng(lat, lng)
{
	return getNetworkTileInfoFromLatLng(lat, lng);
}

function getNetworkTileInfoFromUnits(latUnits, lngUnits)
{
	var tileLat = latUnits * NETWORK_TILE_SIZE_DEG;
	var tileLng = lngUnits * NETWORK_TILE_SIZE_DEG;
	return {
		tileKey: buildNetworkTileKeyFromUnits(latUnits, lngUnits),
		tileLat: tileLat,
		tileLng: tileLng,
		latUnits: latUnits,
		lngUnits: lngUnits,
		centerLat: tileLat + NETWORK_TILE_CENTER_OFFSET_DEG,
		centerLng: tileLng + NETWORK_TILE_CENTER_OFFSET_DEG
	};
}

function getRoadTileInfoFromUnits(latUnits, lngUnits)
{
	return getNetworkTileInfoFromUnits(latUnits, lngUnits);
}

function getNetworkTileInfoFromTileKey(tileKey)
{
	if (!tileKey || typeof tileKey !== 'string') return null;

	var parts = tileKey.split('_');
	if (parts.length !== 2) return null;

	var tileLat = Number(parts[0]);
	var tileLng = Number(parts[1]);
	if (!Number.isFinite(tileLat) || !Number.isFinite(tileLng)) return null;

	return {
		tileKey: tileKey,
		tileLat: tileLat,
		tileLng: tileLng,
		latUnits: Math.round(tileLat / NETWORK_TILE_SIZE_DEG),
		lngUnits: Math.round(tileLng / NETWORK_TILE_SIZE_DEG),
		centerLat: tileLat + NETWORK_TILE_CENTER_OFFSET_DEG,
		centerLng: tileLng + NETWORK_TILE_CENTER_OFFSET_DEG
	};
}

function getRoadTileInfoFromTileKey(tileKey)
{
	return getNetworkTileInfoFromTileKey(tileKey);
}

function getNetworkTileKeyFromLatLng(lat, lng)
{
	return getNetworkTileInfoFromLatLng(lat, lng).tileKey;
}

function getRoadTileKeyFromLatLng(lat, lng)
{
	return getNetworkTileKeyFromLatLng(lat, lng);
}

function getNetworkTileRecord(tileKey)
{
	var cached = C.NETWORK_TILES[tileKey];
	if (cached) return cached;

	var tileInfo = getNetworkTileInfoFromTileKey(tileKey);
	if (!tileInfo) return null;

	for (var sourceIndex = 0; sourceIndex < NETWORK_TILE_SOURCES.length; sourceIndex++) {
		var sourceRecord = NETWORK_TILE_SOURCES[sourceIndex](tileInfo);
		if (!sourceRecord) continue;
		var normalizedRecord = buildNetworkTileRecord(sourceRecord.road, sourceRecord);
		if (!normalizedRecord) continue;
		C.NETWORK_TILES[tileKey] = normalizedRecord;
		return normalizedRecord;
	}

	return null;
}

function getRoadTileStats(tileKey)
{
	var record = getNetworkTileRecord(tileKey);
	return record ? record.road : null;
}

function getTerrainSeverity(tileKey)
{
	var record = getNetworkTileRecord(tileKey);
	return record ? record.terrainSeverity : null;
}

function getTerrainScore(tileKey)
{
	var record = getNetworkTileRecord(tileKey);
	return record ? record.terrainScore : null;
}

function isTileInfoInBounds(tileInfo, bounds)
{
	if (!tileInfo || !bounds) return false;
	if (tileInfo.centerLat < bounds.minLat || tileInfo.centerLat > bounds.maxLat) return false;
	if (tileInfo.centerLng < bounds.minLng || tileInfo.centerLng > bounds.maxLng) return false;
	return true;
}

function getNetworkApproxDistanceKm(latA, lngA, latB, lngB)
{
	var kmPerDegLat = Number(C && C.KM_PER_DEG_LAT) || NETWORK_DISTANCE_FALLBACK_KM_PER_DEG;
	var meanLat = (latA + latB) / 2;
	var lngScale = Math.cos(meanLat * Math.PI / 180);
	var deltaLatKm = (latB - latA) * kmPerDegLat;
	var deltaLngKm = (lngB - lngA) * kmPerDegLat * lngScale;
	return Math.sqrt((deltaLatKm * deltaLatKm) + (deltaLngKm * deltaLngKm));
}

function getRoadApproxDistanceKm(latA, lngA, latB, lngB)
{
	return getNetworkApproxDistanceKm(latA, lngA, latB, lngB);
}

function getDistanceToSegmentKm(lat, lng, startLng, startLat, endLng, endLat)
{
	var kmPerDegLat = Number(C && C.KM_PER_DEG_LAT) || NETWORK_DISTANCE_FALLBACK_KM_PER_DEG;
	var meanLat = (lat + startLat + endLat) / 3;
	var lngScale = Math.cos(meanLat * Math.PI / 180);

	var pointX = lng * kmPerDegLat * lngScale;
	var pointY = lat * kmPerDegLat;
	var startX = startLng * kmPerDegLat * lngScale;
	var startY = startLat * kmPerDegLat;
	var endX = endLng * kmPerDegLat * lngScale;
	var endY = endLat * kmPerDegLat;

	var segX = endX - startX;
	var segY = endY - startY;
	var segLenSq = (segX * segX) + (segY * segY);
	if (!(segLenSq > 0)) {
		var dxPoint = pointX - startX;
		var dyPoint = pointY - startY;
		return Math.sqrt((dxPoint * dxPoint) + (dyPoint * dyPoint));
	}

	var t = ((pointX - startX) * segX + (pointY - startY) * segY) / segLenSq;
	t = clampNetworkNumber(t, 0, 1);

	var projX = startX + (segX * t);
	var projY = startY + (segY * t);
	var dx = pointX - projX;
	var dy = pointY - projY;
	return Math.sqrt((dx * dx) + (dy * dy));
}

function getDistanceToPathKm(lat, lng, path)
{
	if (!Array.isArray(path) || path.length < 2) return Infinity;

	var bestKm = Infinity;
	for (var pointIndex = 1; pointIndex < path.length; pointIndex++) {
		var start = path[pointIndex - 1];
		var end = path[pointIndex];
		var segmentDistanceKm = getDistanceToSegmentKm(lat, lng, start[0], start[1], end[0], end[1]);
		if (segmentDistanceKm < bestKm) bestKm = segmentDistanceKm;
	}

	return bestKm;
}

function getNetworkInfluenceValue(distanceKm, radiusKm, weight)
{
	if (!(radiusKm > 0) || !Number.isFinite(distanceKm) || distanceKm >= radiusKm) return 0;
	var ratio = 1 - (distanceKm / radiusKm);
	return Math.max(0, Number(weight) || 0) * Math.pow(ratio, NETWORK_SIGNAL_FALLOFF_POWER);
}

function getHubInfluenceScore(lat, lng, hubs)
{
	if (!Array.isArray(hubs) || !hubs.length) return 0;

	var score = 0;
	for (var hubIndex = 0; hubIndex < hubs.length; hubIndex++) {
		var hub = hubs[hubIndex];
		var distanceKm = getNetworkApproxDistanceKm(lat, lng, hub.lat, hub.lng);
		score += getNetworkInfluenceValue(distanceKm, hub.radiusKm, hub.weight * TERRAIN_FEATURE_WEIGHT_HUB);
	}

	return clampNetworkUnit(score);
}

function getCorridorInfluenceScore(lat, lng, corridors)
{
	if (!Array.isArray(corridors) || !corridors.length) return 0;

	var score = 0;
	for (var corridorIndex = 0; corridorIndex < corridors.length; corridorIndex++) {
		var corridor = corridors[corridorIndex];
		var distanceKm = getDistanceToPathKm(lat, lng, corridor.path);
		score += getNetworkInfluenceValue(distanceKm, corridor.radiusKm, corridor.weight * TERRAIN_FEATURE_WEIGHT_PATH);
	}

	return clampNetworkUnit(score);
}

function getZoneInfluenceScore(lat, lng, zones)
{
	if (!Array.isArray(zones) || !zones.length) return 0;

	var score = 0;
	for (var zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
		var zone = zones[zoneIndex];
		if (lat < zone.minLat || lat > zone.maxLat || lng < zone.minLng || lng > zone.maxLng) continue;
		score += (Number(zone.weight) || 0) * TERRAIN_FEATURE_WEIGHT_ZONE;
	}

	return clampNetworkUnit(score);
}

function getNetworkNoise(lat, lng, seedValue)
{
	var seed = Number(seedValue) || 0;
	var raw = Math.sin(((lat * 12.9898) + (lng * 78.233) + (seed * 37.719)) * Math.PI / 180) * 43758.5453;
	return raw - Math.floor(raw);
}

function getNetworkTileBucketKey(lat, lng)
{
	var bucketLat = Math.floor(lat / NETWORK_TILE_BUCKET_DEG);
	var bucketLng = Math.floor(lng / NETWORK_TILE_BUCKET_DEG);
	return bucketLat + '_' + bucketLng;
}

function computeNetworkPolygonBounds(poly)
{
	var minLng = Infinity;
	var maxLng = -Infinity;
	var minLat = Infinity;
	var maxLat = -Infinity;

	for (var pointIndex = 0; pointIndex < poly.length; pointIndex++) {
		var point = poly[pointIndex];
		var lng = point[0];
		var lat = point[1];
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
	}

	return {
		minLng: minLng,
		maxLng: maxLng,
		minLat: minLat,
		maxLat: maxLat
	};
}

function ensureNetworkLandIndex()
{
	if (networkLandIndex || !Array.isArray(C.COUNTRY_POLYGONS)) return;
	networkLandIndex = new Map();

	for (var countryIndex = 0; countryIndex < C.COUNTRY_POLYGONS.length; countryIndex++) {
		var country = C.COUNTRY_POLYGONS[countryIndex];
		var polys = Array.isArray(country.polys) ? country.polys : [];
		for (var polyIndex = 0; polyIndex < polys.length; polyIndex++) {
			var poly = polys[polyIndex];
			if (!Array.isArray(poly) || poly.length < 3) continue;

			var bounds = computeNetworkPolygonBounds(poly);
			var minBucketLat = Math.floor(bounds.minLat / NETWORK_TILE_BUCKET_DEG);
			var maxBucketLat = Math.floor(bounds.maxLat / NETWORK_TILE_BUCKET_DEG);
			var minBucketLng = Math.floor(bounds.minLng / NETWORK_TILE_BUCKET_DEG);
			var maxBucketLng = Math.floor(bounds.maxLng / NETWORK_TILE_BUCKET_DEG);

			for (var bucketLat = minBucketLat; bucketLat <= maxBucketLat; bucketLat++) {
				for (var bucketLng = minBucketLng; bucketLng <= maxBucketLng; bucketLng++) {
					var bucketKey = bucketLat + '_' + bucketLng;
					var bucket = networkLandIndex.get(bucketKey);
					if (!bucket) {
						bucket = [];
						networkLandIndex.set(bucketKey, bucket);
					}
					bucket.push({ poly: poly, bounds: bounds });
				}
			}
		}
	}
}

function isPointInNetworkPolygon(lat, lng, poly)
{
	var inside = false;
	for (var pointIndex = 0, prevIndex = poly.length - 1; pointIndex < poly.length; prevIndex = pointIndex++) {
		var pointA = poly[pointIndex];
		var pointB = poly[prevIndex];
		var lngA = pointA[0];
		var latA = pointA[1];
		var lngB = pointB[0];
		var latB = pointB[1];

		var intersects = ((latA > lat) !== (latB > lat))
			&& (lng < ((lngB - lngA) * (lat - latA) / ((latB - latA) || 1e-12)) + lngA);

		if (intersects) inside = !inside;
	}

	return inside;
}

function isLandPoint(lat, lng)
{
	var cacheKey = lat.toFixed(2) + '_' + lng.toFixed(2);
	if (NETWORK_TILE_LAND_CACHE[cacheKey] !== undefined) return NETWORK_TILE_LAND_CACHE[cacheKey];

	if (!Array.isArray(C.COUNTRY_POLYGONS)) {
		NETWORK_TILE_LAND_CACHE[cacheKey] = true;
		return true;
	}

	ensureNetworkLandIndex();
	if (!networkLandIndex) {
		NETWORK_TILE_LAND_CACHE[cacheKey] = false;
		return false;
	}

	var bucket = networkLandIndex.get(getNetworkTileBucketKey(lat, lng));
	if (!bucket) {
		NETWORK_TILE_LAND_CACHE[cacheKey] = false;
		return false;
	}

	for (var entryIndex = 0; entryIndex < bucket.length; entryIndex++) {
		var entry = bucket[entryIndex];
		var bounds = entry.bounds;
		if (lng < bounds.minLng || lng > bounds.maxLng || lat < bounds.minLat || lat > bounds.maxLat) continue;
		if (isPointInNetworkPolygon(lat, lng, entry.poly)) {
			NETWORK_TILE_LAND_CACHE[cacheKey] = true;
			return true;
		}
	}

	NETWORK_TILE_LAND_CACHE[cacheKey] = false;
	return false;
}

function buildSyntheticRoadStats(config, densityScore, backboneScore, accessScore, hubScore, noiseScore)
{
	var fastBase = Number(config.fastBase) || ROAD_DEFAULT_FAST_BASE;
	var fastSpan = Number(config.fastSpan) || ROAD_DEFAULT_FAST_SPAN;
	var mainBase = Number(config.mainBase) || ROAD_DEFAULT_MAIN_BASE;
	var mainSpan = Number(config.mainSpan) || ROAD_DEFAULT_MAIN_SPAN;
	var midBase = Number(config.midBase) || ROAD_DEFAULT_MID_BASE;
	var midSpan = Number(config.midSpan) || ROAD_DEFAULT_MID_SPAN;
	var localBase = Number(config.localBase) || ROAD_DEFAULT_LOCAL_BASE;
	var localSpan = Number(config.localSpan) || ROAD_DEFAULT_LOCAL_SPAN;

	var localStrength = clampNetworkUnit(
		0.22
		+ (ROAD_LOCAL_WEIGHT_DENSITY * densityScore)
		+ (ROAD_LOCAL_WEIGHT_ACCESS * accessScore)
		+ (ROAD_LOCAL_WEIGHT_HUB * hubScore)
		+ (ROAD_LOCAL_WEIGHT_NOISE * noiseScore)
	);

	var fast = roundNetworkInt(fastBase + (fastSpan * backboneScore) + (4 * hubScore));
	var main = roundNetworkInt(mainBase + (mainSpan * ((ROAD_MAIN_BACKBONE_WEIGHT * backboneScore) + (ROAD_MAIN_DENSITY_WEIGHT * densityScore))));
	var mid = roundNetworkInt(midBase + (midSpan * ((ROAD_MID_BACKBONE_WEIGHT * backboneScore) + (ROAD_MID_ACCESS_WEIGHT * accessScore))));
	var local = roundNetworkInt(localBase + (localSpan * localStrength));

	return normalizeRoadStats({
		fast: fast,
		main: main,
		mid: mid,
		local: local
	});
}

function getTerrainSeverityFromScore(terrainScore)
{
	var clampedScore = clampNetworkUnit(terrainScore);
	if (clampedScore >= TERRAIN_HARSH_THRESHOLD) return C.TERRAIN_EXTREME;
	if (clampedScore >= TERRAIN_ROUGH_THRESHOLD) return C.TERRAIN_HARSH;
	if (clampedScore >= TERRAIN_NORMAL_THRESHOLD) return C.TERRAIN_ROUGH;
	return C.TERRAIN_NORMAL;
}

function computeTerrainBaseScore(config, lat, lng, tileInfo)
{
	var terrainBaseScore = Number(config.terrainBaseScore);
	if (!Number.isFinite(terrainBaseScore)) terrainBaseScore = TERRAIN_SCORE_DEFAULT;

	var roughZoneScore = getZoneInfluenceScore(lat, lng, config.terrainRoughZones);
	var harshZoneScore = getZoneInfluenceScore(lat, lng, config.terrainHarshZones);
	var extremeZoneScore = getZoneInfluenceScore(lat, lng, config.terrainExtremeZones);
	var mountainScore = getCorridorInfluenceScore(lat, lng, config.terrainMountainPaths);
	var roughPathScore = getCorridorInfluenceScore(lat, lng, config.terrainRoughPaths);
	var reliefPathScore = getCorridorInfluenceScore(lat, lng, config.terrainReliefPaths);
	var reliefHubScore = getHubInfluenceScore(lat, lng, config.terrainReliefHubs);
	var terrainNoise = getNetworkNoise(lat, lng, Number(config.terrainNoiseSeed) || Number(config.noiseSeed) || 0);
	var customPenalty = typeof config.getTerrainPenaltyScore === 'function'
		? clampNetworkUnit(config.getTerrainPenaltyScore(lat, lng, tileInfo))
		: 0;
	var customRelief = typeof config.getTerrainReliefScore === 'function'
		? clampNetworkUnit(config.getTerrainReliefScore(lat, lng, tileInfo))
		: 0;

	return clampNetworkUnit(
		terrainBaseScore
		+ (0.30 * roughZoneScore)
		+ (0.48 * harshZoneScore)
		+ (0.72 * extremeZoneScore)
		+ (0.44 * mountainScore)
		+ (0.20 * roughPathScore)
		+ (0.26 * customPenalty)
		+ (TERRAIN_NOISE_WEIGHT * terrainNoise)
		- (0.24 * reliefPathScore)
		- (0.20 * reliefHubScore)
		- (0.24 * customRelief)
	);
}

function buildTerrainDataForRegion(config, tileInfo)
{
	if (!config || !tileInfo) return {
		terrainSeverity: C.TERRAIN_NORMAL,
		terrainScore: TERRAIN_SCORE_DEFAULT
	};

	var lat = tileInfo.centerLat;
	var lng = tileInfo.centerLng;
	var centerScore = computeTerrainBaseScore(config, lat, lng, tileInfo);
	var sampleStep = NETWORK_TILE_SIZE_DEG * 0.5;
	var smoothScore = centerScore * TERRAIN_SMOOTH_CENTER_WEIGHT;

	smoothScore += computeTerrainBaseScore(config, lat + sampleStep, lng, tileInfo) * TERRAIN_SMOOTH_CARDINAL_WEIGHT;
	smoothScore += computeTerrainBaseScore(config, lat - sampleStep, lng, tileInfo) * TERRAIN_SMOOTH_CARDINAL_WEIGHT;
	smoothScore += computeTerrainBaseScore(config, lat, lng + sampleStep, tileInfo) * TERRAIN_SMOOTH_CARDINAL_WEIGHT;
	smoothScore += computeTerrainBaseScore(config, lat, lng - sampleStep, tileInfo) * TERRAIN_SMOOTH_CARDINAL_WEIGHT;
	smoothScore += computeTerrainBaseScore(config, lat + sampleStep, lng + sampleStep, tileInfo) * TERRAIN_SMOOTH_DIAGONAL_WEIGHT;
	smoothScore += computeTerrainBaseScore(config, lat + sampleStep, lng - sampleStep, tileInfo) * TERRAIN_SMOOTH_DIAGONAL_WEIGHT;
	smoothScore += computeTerrainBaseScore(config, lat - sampleStep, lng + sampleStep, tileInfo) * TERRAIN_SMOOTH_DIAGONAL_WEIGHT;
	smoothScore += computeTerrainBaseScore(config, lat - sampleStep, lng - sampleStep, tileInfo) * TERRAIN_SMOOTH_DIAGONAL_WEIGHT;

	smoothScore = clampNetworkUnit(smoothScore);
	return {
		terrainSeverity: getTerrainSeverityFromScore(smoothScore),
		terrainScore: smoothScore
	};
}

function registerSyntheticNetworkRegion(config)
{
	if (!config || !config.bounds) return;

	registerNetworkTileSource(tileInfo => {
		if (!isTileInfoInBounds(tileInfo, config.bounds)) return null;
		if (config.requireLand !== false && !isLandPoint(tileInfo.centerLat, tileInfo.centerLng)) return null;

		var corridorScore = getCorridorInfluenceScore(tileInfo.centerLat, tileInfo.centerLng, config.corridors);
		var hubScore = getHubInfluenceScore(tileInfo.centerLat, tileInfo.centerLng, config.hubs);
		var bonusScore = typeof config.getBonusScore === 'function'
			? clampNetworkUnit(config.getBonusScore(tileInfo.centerLat, tileInfo.centerLng, tileInfo))
			: 0;
		var penaltyScore = typeof config.getPenaltyScore === 'function'
			? clampNetworkUnit(config.getPenaltyScore(tileInfo.centerLat, tileInfo.centerLng, tileInfo))
			: 0;
		var noiseScore = getNetworkNoise(tileInfo.centerLat, tileInfo.centerLng, config.noiseSeed);

		var densityScore = clampNetworkUnit(
			(Number(config.baseDensity) || 0)
			+ (ROAD_SIGNAL_WEIGHT_CORRIDOR * corridorScore)
			+ (ROAD_SIGNAL_WEIGHT_HUB * hubScore)
			+ (ROAD_SIGNAL_WEIGHT_BONUS * bonusScore)
			+ (ROAD_SIGNAL_WEIGHT_NOISE * noiseScore)
			- (ROAD_SIGNAL_WEIGHT_PENALTY * penaltyScore)
		);

		var backboneScale = Number(config.backboneScale) || 1;
		var backboneScore = clampNetworkUnit(
			(
				0.08
				+ (0.75 * corridorScore)
				+ (0.20 * hubScore)
				+ (0.10 * bonusScore)
				+ (0.04 * noiseScore)
				- (0.70 * penaltyScore)
			) * backboneScale
		);

		var accessScore = clampNetworkUnit(
			(Number(config.baseDensity) || 0)
			+ (ROAD_ACCESS_WEIGHT_DENSITY * densityScore)
			+ (ROAD_ACCESS_WEIGHT_CORRIDOR * corridorScore)
			+ (ROAD_ACCESS_WEIGHT_HUB * hubScore)
			+ (ROAD_ACCESS_WEIGHT_BONUS * bonusScore)
			+ (ROAD_ACCESS_WEIGHT_NOISE * noiseScore)
			- (ROAD_ACCESS_WEIGHT_PENALTY * penaltyScore)
		);

		return buildNetworkTileRecord(
			buildSyntheticRoadStats(config, densityScore, backboneScore, accessScore, hubScore, noiseScore),
			buildTerrainDataForRegion(config, tileInfo)
		);
	});
}
