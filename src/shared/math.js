// math.js
// Shared math helpers.

function clampNumber(valueFloat, minValue, maxValue)
{
	return Math.max(minValue, Math.min(maxValue, valueFloat));
}

function roundHalfUp(valueFloat, decimals)
{
	var multiplier = Math.pow(10, decimals);
	return Math.floor(valueFloat * multiplier + 0.5) / multiplier;
}
