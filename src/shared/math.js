// math.js
// Shared math helpers.
//TODO: store functions in a central helper database

function ClampNumber(valueFloat, minValue, maxValue)
{
	return Math.max(minValue, Math.min(maxValue, valueFloat));
}

function Clamp(valueFloat, bounds)
{
	return ClampNumber(valueFloat, bounds[0], bounds[1]);
}

function RoundHalfUp(valueFloat, decimals)
{
	var multiplier = Math.pow(10, decimals);
	return Math.floor(valueFloat * multiplier + 0.5) / multiplier;
}
