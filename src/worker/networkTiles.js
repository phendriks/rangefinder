// networkTiles.js
// Assign network tile metrics using offline per tile road and terrain summaries.

const NETWORK_TILE_FALLBACK_RADIUS_DEFAULT = 8;
const NETWORK_TILE_DEFAULT_KM = {
	fast: 0,
	main: 6,
	mid: 12,
	local: 18
};
const NETWORK_TILE_DEFAULT_TERRAIN_SCORE = 0.10;
const NETWORK_TILE_DECIMALS = 2;

var networkTileAssignmentCache = Object.create(null);

function getNetworkTileFallbackRadiusSteps()
{
	var radiusSteps = Number(C.ROAD_TILE_FALLBACK_RADIUS_STEPS);
	if (!Number.isFinite(radiusSteps) || radiusSteps < 0) return NETWORK_TILE_FALLBACK_RADIUS_DEFAULT;
	return Math.max(0, Math.round(radiusSteps));
}

function buildWeightedRoadTileStats(matches)
{
	if (!matches || !matches.length) return null;

	var fast = 0;
	var main = 0;
	var mid = 0;
	var local = 0;
	var weightTotal = 0;

	for (var i = 0; i < matches.length; i++) {
		var match = matches[i];
		var stats = match.road;
		var weight = match.weight;
		if (!stats || !Number.isFinite(weight) || weight <= 0) continue;
		fast += (Number(stats.fast) || 0) * weight;
		main += (Number(stats.main) || 0) * weight;
		mid += (Number(stats.mid) || 0) * weight;
		local += (Number(stats.local) || 0) * weight;
		weightTotal += weight;
	}

	if (!(weightTotal > 0)) return null;

	return {
		fast: roundHalfUp(fast / weightTotal, NETWORK_TILE_DECIMALS),
		main: roundHalfUp(main / weightTotal, NETWORK_TILE_DECIMALS),
		mid: roundHalfUp(mid / weightTotal, NETWORK_TILE_DECIMALS),
		local: roundHalfUp(local / weightTotal, NETWORK_TILE_DECIMALS)
	};
}

function buildWeightedTerrainData(matches)
{
	if (!matches || !matches.length) return null;

	var terrainScoreSum = 0;
	var weightTotal = 0;
	var severityCounts = Object.create(null);

	for (var i = 0; i < matches.length; i++) {
		var match = matches[i];
		var weight = match.weight;
		if (!Number.isFinite(weight) || weight <= 0) continue;
		if (Number.isFinite(match.terrainScore)) {
			terrainScoreSum += match.terrainScore * weight;
			weightTotal += weight;
		}
		if (match.terrainSeverity !== null && match.terrainSeverity !== undefined) {
			severityCounts[match.terrainSeverity] = (severityCounts[match.terrainSeverity] || 0) + weight;
		}
	}

	if (!(weightTotal > 0)) return null;

	var bestSeverity = C.TERRAIN_NORMAL;
	var bestWeight = -1;
	Object.keys(severityCounts).forEach(terrainSeverity => {
		var severityWeight = severityCounts[terrainSeverity];
		if (severityWeight > bestWeight) {
			bestWeight = severityWeight;
			bestSeverity = Number(terrainSeverity);
		}
	});

	return {
		terrainSeverity: bestSeverity,
		terrainScore: roundHalfUp(terrainScoreSum / weightTotal, NETWORK_TILE_DECIMALS)
	};
}

function getDefaultRoadTileStats()
{
	return {
		fast: NETWORK_TILE_DEFAULT_KM.fast,
		main: NETWORK_TILE_DEFAULT_KM.main,
		mid: NETWORK_TILE_DEFAULT_KM.mid,
		local: NETWORK_TILE_DEFAULT_KM.local
	};
}

function getDefaultTerrainData()
{
	return {
		terrainSeverity: C.TERRAIN_NORMAL,
		terrainScore: NETWORK_TILE_DEFAULT_TERRAIN_SCORE
	};
}

