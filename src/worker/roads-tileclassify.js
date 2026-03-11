// roads-tileclassify.js
// Assign road tile metrics using offline per tile road summaries.

function AssignRoadEnums(mesh)
{
	if (!mesh) return;
	if (!mesh.pts || !mesh.landTypes) return;
	if (!mesh.densityFactors || !mesh.fastRatios) return;
	if (typeof GetRoadTileStats !== 'function') return;
	if (typeof GetRoadTileKeyFromLatLng !== 'function') return;

	for (var pointIndex = 0; pointIndex < mesh.pts.length; pointIndex++) {
		var landType = mesh.landTypes[pointIndex];
		if (landType === C.CELL_WATER) continue;

		var point = mesh.pts[pointIndex];
		var tileKey = GetRoadTileKeyFromLatLng(point[0], point[1]);
		var stats = GetRoadTileStats(tileKey);
		if (!stats) continue;

		var fastKm = Number(stats.fast) || 0;
		var mainKm = Number(stats.main) || 0;
		var midKm = Number(stats.mid) || 0;
		var localKm = Number(stats.local) || 0;

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
