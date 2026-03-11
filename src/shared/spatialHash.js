// spatialHash.js
// Shared deterministic hashing and spatial indexing helpers.
//TODO: store functions in a central helper database

function Hash01(indexValue, salt)
{
	var x = Math.sin((indexValue + (salt * C.DELAUNAY_JITTER_SALT_STEP) + C.DELAUNAY_JITTER_SEED) * C.DELAUNAY_JITTER_HASH_A) * C.DELAUNAY_JITTER_HASH_B;
	return x - Math.floor(x);
}

function BuildSpatialHash(pointsXy, cellSize)
{
	var map = new Map();
	for (var i = 0; i < pointsXy.length; i++) {
		var cx = Math.floor(pointsXy[i].x / cellSize);
		var cy = Math.floor(pointsXy[i].y / cellSize);
		var key = cx + ',' + cy;
		var bucket = map.get(key);
		if (!bucket) {
			bucket = [];
			map.set(key, bucket);
		}
		bucket.push(i);
	}
	return map;
}

function FindNearestIndex(spatialHash, pointsXy, cellSize, x, y)
{
	var cx = Math.floor(x / cellSize);
	var cy = Math.floor(y / cellSize);
	var bestIdx = -1;
	var bestDist = Infinity;
	for (var dy = -1; dy <= 1; dy++) {
		for (var dx = -1; dx <= 1; dx++) {
			var key = (cx + dx) + ',' + (cy + dy);
			var bucket = spatialHash.get(key);
			if (!bucket) continue;
			for (var k = 0; k < bucket.length; k++) {
				var idx = bucket[k];
				var dx2 = pointsXy[idx].x - x;
				var dy2 = pointsXy[idx].y - y;
				var d2 = dx2 * dx2 + dy2 * dy2;
				if (d2 < bestDist) {
					bestDist = d2;
					bestIdx = idx;
				}
			}
		}
	}
	return bestIdx;
}
