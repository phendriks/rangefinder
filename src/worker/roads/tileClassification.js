// tileClassification.js
// Assign road tile metrics using offline per tile road summaries.

//TODO: store functions in a central helper database

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

	}
}
