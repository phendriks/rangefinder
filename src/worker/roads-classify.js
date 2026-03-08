// roads-classify.js
// Assign motorway and speed enums using offline road hint tiles.

function AssignRoadEnums(mesh)
{
	if (!mesh) return;
	if (!mesh.pts || !mesh.landTypes || !mesh.roadTypes || !mesh.speedClasses) return;
	if (typeof GetRoadTilePoints !== 'function') return;

	var roadPoints = CollectRoadHintPoints(mesh.minLat, mesh.minLng, mesh.maxLat, mesh.maxLng);
	if (!roadPoints || !roadPoints.length) return;

	var hash = BuildRoadPointHash(roadPoints, mesh.clat);
	if (!hash) return;

	for (var pointIndex = 0; pointIndex < mesh.pts.length; pointIndex++) {
		var landType = mesh.landTypes[pointIndex];
		if (landType === C.CELL_WATER) continue;

		var point = mesh.pts[pointIndex];
		if (IsNearRoadHint(hash, point[0], point[1], mesh.clat)) {
			mesh.roadTypes[pointIndex] = C.ROAD_TYPE_MOTORWAY;
			mesh.speedClasses[pointIndex] = C.SPEED_CLASS_MAX;
		} else {
			mesh.roadTypes[pointIndex] = C.ROAD_TYPE_LOCAL;
			mesh.speedClasses[pointIndex] = C.SPEED_CLASS_AVERAGE;
		}
	}
}

function CollectRoadHintPoints(minLat, minLng, maxLat, maxLng)
{
	var tileSizeDeg = C.ROADS_TILE_SIZE_DEG;
	var startLat = Math.floor(minLat / tileSizeDeg) * tileSizeDeg;
	var endLat = Math.floor(maxLat / tileSizeDeg) * tileSizeDeg;
	var startLng = Math.floor(minLng / tileSizeDeg) * tileSizeDeg;
	var endLng = Math.floor(maxLng / tileSizeDeg) * tileSizeDeg;

	var points = [];
	for (var tileLat = startLat; tileLat <= endLat; tileLat += tileSizeDeg) {
		for (var tileLng = startLng; tileLng <= endLng; tileLng += tileSizeDeg) {
			var tileKey = tileLat + '_' + tileLng;
			var tilePoints = GetRoadTilePoints(tileKey);
			if (!tilePoints || !tilePoints.length) continue;

			for (var pointIndex = 0; pointIndex < tilePoints.length; pointIndex++) {
				var point = tilePoints[pointIndex];
				if (!point || point.length < 2) continue;
				var lat = point[0];
				var lng = point[1];
				if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
				points.push([lat, lng]);
			}
		}
	}
	return points;
}

function BuildRoadPointHash(points, refLat)
{
	if (!points || !points.length) return null;

	var hash = {
		cellKm: C.ROAD_PROXIMITY_RADIUS_KM * 2,
		cells: {}
	};
	var cellKm = hash.cellKm;
	if (!Number.isFinite(cellKm) || cellKm <= 0) return null;

	var cosLat = Math.cos(refLat * Math.PI / 180);
	if (!Number.isFinite(cosLat) || cosLat <= 0) cosLat = 1;

	var cellLatDeg = cellKm / C.KM_PER_DEG_LAT;
	var cellLngDeg = cellKm / (C.KM_PER_DEG_LAT * cosLat);

	for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
		var point = points[pointIndex];
		var key = HashCellKey(point[0], point[1], cellLatDeg, cellLngDeg);
		if (!hash.cells[key]) hash.cells[key] = [];
		hash.cells[key].push(point);
	}

	hash.cellLatDeg = cellLatDeg;
	hash.cellLngDeg = cellLngDeg;
	return hash;
}

function HashCellKey(lat, lng, cellLatDeg, cellLngDeg)
{
	var cellLat = Math.floor(lat / cellLatDeg);
	var cellLng = Math.floor(lng / cellLngDeg);
	return cellLat + '_' + cellLng;
}

function IsNearRoadHint(hash, lat, lng, refLat)
{
	var cellLatDeg = hash.cellLatDeg;
	var cellLngDeg = hash.cellLngDeg;
	var radiusKm = C.ROAD_PROXIMITY_RADIUS_KM;

	var baseCellLat = Math.floor(lat / cellLatDeg);
	var baseCellLng = Math.floor(lng / cellLngDeg);

	for (var deltaLat = -1; deltaLat <= 1; deltaLat++) {
		for (var deltaLng = -1; deltaLng <= 1; deltaLng++) {
			var key = (baseCellLat + deltaLat) + '_' + (baseCellLng + deltaLng);
			var candidates = hash.cells[key];
			if (!candidates) continue;

			for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
				var candidate = candidates[candidateIndex];
				if (HaversineKmSimple(lat, lng, candidate[0], candidate[1]) <= radiusKm) return true;
			}
		}
	}
	return false;
}

function HaversineKmSimple(latA, lngA, latB, lngB)
{
	var dLat = (latB - latA) * Math.PI / 180;
	var dLng = (lngB - lngA) * Math.PI / 180;
	var lat1 = latA * Math.PI / 180;
	var lat2 = latB * Math.PI / 180;

	var sinDLat = Math.sin(dLat / 2);
	var sinDLng = Math.sin(dLng / 2);
	var a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return C.EARTH_RADIUS_KM * c;
}
