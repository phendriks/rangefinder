// roads.js
// Offline road summary tiles for Europe

C.ROADS_SOURCE = 'offline';

// Roads are stored as tiled summaries keyed by tile x and y.
// Tile key format: "<x>_<y>" using europe bbox and ROADS_TILE_SIZE_DEG.

// Each tile stores road length totals (km) by class:
// fast: motorway and trunk
// main: primary and secondary
// mid: tertiary
// local: residential

// Road totals are generated offline. For now we keep an entry for every
// europe tile so lookups are stable.

C.ROADS_TILES = {};

(function InitEuropeRoadTiles() {
	var tileSizeDeg = C.ROADS_TILE_SIZE_DEG;
	var tileCountX = Math.ceil((C.EUROPE_BBOX_MAX_LNG - C.EUROPE_BBOX_MIN_LNG) / tileSizeDeg);
	var tileCountY = Math.ceil((C.EUROPE_BBOX_MAX_LAT - C.EUROPE_BBOX_MIN_LAT) / tileSizeDeg);
	for (var tileX = 0; tileX < tileCountX; tileX++) {
		for (var tileY = 0; tileY < tileCountY; tileY++) {
			C.ROADS_TILES[tileX + '_' + tileY] = {
				fast: 0,
				main: 0,
				mid: 0,
				local: 0
			};
		}
	}
})();

function GetRoadTileKeyFromLatLng(lat, lng)
{
	var tileSizeDeg = C.ROADS_TILE_SIZE_DEG;
	var tileX = Math.floor((lng - C.EUROPE_BBOX_MIN_LNG) / tileSizeDeg);
	var tileY = Math.floor((lat - C.EUROPE_BBOX_MIN_LAT) / tileSizeDeg);
	return tileX + '_' + tileY;
}

function GetRoadTileStats(tileKey)
{
	return C.ROADS_TILES[tileKey] || null;
}
