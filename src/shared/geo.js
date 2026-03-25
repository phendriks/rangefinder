// geo.js
// Shared geographic helpers.

function haversineKm(a, b) {
	var lat1 = a[0] * Math.PI / 180;
	var lat2 = b[0] * Math.PI / 180;
	var dLat = (b[0] - a[0]) * Math.PI / 180;
	var dLng = (b[1] - a[1]) * Math.PI / 180;
	var sinLat = Math.sin(dLat / 2);
	var sinLng = Math.sin(dLng / 2);
	var h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
	var c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
	return C.EARTH_RADIUS_KM * c;
}

function findClosestIndex(pts, lat, lng) {
	var best = -1;
	var bestDist = Infinity;
	for (var i = 0; i < pts.length; i++) {
		var d = haversineKm([lat, lng], pts[i]);
		if (d < bestDist) { bestDist = d; best = i; }
	}
	return best;
}

function findClosestNonWaterIndex(pts, cellTypes, lat, lng) {
	var best = -1;
	var bestDist = Infinity;
	for (var i = 0; i < pts.length; i++) {
		if (cellTypes[i] === C.CELL_WATER) continue;
		var d = haversineKm([lat, lng], pts[i]);
		if (d < bestDist) { bestDist = d; best = i; }
	}
	return best;
}
