// speedClass.js
// Speed class scoring and road band mapping.

const SPEED_CLASS_WEIGHTS = [1.0, 0.8, 0.3];
const SPEED_CLASS_THRESHOLDS = [150, 125, 100, 75];
const ROAD_SPEED_WEIGHTS = [1.1, 0.6, 0.3, 0.1];
const ROAD_CAP_HALF = 300;
const ROAD_DENSITY_WEIGHT = 0.35;
const ROAD_FAST_SHARE_WEIGHT = 0.25;
const ROAD_VARIATION_STRENGTH = 0.75;
const ROAD_SPEED_CLASS_MIN_DEFAULT = 0.02;
const ROAD_SPEED_CLASS_MAX_DEFAULT = 1.0;
const CROSSING_SPEED_CLASS_DEFAULT = 0.85;
const SPEED_CLASS_DECIMALS = 2;
const SPEED_CLASS_SIGNAL_BASE = 1.5;
const BASE_TIER_MAX = 5;
const BASE_TIER_WEIGHT = 0.40;
const BALANCE_SIGNAL_WEIGHT = 0.25;
const BAND_RATIO_SIGNAL_WEIGHT = 0.20;
const REACH_SIGNAL_WEIGHT = 0.15;
const VARIATION_CENTER = 0.5;
const ROAD_TILE_SIZE_DEG_DEFAULT = 0.5;
const ROAD_BACKBONE_COVERAGE_TARGET = 120;
const ROAD_BACKBONE_PENALTY_WEIGHT = 0.08;
const ROAD_LOCAL_SHARE_PENALTY_WEIGHT = 0.05;
const ROAD_DENSITY_PENALTY_WEIGHT = 0.03;
const TERRAIN_NORMAL_LABEL = 'normal';
const TERRAIN_ROUGH_LABEL = 'rough';
const TERRAIN_HARSH_LABEL = 'harsh';
const TERRAIN_EXTREME_LABEL = 'extreme';
const TERRAIN_DEFAULT_BAND = { min: 0.55, max: 1.00 };

function getRoadBandsFromTileStats(stats)
{
	if (!stats) return null;

	var fastKm = Number(stats.fast) || 0;
	var mainKm = Number(stats.main) || 0;
	var midKm = Number(stats.mid) || 0;
	var localKm = Number(stats.local) || 0;

	return [fastKm, mainKm, midKm, localKm];
}

function getSpeedClassBounds()
{
	var minValue = Number(C.ROAD_SPEED_CLASS_MIN);
	var maxValue = Number(C.ROAD_SPEED_CLASS_MAX);
	if (!Number.isFinite(minValue)) minValue = ROAD_SPEED_CLASS_MIN_DEFAULT;
	if (!Number.isFinite(maxValue)) maxValue = ROAD_SPEED_CLASS_MAX_DEFAULT;
	if (maxValue < minValue) maxValue = minValue;
	return { minValue: minValue, maxValue: maxValue };
}

function clampSpeedClass(valueFloat)
{
	var bounds = getSpeedClassBounds();
	return clampNumber(valueFloat, bounds.minValue, bounds.maxValue);
}

function getFallbackCrossingSpeedClass()
{
	var crossingSpeedClass = Number(C.CROSSING_SPEED_CLASS);
	if (!Number.isFinite(crossingSpeedClass) || crossingSpeedClass <= 0) {
		crossingSpeedClass = CROSSING_SPEED_CLASS_DEFAULT;
	}
	return clampSpeedClass(crossingSpeedClass);
}

function getSpeedClassThresholdScale()
{
	if (typeof getRoadTileSizeDeg === 'function') {
		var tileSizeDeg = Number(getRoadTileSizeDeg());
		if (Number.isFinite(tileSizeDeg) && tileSizeDeg > 0) return tileSizeDeg;
	}
	return ROAD_TILE_SIZE_DEG_DEFAULT;
}

function getTerrainSpeedClassBand(terrainSeverity)
{
	var terrainBands = C && C.TERRAIN_SPEED_CLASS_BANDS;
	var terrainBand = terrainBands ? terrainBands[terrainSeverity] : null;
	if (!terrainBand) terrainBand = TERRAIN_DEFAULT_BAND;

	var minValue = Number(terrainBand.min);
	var maxValue = Number(terrainBand.max);
	if (!Number.isFinite(minValue)) minValue = TERRAIN_DEFAULT_BAND.min;
	if (!Number.isFinite(maxValue)) maxValue = TERRAIN_DEFAULT_BAND.max;
	if (maxValue < minValue) maxValue = minValue;

	var bounds = getSpeedClassBounds();
	return {
		minValue: clampNumber(minValue, bounds.minValue, bounds.maxValue),
		maxValue: clampNumber(maxValue, bounds.minValue, bounds.maxValue)
	};
}

