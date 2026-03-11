// roads-tileclassify.js
// Assign road tile metrics using offline per tile road summaries.

//TODO: store functions in a central helper database


function RoundHalfUp(valueFloat, decimals)
{
	var multiplier = Math.pow(10, decimals);
	return Math.floor(valueFloat * multiplier + 0.5) / multiplier;
}

function Clamp(valueFloat, bounds)
{
	if (valueFloat < bounds[0]) return bounds[0];
	if (valueFloat > bounds[1]) return bounds[1];
	return valueFloat;
}

function GetRoadBandsFromTileStats(stats)
{
	if (!stats) return null;

	var fastKm = Number(stats.fast) || 0;
	var mainKm = Number(stats.main) || 0;
	var midKm = Number(stats.mid) || 0;
	var localKm = Number(stats.local) || 0;

	return [fastKm, mainKm, midKm, localKm];
}

function ComputeSpeedClassFromRoadBands(roadBandsKm)
{
	if (!roadBandsKm || roadBandsKm.length < 4) return null;

	var safeRoadBandsKm = [
		Number(roadBandsKm[0]) || 0,
		Number(roadBandsKm[1]) || 0,
		Number(roadBandsKm[2]) || 0,
		Number(roadBandsKm[3]) || 0
	];
	for (var bandIndex = 0; bandIndex < safeRoadBandsKm.length; bandIndex++) {
		if (safeRoadBandsKm[bandIndex] === 0) safeRoadBandsKm[bandIndex] = 1;
	}

	var determinants = C.SPEED_CLASS_DETERMINANTS.map(function(km) {
		return km * C.SPEED_CLASS_GRID_SIZE;
	});

	var rules = [
		{ score: 5, conditions: [{ index: 0, limit: determinants[0] }] },
		{ score: 4, conditions: [{ index: 0, limit: determinants[1] }, { index: 1, limit: determinants[0] }] },
		{ score: 3, conditions: [{ index: 0, limit: determinants[2] }, { index: 1, limit: determinants[1] }] },
		{ score: 2, conditions: [{ index: 0, limit: determinants[3] }, { index: 1, limit: determinants[2] }, { index: 2, limit: determinants[0] }] },
		{ score: 1, conditions: [{ index: 0, limit: determinants[3] }, { index: 1, limit: determinants[3] }, { index: 2, limit: determinants[1] }] }
	];

	var baseSpeedClass = 0;
	for (var ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
		var rule = rules[ruleIndex];
		var meetsAny = false;
		for (var conditionIndex = 0; conditionIndex < rule.conditions.length; conditionIndex++) {
			var condition = rule.conditions[conditionIndex];
			if (safeRoadBandsKm[condition.index] >= condition.limit) {
				meetsAny = true;
				break;
			}
		}
		if (meetsAny) {
			baseSpeedClass = rule.score;
			break;
		}
	}

	var weightedSum = 0;
	for (var weightIndex = 0; weightIndex < C.SPEED_CLASS_WEIGHTS.length; weightIndex++) {
		weightedSum += safeRoadBandsKm[weightIndex] * C.SPEED_CLASS_WEIGHTS[weightIndex];
	}
	var densityScore = Math.sqrt(weightedSum);

	var minBand = Math.min.apply(null, safeRoadBandsKm);
	var maxBand = Math.max.apply(null, safeRoadBandsKm);
	var balanceScore = minBand / maxBand;

	var bandRatioScore = (
		C.SPEED_CLASS_WEIGHTS[0] * (safeRoadBandsKm[0] / safeRoadBandsKm[1]) +
		C.SPEED_CLASS_WEIGHTS[1] * (safeRoadBandsKm[1] / safeRoadBandsKm[2]) +
		C.SPEED_CLASS_WEIGHTS[2] * (safeRoadBandsKm[2] / safeRoadBandsKm[3])
	);

	var reachScore = Math.sqrt(safeRoadBandsKm[2] + safeRoadBandsKm[3]);

	var speedClassScored = (
		baseSpeedClass +
		0.05 * densityScore +
		2.0 * balanceScore +
		0.1 * bandRatioScore +
		0.1 * reachScore
	);

	return RoundHalfUp(0.1 * Clamp(speedClassScored, [0, 10]), 2);
}

function AssignRoadEnums(mesh)
{
	if (!mesh) return;
	if (!mesh.pts || !mesh.landTypes) return;
	if (!mesh.speedClasses || !mesh.densityFactors || !mesh.fastRatios) return;
	if (typeof GetRoadTileStats !== 'function') return;
	if (typeof GetRoadTileKeyFromLatLng !== 'function') return;

	for (var pointIndex = 0; pointIndex < mesh.pts.length; pointIndex++) {
		var landType = mesh.landTypes[pointIndex];
		if (landType === C.CELL_WATER) continue;

		var point = mesh.pts[pointIndex];
		var tileKey = GetRoadTileKeyFromLatLng(point[0], point[1]);
		var stats = GetRoadTileStats(tileKey);
		if (!stats) continue;

		var roadBandsKm = GetRoadBandsFromTileStats(stats);
		if (!roadBandsKm) continue;

		if (mesh.roadBands) {
			mesh.roadBands[pointIndex] = roadBandsKm;
		}

		var speedClass = ComputeSpeedClassFromRoadBands(roadBandsKm);
		if (speedClass !== null && speedClass !== undefined) {
			mesh.speedClasses[pointIndex] = speedClass;
		}

		var fastKm = roadBandsKm[0];
		var mainKm = roadBandsKm[1];
		var midKm = roadBandsKm[2];
		var localKm = roadBandsKm[3];

		var capFast = fastKm * C.ROAD_SPEED_WEIGHT_FAST;
		var capMain = mainKm * C.ROAD_SPEED_WEIGHT_MAIN;
		var capMid = midKm * C.ROAD_SPEED_WEIGHT_MID;
		var capLocal = localKm * C.ROAD_SPEED_WEIGHT_LOCAL;
		var capTotal = capFast + capMain + capMid + capLocal;
		if (!Number.isFinite(capTotal) || capTotal <= 0) continue;

		var fastShare = capFast / capTotal;
		var densityFactor = capTotal / (capTotal + C.ROAD_CAP_HALF);
		var fastRatio = fastShare * densityFactor;

		mesh.densityFactors[pointIndex] = densityFactor;
		mesh.fastRatios[pointIndex] = fastRatio;
	}
}
