// roads.js
// Offline motorway and trunk hint points for Europe

C.ROADS_SOURCE = 'offline';

// Roads are stored as tiled point lists keyed by tile origin.
// Tile key format: "<lat>_<lng>" using integer degrees.

// Placeholder tileset.
// Tiles will be generated offline and written into this file later.
C.ROADS_TILES = {};

function GetRoadTileKey(lat, lng)
{
	var tileLat = Math.floor(lat / C.ROADS_TILE_SIZE_DEG) * C.ROADS_TILE_SIZE_DEG;
	var tileLng = Math.floor(lng / C.ROADS_TILE_SIZE_DEG) * C.ROADS_TILE_SIZE_DEG;
	return tileLat + '_' + tileLng;
}

function GetRoadTilePoints(tileKey)
{
	return C.ROADS_TILES[tileKey] || null;
}