function getNetworkTileRecordForPoint(lat, lng)
{
	var units = getNetworkTileUnitsFromLatLng(lat, lng);
	var cacheKey = buildNetworkTileKeyFromUnits(units.latUnits, units.lngUnits);
	var cached = networkTileAssignmentCache[cacheKey];
	if (cached !== undefined) return cached;

	var exactRecord = getNetworkTileRecord(cacheKey);
	if (exactRecord && exactRecord.road && exactRecord.terrainSeverity !== null && exactRecord.terrainSeverity !== undefined) {
		networkTileAssignmentCache[cacheKey] = exactRecord;
		return exactRecord;
	}

	var maxRadiusSteps = getNetworkTileFallbackRadiusSteps();
	var roadMatches = [];
	var terrainMatches = [];

	if (exactRecord) {
		if (exactRecord.road) roadMatches.push({ road: exactRecord.road, weight: 1 });
		terrainMatches.push({
			terrainSeverity: exactRecord.terrainSeverity,
			terrainScore: exactRecord.terrainScore,
			weight: 1
		});
	}

	for (var radius = 1; radius <= maxRadiusSteps; radius++) {
		for (var dLat = -radius; dLat <= radius; dLat++) {
			for (var dLng = -radius; dLng <= radius; dLng++) {
				if (Math.max(Math.abs(dLat), Math.abs(dLng)) !== radius) continue;
				var neighborKey = buildNetworkTileKeyFromUnits(units.latUnits + dLat, units.lngUnits + dLng);
				var neighborRecord = getNetworkTileRecord(neighborKey);
				if (!neighborRecord) continue;
				var dist = Math.sqrt((dLat * dLat) + (dLng * dLng));
				var weight = 1 / Math.max(1, dist);
				if (neighborRecord.road) {
					roadMatches.push({ road: neighborRecord.road, weight: weight });
				}
				terrainMatches.push({
					terrainSeverity: neighborRecord.terrainSeverity,
					terrainScore: neighborRecord.terrainScore,
					weight: weight
				});
			}
		}

		if ((!exactRecord || exactRecord.road) && roadMatches.length && terrainMatches.length) break;
		if (exactRecord && !exactRecord.road && roadMatches.length && terrainMatches.length) break;
	}

	var roadStats = exactRecord && exactRecord.road ? exactRecord.road : buildWeightedRoadTileStats(roadMatches);
	var terrainData = exactRecord && exactRecord.terrainSeverity !== null && exactRecord.terrainSeverity !== undefined
		? {
			terrainSeverity: exactRecord.terrainSeverity,
			terrainScore: exactRecord.terrainScore
		}
		: buildWeightedTerrainData(terrainMatches);

	if (!roadStats) roadStats = getDefaultRoadTileStats();
	if (!terrainData) terrainData = getDefaultTerrainData();

	var resolvedRecord = {
		road: roadStats,
		terrainSeverity: terrainData.terrainSeverity,
		terrainScore: terrainData.terrainScore
	};
	resolvedRecord.road = normalizeRoadStats(resolvedRecord.road);
	networkTileAssignmentCache[cacheKey] = resolvedRecord;
	return resolvedRecord;
}

function assignTileEnums(mesh)
{
	if (!mesh || !mesh.pts || !mesh.landTypes || !mesh.speedClasses) return;
	if (typeof getNetworkTileRecordForPoint !== 'function') return;

	for (var pointIndex = 0; pointIndex < mesh.pts.length; pointIndex++) {
		var landType = mesh.landTypes[pointIndex];
		if (landType === C.CELL_WATER) continue;

		var point = mesh.pts[pointIndex];
		var tileRecord = getNetworkTileRecordForPoint(point[0], point[1]);
		var roadStats = tileRecord ? tileRecord.road : null;
		var roadBandsKm = getRoadBandsFromTileStats(roadStats);
		var terrainSeverity = tileRecord ? tileRecord.terrainSeverity : C.TERRAIN_NORMAL;
		var terrainScore = tileRecord && Number.isFinite(tileRecord.terrainScore)
			? tileRecord.terrainScore
			: NETWORK_TILE_DEFAULT_TERRAIN_SCORE;

		if (mesh.roadBands) {
			mesh.roadBands[pointIndex] = roadBandsKm;
		}
		if (mesh.terrainSeverities) {
			mesh.terrainSeverities[pointIndex] = terrainSeverity;
		}
		if (mesh.terrainScores) {
			mesh.terrainScores[pointIndex] = terrainScore;
		}

		var speedClass = computeSpeedClassFromRoadBands(roadBandsKm, terrainSeverity);
		if ((!Number.isFinite(speedClass) || speedClass <= 0) && landType === C.CELL_CROSSING) {
			speedClass = getFallbackCrossingSpeedClass();
		}

		if (!Number.isFinite(speedClass) || speedClass <= 0) {
			speedClass = Number(C.ROAD_SPEED_CLASS_MIN);
		}

		mesh.speedClasses[pointIndex] = speedClass;
	}
}
