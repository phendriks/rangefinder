// tileClassification.js
// Assign road tile metrics using offline per tile road summaries.

//TODO: store functions in a central helper database

var roadTileAssignmentCache = Object.create(null);

function GetRoadTileFallbackRadiusSteps()
{
	var radiusSteps = Number(C.ROAD_TILE_FALLBACK_RADIUS_STEPS);
	if (!Number.isFinite(radiusSteps) || radiusSteps < 0) return 8;
	return Math.max(0, Math.round(radiusSteps));
}

function GetRoadTileUnitsFromLatLng(lat, lng)
{
	var tileSizeDeg = Number(C.ROADS_TILE_SIZE_DEG);
	if (!Number.isFinite(tileSizeDeg) || tileSizeDeg <= 0) tileSizeDeg = 0.5;
	var tileEps = Number(C.TILE_KEY_EPSILON);
	if (!Number.isFinite(tileEps)) tileEps = 0;
	return {
		tileSizeDeg: tileSizeDeg,
		latUnits: Math.floor((lat / tileSizeDeg) + tileEps),
		lngUnits: Math.floor((lng / tileSizeDeg) + tileEps)
	};
}

function BuildRoadTileKeyFromUnits(latUnits, lngUnits, tileSizeDeg)
{
	return (latUnits * tileSizeDeg).toFixed(1) + '_' + (lngUnits * tileSizeDeg).toFixed(1);
}

function BuildWeightedRoadTileStats(matches)
{
	if (!matches || !matches.length) return null;

	var fast = 0;
	var main = 0;
	var mid = 0;
	var local = 0;
	var weightTotal = 0;

	for (var i = 0; i < matches.length; i++) {
		var match = matches[i];
		var stats = match.stats;
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
		fast: RoundHalfUp(fast / weightTotal, 2),
		main: RoundHalfUp(main / weightTotal, 2),
		mid: RoundHalfUp(mid / weightTotal, 2),
		local: RoundHalfUp(local / weightTotal, 2)
	};
}

function GetDefaultRoadTileStats()
{
	// Conservative fallback for rare land cells that are outside the sparse tile coverage.
	return {
		fast: Number(C.ROAD_TILE_DEFAULT_FAST_KM) || 0,
		main: Number(C.ROAD_TILE_DEFAULT_MAIN_KM) || 6,
		mid: Number(C.ROAD_TILE_DEFAULT_MID_KM) || 12,
		local: Number(C.ROAD_TILE_DEFAULT_LOCAL_KM) || 18
	};
}

function GetRoadTileStatsForPoint(lat, lng)
{
	var units = GetRoadTileUnitsFromLatLng(lat, lng);
	var tileSizeDeg = units.tileSizeDeg;
	var cacheKey = BuildRoadTileKeyFromUnits(units.latUnits, units.lngUnits, tileSizeDeg);
	var cached = roadTileAssignmentCache[cacheKey];
	if (cached !== undefined) return cached;

	var exact = GetRoadTileStats(cacheKey);
	if (exact) {
		roadTileAssignmentCache[cacheKey] = exact;
		return exact;
	}

	var maxRadiusSteps = GetRoadTileFallbackRadiusSteps();
	for (var radius = 1; radius <= maxRadiusSteps; radius++) {
		var matches = [];
		for (var dLat = -radius; dLat <= radius; dLat++) {
			for (var dLng = -radius; dLng <= radius; dLng++) {
				if (Math.max(Math.abs(dLat), Math.abs(dLng)) !== radius) continue;
				var neighborKey = BuildRoadTileKeyFromUnits(units.latUnits + dLat, units.lngUnits + dLng, tileSizeDeg);
				var neighborStats = GetRoadTileStats(neighborKey);
				if (!neighborStats) continue;
				var dist = Math.sqrt((dLat * dLat) + (dLng * dLng));
				var weight = 1 / Math.max(1, dist);
				matches.push({ stats: neighborStats, weight: weight });
			}
		}

		if (matches.length) {
			var interpolated = BuildWeightedRoadTileStats(matches);
			roadTileAssignmentCache[cacheKey] = interpolated;
			return interpolated;
		}
	}

	var fallback = GetDefaultRoadTileStats();
	roadTileAssignmentCache[cacheKey] = fallback;
	return fallback;
}

function AssignRoadEnums(mesh)
{
	if (!mesh) return;
	if (!mesh.pts || !mesh.landTypes) return;
	if (!mesh.speedClasses) return;
	if (typeof GetRoadTileStats !== 'function') return;
	if (typeof GetRoadTileKeyFromLatLng !== 'function') return;

	for (var pointIndex = 0; pointIndex < mesh.pts.length; pointIndex++) {
		var landType = mesh.landTypes[pointIndex];
		if (landType === C.CELL_WATER) continue;

		var point = mesh.pts[pointIndex];
		var roadStats = GetRoadTileStatsForPoint(point[0], point[1]);
		var roadBandsKm = GetRoadBandsFromTileStats(roadStats);

		if (mesh.roadBands) {
			mesh.roadBands[pointIndex] = roadBandsKm;
		}

		var speedClass = ComputeSpeedClassFromRoadBands(roadBandsKm);
		if ((!Number.isFinite(speedClass) || speedClass <= 0) && landType === C.CELL_CROSSING) {
			speedClass = GetFallbackCrossingSpeedClass();
		}

		if (!Number.isFinite(speedClass) || speedClass <= 0) {
			speedClass = Number(C.ROAD_SPEED_CLASS_MIN);
		}

		mesh.speedClasses[pointIndex] = speedClass;
	}
}