function getTerrainSeverityLabel(terrainSeverity)
{
	if (terrainSeverity === C.TERRAIN_ROUGH) return TERRAIN_ROUGH_LABEL;
	if (terrainSeverity === C.TERRAIN_HARSH) return TERRAIN_HARSH_LABEL;
	if (terrainSeverity === C.TERRAIN_EXTREME) return TERRAIN_EXTREME_LABEL;
	return TERRAIN_NORMAL_LABEL;
}

function computeRawSpeedClassScore(roadBandsKm)
{
	if (!roadBandsKm || roadBandsKm.length < 4) return null;

	var fastKm = Math.max(0, Number(roadBandsKm[0]) || 0);
	var mainKm = Math.max(0, Number(roadBandsKm[1]) || 0);
	var midKm = Math.max(0, Number(roadBandsKm[2]) || 0);
	var localKm = Math.max(0, Number(roadBandsKm[3]) || 0);

	var capFast = fastKm * ROAD_SPEED_WEIGHTS[0];
	var capMain = mainKm * ROAD_SPEED_WEIGHTS[1];
	var capMid = midKm * ROAD_SPEED_WEIGHTS[2];
	var capLocal = localKm * ROAD_SPEED_WEIGHTS[3];
	var capTotal = capFast + capMain + capMid + capLocal;
	if (!Number.isFinite(capTotal) || capTotal < 0) return null;

	var densityFactor = capTotal / (capTotal + ROAD_CAP_HALF);
	var fastShare = capTotal > 0 ? (capFast + capMain) / capTotal : 0;
	var baseNormalized = clampNumber(
		(ROAD_DENSITY_WEIGHT * Math.sqrt(Math.max(0, densityFactor))) + (ROAD_FAST_SHARE_WEIGHT * fastShare),
		0,
		1
	);

	var fastDiv = Math.max(1, fastKm);
	var mainDiv = Math.max(1, mainKm);
	var midDiv = Math.max(1, midKm);
	var localDiv = Math.max(1, localKm);
	var thresholdScale = getSpeedClassThresholdScale();
	var det0 = SPEED_CLASS_THRESHOLDS[0] * thresholdScale;
	var det1 = SPEED_CLASS_THRESHOLDS[1] * thresholdScale;
	var det2 = SPEED_CLASS_THRESHOLDS[2] * thresholdScale;
	var det3 = SPEED_CLASS_THRESHOLDS[3] * thresholdScale;

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
		(SPEED_CLASS_WEIGHTS[0] * (fastDiv / mainDiv)) +
		(SPEED_CLASS_WEIGHTS[1] * (mainDiv / midDiv)) +
		(SPEED_CLASS_WEIGHTS[2] * (midDiv / localDiv))
	);
	bandRatioSignal = bandRatioSignal / (bandRatioSignal + SPEED_CLASS_SIGNAL_BASE);

	var reachSignal = Math.sqrt(midKm + localKm);
	reachSignal = reachSignal / (reachSignal + Math.sqrt(ROAD_CAP_HALF));

	var variationSignal =
		(BASE_TIER_WEIGHT * (baseTier / BASE_TIER_MAX)) +
		(BALANCE_SIGNAL_WEIGHT * balanceSignal) +
		(BAND_RATIO_SIGNAL_WEIGHT * bandRatioSignal) +
		(REACH_SIGNAL_WEIGHT * reachSignal);

	var centeredVariation = variationSignal - VARIATION_CENTER;
	var backboneCoverage = clampNumber((capFast + capMain) / ROAD_BACKBONE_COVERAGE_TARGET, 0, 1);
	var localShare = capTotal > 0 ? capLocal / capTotal : 1;
	var sparsityPenalty =
		(ROAD_BACKBONE_PENALTY_WEIGHT * (1 - backboneCoverage)) +
		(ROAD_LOCAL_SHARE_PENALTY_WEIGHT * localShare) +
		(ROAD_DENSITY_PENALTY_WEIGHT * (1 - densityFactor));

	return clampNumber(
		(baseNormalized * (1 + (ROAD_VARIATION_STRENGTH * centeredVariation))) - sparsityPenalty,
		0,
		1
	);
}

function computeSpeedClassFromRoadBands(roadBandsKm, terrainSeverity)
{
	var rawScore = computeRawSpeedClassScore(roadBandsKm);
	if (!Number.isFinite(rawScore)) return null;

	var terrainBand = getTerrainSpeedClassBand(terrainSeverity);
	var speedClass = terrainBand.minValue + ((terrainBand.maxValue - terrainBand.minValue) * rawScore);
	return roundHalfUp(clampSpeedClass(speedClass), SPEED_CLASS_DECIMALS);
}
