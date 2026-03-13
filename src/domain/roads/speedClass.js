// speedClass.js
// Speed class scoring and road band mapping.
//TODO: store functions in a central helper database

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

	var fastKm = Number(roadBandsKm[0]) || 0;
	var mainKm = Number(roadBandsKm[1]) || 0;
	var midKm = Number(roadBandsKm[2]) || 0;
	var localKm = Number(roadBandsKm[3]) || 0;

	if (fastKm === 0) fastKm = 1;
	if (mainKm === 0) mainKm = 1;
	if (midKm === 0) midKm = 1;
	if (localKm === 0) localKm = 1;

	var det0 = C.SPEED_CLASS_DETERMINANTS[0] * C.SPEED_CLASS_GRID_SIZE;
	var det1 = C.SPEED_CLASS_DETERMINANTS[1] * C.SPEED_CLASS_GRID_SIZE;
	var det2 = C.SPEED_CLASS_DETERMINANTS[2] * C.SPEED_CLASS_GRID_SIZE;
	var det3 = C.SPEED_CLASS_DETERMINANTS[3] * C.SPEED_CLASS_GRID_SIZE;

	var baseSpeedClass = 0;
	if (fastKm >= det0) {
		baseSpeedClass = 5;
	} else if (fastKm >= det1 || mainKm >= det0) {
		baseSpeedClass = 4;
	} else if (fastKm >= det2 || mainKm >= det1) {
		baseSpeedClass = 3;
	} else if (fastKm >= det3 || mainKm >= det2 || midKm >= det0) {
		baseSpeedClass = 2;
	} else if (fastKm >= det3 || mainKm >= det3 || midKm >= det1) {
		baseSpeedClass = 1;
	}

	var weightedSum =
		(fastKm * C.SPEED_CLASS_WEIGHTS[0]) +
		(mainKm * C.SPEED_CLASS_WEIGHTS[1]) +
		(midKm * C.SPEED_CLASS_WEIGHTS[2]) +
		(localKm * C.SPEED_CLASS_WEIGHTS[3]);
	var densityScore = Math.sqrt(weightedSum);

	var minBand = Math.min(fastKm, mainKm, midKm, localKm);
	var maxBand = Math.max(fastKm, mainKm, midKm, localKm);
	var balanceScore = minBand / maxBand;

	var bandRatioScore = (
		C.SPEED_CLASS_WEIGHTS[0] * (fastKm / mainKm) +
		C.SPEED_CLASS_WEIGHTS[1] * (mainKm / midKm) +
		C.SPEED_CLASS_WEIGHTS[2] * (midKm / localKm)
	);

	var reachScore = Math.sqrt(midKm + localKm);

	var speedClassScored = (
		baseSpeedClass +
		0.2 * densityScore +
		2 * balanceScore +
		0.15 * bandRatioScore +
		0.2 * reachScore
	);

	return RoundHalfUp(0.1 * Clamp(speedClassScored, [0, 10]), 2);
}
