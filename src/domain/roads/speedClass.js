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

function ClampSpeedClass(valueFloat)
{
	var minValue = Number(C.ROAD_SPEED_CLASS_MIN);
	var maxValue = Number(C.ROAD_SPEED_CLASS_MAX);
	if (!Number.isFinite(minValue)) minValue = 0.55;
	if (!Number.isFinite(maxValue)) maxValue = 1.0;
	if (maxValue < minValue) maxValue = minValue;
	return ClampNumber(valueFloat, minValue, maxValue);
}

function GetFallbackCrossingSpeedClass()
{
	var crossingSpeedClass = Number(C.CROSSING_SPEED_CLASS);
	if (!Number.isFinite(crossingSpeedClass) || crossingSpeedClass <= 0) {
		crossingSpeedClass = 0.85;
	}
	return ClampSpeedClass(crossingSpeedClass);
}

function ComputeSpeedClassFromRoadBands(roadBandsKm)
{
	if (!roadBandsKm || roadBandsKm.length < 4) return null;

	var fastKm = Math.max(0, Number(roadBandsKm[0]) || 0);
	var mainKm = Math.max(0, Number(roadBandsKm[1]) || 0);
	var midKm = Math.max(0, Number(roadBandsKm[2]) || 0);
	var localKm = Math.max(0, Number(roadBandsKm[3]) || 0);

	var minValue = Number(C.ROAD_SPEED_CLASS_MIN);
	var maxValue = Number(C.ROAD_SPEED_CLASS_MAX);
	if (!Number.isFinite(minValue)) minValue = 0.55;
	if (!Number.isFinite(maxValue)) maxValue = 1.0;
	if (maxValue < minValue) maxValue = minValue;
	var speedBand = Math.max(0, maxValue - minValue);
	if (!(speedBand > 0)) return RoundHalfUp(minValue, 2);

	var capFast = fastKm * C.ROAD_SPEED_WEIGHT[0];
	var capMain = mainKm * C.ROAD_SPEED_WEIGHT[1];
	var capMid = midKm * C.ROAD_SPEED_WEIGHT[2];
	var capLocal = localKm * C.ROAD_SPEED_WEIGHT[3];
	var capTotal = capFast + capMain + capMid + capLocal;
	if (!Number.isFinite(capTotal) || capTotal < 0) return null;

	var capHalf = Number(C.ROAD_CAP_HALF);
	if (!Number.isFinite(capHalf) || capHalf <= 0) capHalf = 300;

	// Main travel signal: road capacity plus how much of it is fast/main road.
	var densityFactor = capTotal / (capTotal + capHalf);
	var fastShare = capTotal > 0 ? (capFast + capMain) / capTotal : 0;
	var densityWeight = Number(C.ROAD_CALIBRATED_DENSITY_WEIGHT);
	if (!Number.isFinite(densityWeight)) densityWeight = 0.35;
	var fastShareWeight = Number(C.ROAD_CALIBRATED_FAST_SHARE_WEIGHT);
	if (!Number.isFinite(fastShareWeight)) fastShareWeight = 0.15;
	var baseNormalized = ClampNumber(
		((densityWeight * Math.sqrt(Math.max(0, densityFactor))) + (fastShareWeight * fastShare)) / speedBand,
		0,
		1
	);

	// Legacy-inspired shape signal folded into the same score instead of computing a second speedClass.
	var fastDiv = Math.max(1, fastKm);
	var mainDiv = Math.max(1, mainKm);
	var midDiv = Math.max(1, midKm);
	var localDiv = Math.max(1, localKm);

	var det0 = C.SPEED_CLASS_DETERMINANTS[0] * C.GRID_SIZE;
	var det1 = C.SPEED_CLASS_DETERMINANTS[1] * C.GRID_SIZE;
	var det2 = C.SPEED_CLASS_DETERMINANTS[2] * C.GRID_SIZE;
	var det3 = C.SPEED_CLASS_DETERMINANTS[3] * C.GRID_SIZE;

	var baseTier = 0;
	if (fastKm >= det0) {
		baseTier = 5;
	} else if (fastKm >= det1 || mainKm >= det0) {
		baseTier = 4;
	} else if (fastKm >= det2 || mainKm >= det1) {
		baseTier = 3;
	} else if (fastKm >= det3 || mainKm >= det2 || midKm >= det0) {
		baseTier = 2;
	} else if (fastKm >= det3 || mainKm >= det3 || midKm >= det1) {
		baseTier = 1;
	}

	var minBand = Math.min(fastDiv, mainDiv, midDiv, localDiv);
	var maxBand = Math.max(fastDiv, mainDiv, midDiv, localDiv);
	var balanceSignal = minBand / maxBand;

	var bandRatioSignal = (
		(C.SPEED_CLASS_WEIGHTS[0] * (fastDiv / mainDiv)) +
		(C.SPEED_CLASS_WEIGHTS[1] * (mainDiv / midDiv)) +
		(C.SPEED_CLASS_WEIGHTS[2] * (midDiv / localDiv))
	);
	bandRatioSignal = bandRatioSignal / (bandRatioSignal + 1.5);

	var reachSignal = Math.sqrt(midKm + localKm);
	var reachHalf = Math.sqrt(capHalf);
	reachSignal = reachSignal / (reachSignal + reachHalf);

	var variationSignal =
		(0.40 * (baseTier / 5)) +
		(0.25 * balanceSignal) +
		(0.20 * bandRatioSignal) +
		(0.15 * reachSignal);

	var variationStrength = Number(C.ROAD_VARIATION_STRENGTH);
	if (!Number.isFinite(variationStrength) || variationStrength < 0) variationStrength = 0.4;
	var centeredVariation = variationSignal - 0.5;
	var finalNormalized = ClampNumber(
		baseNormalized * (1 + (variationStrength * centeredVariation)),
		0,
		1
	);

	var speedClass = minValue + (speedBand * finalNormalized);
	return RoundHalfUp(ClampSpeedClass(speedClass), 2);
}
