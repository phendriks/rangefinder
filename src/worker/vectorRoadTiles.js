// vectorRoadTiles.js
// Loads a bounded set of OpenFreeMap MVT tiles and builds an optional fast-road graph.

var vectorRoadMetadataPromise = null;
var vectorRoadDecoderPromise = null;
var vectorRoadTileCache = new Map();

function getVectorRoadBounds(clat, clng, maxKm)
{
	var radiusKm = maxKm * (1 + C.GRID_MARGIN_FACTOR);
	var latDelta = radiusKm / C.KM_PER_DEG_LAT;
	var cosLat = Math.max(0.05, Math.abs(Math.cos(clat * Math.PI / 180)));
	var lngDelta = radiusKm / (C.KM_PER_DEG_LAT * cosLat);
	return {
		minLat: clampNumber(clat - latDelta, -85.05112878, 85.05112878),
		maxLat: clampNumber(clat + latDelta, -85.05112878, 85.05112878),
		minLng: clampNumber(clng - lngDelta, -180, 180),
		maxLng: clampNumber(clng + lngDelta, -180, 180)
	};
}

function lngToVectorTileX(lng, zoom)
{
	var count = Math.pow(2, zoom);
	return clampNumber(Math.floor(((lng + 180) / 360) * count), 0, count - 1);
}

function latToVectorTileY(lat, zoom)
{
	var count = Math.pow(2, zoom);
	var radians = clampNumber(lat, -85.05112878, 85.05112878) * Math.PI / 180;
	var value = (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) * 0.5;
	return clampNumber(Math.floor(value * count), 0, count - 1);
}

function enumerateVectorRoadTiles(bounds, zoom)
{
	var minX = lngToVectorTileX(bounds.minLng, zoom);
	var maxX = lngToVectorTileX(bounds.maxLng, zoom);
	var minY = latToVectorTileY(bounds.maxLat, zoom);
	var maxY = latToVectorTileY(bounds.minLat, zoom);
	var tiles = [];
	for (var y = minY; y <= maxY; y++) {
		for (var x = minX; x <= maxX; x++) tiles.push({ z: zoom, x: x, y: y });
	}
	return tiles;
}

function selectVectorRoadTiles(bounds, modeKey)
{
	var maxTiles = Math.max(1, Number(C.VECTOR_ROAD_MAX_TILES) || 200);
	var maxZoom = modeKey === 'cycle'
		? Math.max(C.VECTOR_ROAD_MAX_ZOOM, Number(C.VECTOR_ROAD_CYCLE_MAX_ZOOM) || C.VECTOR_ROAD_MAX_ZOOM)
		: C.VECTOR_ROAD_MAX_ZOOM;
	for (var zoom = maxZoom; zoom >= C.VECTOR_ROAD_MIN_ZOOM; zoom--) {
		var tiles = enumerateVectorRoadTiles(bounds, zoom);
		if (tiles.length <= maxTiles || zoom === C.VECTOR_ROAD_MIN_ZOOM) {
			return tiles.length <= maxTiles ? tiles : [];
		}
	}
	return [];
}

async function getVectorRoadMetadata()
{
	if (!vectorRoadMetadataPromise) {
		vectorRoadMetadataPromise = fetch(C.VECTOR_ROAD_TILEJSON_URL).then(function(response) {
			if (!response.ok) throw new Error('Vector-road TileJSON unavailable.');
			return response.json();
		}).then(function(tileJson) {
			if (!tileJson || !Array.isArray(tileJson.tiles) || !tileJson.tiles.length) {
				throw new Error('Vector-road TileJSON has no tile template.');
			}
			return tileJson;
		}).catch(function(error) {
			vectorRoadMetadataPromise = null;
			throw error;
		});
	}
	return vectorRoadMetadataPromise;
}

async function getVectorRoadDecoder()
{
	if (!vectorRoadDecoderPromise) {
		vectorRoadDecoderPromise = Promise.all([
			import(C.VECTOR_ROAD_PBF_MODULE_URL),
			import(C.VECTOR_ROAD_MVT_MODULE_URL)
		]).then(function(modules) {
			return {
				Pbf: modules[0].default || modules[0].Pbf,
				VectorTile: modules[1].VectorTile || modules[1].default
			};
		}).then(function(decoder) {
			if (!decoder.Pbf || !decoder.VectorTile) throw new Error('Vector-road decoder unavailable.');
			return decoder;
		}).catch(function(error) {
			vectorRoadDecoderPromise = null;
			throw error;
		});
	}
	return vectorRoadDecoderPromise;
}

function buildVectorRoadTileUrl(template, tile)
{
	return template.replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);
}

function fetchVectorRoadTile(url)
{
	if (vectorRoadTileCache.has(url)) return vectorRoadTileCache.get(url);
	var request = new Promise(function(resolve, reject) {
		var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		var timeoutId = setTimeout(function() {
			if (controller) controller.abort();
			reject(new Error('Vector-road tile timed out.'));
		}, C.VECTOR_ROAD_FETCH_TIMEOUT_MS);
		fetch(url, controller ? { signal: controller.signal } : undefined).then(function(response) {
			if (!response.ok) throw new Error('Vector-road tile request failed.');
			return response.arrayBuffer();
		}).then(resolve, reject).finally(function() { clearTimeout(timeoutId); });
	}).catch(function(error) {
		vectorRoadTileCache.delete(url);
		throw error;
	});
	vectorRoadTileCache.set(url, request);
	return request;
}

async function fetchVectorRoadTiles(tiles, template)
{
	var results = new Array(tiles.length);
	var nextIndex = 0;
	var deadline = Date.now() + Math.max(C.VECTOR_ROAD_FETCH_TIMEOUT_MS, C.VECTOR_ROAD_TOTAL_TIMEOUT_MS);
	var concurrency = Math.max(1, Math.min(16, Number(C.VECTOR_ROAD_FETCH_CONCURRENCY) || 8));
	async function worker() {
		while (true) {
			if (Date.now() >= deadline) return;
			var index = nextIndex++;
			if (index >= tiles.length) return;
			try {
				results[index] = await fetchVectorRoadTile(buildVectorRoadTileUrl(template, tiles[index]));
			} catch (error) {
				results[index] = null;
			}
		}
	}
	var workers = [];
	for (var i = 0; i < Math.min(concurrency, tiles.length); i++) workers.push(worker());
	await Promise.all(workers);
	return results;
}

function isVectorRoadAccessDenied(value)
{
	return value === false || value === 0 || value === '0' || value === 'no' || value === 'private';
}

function isVectorRoadAccessAllowed(value)
{
	return value === true || value === 1 || value === '1' || value === 'yes' ||
		value === 'designated' || value === 'permissive' || value === 'official';
}

function getCycleRoadProfile(properties)
{
	if (isVectorRoadAccessDenied(properties.bicycle) || properties.bicycle === 'dismount' ||
		properties.bicycle === 'use_sidepath') return null;
	if (isVectorRoadAccessDenied(properties.access) && !isVectorRoadAccessAllowed(properties.bicycle)) return null;
	var roadClass = properties.class;
	var roadSubclass = properties.subclass;
	var isExpressway = properties.expressway === 1 || properties.expressway === true || properties.expressway === '1';
	var isUnpaved = properties.surface === 'unpaved';
	if (roadClass === 'motorway' || roadClass === 'trunk' || isExpressway) return null;
	if (roadClass === 'primary') return { speed: 17, spacing: 5 };
	if (roadClass === 'secondary') return { speed: 17, spacing: 4 };
	if (roadClass === 'tertiary') return { speed: 16, spacing: 3 };
	var bicycleAllowed = isVectorRoadAccessAllowed(properties.bicycle);
	if (roadClass === 'minor') return bicycleAllowed ? { speed: 15, spacing: 2.5 } : null;
	if (roadClass === 'service') {
		if (properties.service === 'driveway' || properties.service === 'parking_aisle') return null;
		return bicycleAllowed ? { speed: 13, spacing: 2 } : null;
	}
	if (roadClass === 'track') {
		return bicycleAllowed || properties.official === 1 || properties.official === true
			? { speed: isUnpaved ? 10 : 13, spacing: 2 }
			: null;
	}
	if (roadClass === 'path') {
		if (roadSubclass === 'cycleway') return { speed: isUnpaved ? 13 : 18, spacing: 1.5 };
		if (bicycleAllowed && roadSubclass !== 'steps') return { speed: isUnpaved ? 10 : 14, spacing: 1.5 };
	}
	return null;
}

function getVectorRoadProfile(properties, modeKey)
{
	if (!properties) return null;
	if (modeKey === 'cycle') return getCycleRoadProfile(properties);
	if (isVectorRoadAccessDenied(properties.access)) return null;
	var roadClass = properties.class;
	var isRamp = properties.ramp === 1 || properties.ramp === true || properties.ramp === '1';
	var isExpressway = properties.expressway === 1 || properties.expressway === true || properties.expressway === '1';
	if (roadClass === 'motorway') {
		return { speed: isRamp ? 65 : 105, spacing: isRamp ? 3 : 8 };
	}
	if (roadClass === 'trunk') {
		return { speed: isRamp ? 60 : 90, spacing: isRamp ? 3 : 10 };
	}
	if (roadClass === 'primary' && isExpressway) {
		return { speed: 80, spacing: 10 };
	}
	return null;
}

function vectorTilePointToLatLng(point, tile, extent)
{
	var tileCount = Math.pow(2, tile.z);
	var worldX = (tile.x + point.x / extent) / tileCount;
	var worldY = (tile.y + point.y / extent) / tileCount;
	var lng = worldX * 360 - 180;
	var mercatorY = Math.PI * (1 - 2 * worldY);
	var lat = Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI;
	return [lat, lng];
}

function decodeVectorRoadLines(buffer, tile, decoder, modeKey)
{
	var vectorTile = new decoder.VectorTile(new decoder.Pbf(new Uint8Array(buffer)));
	var layer = vectorTile.layers && vectorTile.layers.transportation;
	var lines = [];
	if (!layer) return lines;
	for (var featureIndex = 0; featureIndex < layer.length; featureIndex++) {
		var feature = layer.feature(featureIndex);
		var profile = getVectorRoadProfile(feature.properties, modeKey);
		if (!profile || feature.type !== 2) continue;
		var geometry = feature.loadGeometry();
		var bridge = feature.properties.brunnel === 'bridge';
		for (var lineIndex = 0; lineIndex < geometry.length; lineIndex++) {
			var encodedLine = geometry[lineIndex];
			if (!encodedLine || encodedLine.length < 2) continue;
			var points = new Array(encodedLine.length);
			for (var pointIndex = 0; pointIndex < encodedLine.length; pointIndex++) {
				points[pointIndex] = vectorTilePointToLatLng(encodedLine[pointIndex], tile, feature.extent);
			}
			lines.push({ points: points, speed: profile.speed, spacing: profile.spacing, bridge: bridge });
		}
	}
	return lines;
}

function interpolateVectorRoadPoint(a, b, fraction)
{
	return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function sampleVectorRoadLine(points, spacingKm)
{
	var distances = [0];
	for (var i = 1; i < points.length; i++) distances.push(distances[i - 1] + haversineKm(points[i - 1], points[i]));
	var total = distances[distances.length - 1];
	if (!(total > spacingKm)) return [points[0], points[points.length - 1]];
	var sampled = [points[0]];
	var segment = 1;
	for (var target = spacingKm; target < total; target += spacingKm) {
		while (segment < distances.length && distances[segment] < target) segment++;
		if (segment >= points.length) break;
		var segmentLength = distances[segment] - distances[segment - 1];
		var fraction = segmentLength > 0 ? (target - distances[segment - 1]) / segmentLength : 0;
		sampled.push(interpolateVectorRoadPoint(points[segment - 1], points[segment], fraction));
	}
	sampled.push(points[points.length - 1]);
	return sampled;
}

function buildVectorRoadGraph(lines, spacingMultiplier)
{
	var nodes = [];
	var edges = [];
	var coordinateIndex = new Map();
	var edgeIndex = new Map();
	function getNodeIndex(point, bridge) {
		var latQ = Math.round(point[0] * 100000);
		var lngQ = Math.round(point[1] * 100000);
		var key = latQ + ',' + lngQ;
		var index = coordinateIndex.get(key);
		if (index === undefined) {
			index = nodes.length;
			coordinateIndex.set(key, index);
			nodes.push([latQ / 100000, lngQ / 100000, !!bridge]);
		} else if (bridge) {
			nodes[index][2] = true;
		}
		return index;
	}
	for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		var line = lines[lineIndex];
		var sampled = sampleVectorRoadLine(line.points, line.spacing * spacingMultiplier);
		for (var pointIndex = 1; pointIndex < sampled.length; pointIndex++) {
			var from = getNodeIndex(sampled[pointIndex - 1], line.bridge);
			var to = getNodeIndex(sampled[pointIndex], line.bridge);
			if (from === to) continue;
			var key = from < to ? from + ',' + to : to + ',' + from;
			var existing = edgeIndex.get(key);
			if (existing === undefined) {
				edgeIndex.set(key, edges.length);
				edges.push([from, to, line.speed]);
			} else if (line.speed > edges[existing][2]) {
				edges[existing][2] = line.speed;
			}
		}
	}
	return { nodes: nodes, edges: edges };
}

function limitVectorRoadGraph(lines)
{
	var maxNodes = Math.max(1, Number(C.VECTOR_ROAD_MAX_NODES) || 15000);
	var multiplier = 1;
	var graph = buildVectorRoadGraph(lines, multiplier);
	while (graph.nodes.length > maxNodes && multiplier < 64) {
		multiplier = Math.max(multiplier + 1, Math.ceil(graph.nodes.length / maxNodes));
		graph = buildVectorRoadGraph(lines, multiplier);
	}
	return graph.nodes.length <= maxNodes && graph.edges.length ? graph : null;
}

async function loadVectorRoadData(clat, clng, maxKm, modeKey)
{
	if (!C.USE_VECTOR_ROADS) return null;
	try {
		var bounds = getVectorRoadBounds(clat, clng, maxKm);
		var tiles = selectVectorRoadTiles(bounds, modeKey);
		if (!tiles.length) return null;
		var dependencies = await Promise.all([getVectorRoadMetadata(), getVectorRoadDecoder()]);
		var template = dependencies[0].tiles[0];
		var buffers = await fetchVectorRoadTiles(tiles, template);
		var lines = [];
		for (var i = 0; i < buffers.length; i++) {
			if (!buffers[i]) continue;
			try {
				lines.push.apply(lines, decodeVectorRoadLines(buffers[i], tiles[i], dependencies[1], modeKey));
			} catch (error) {
				// A malformed tile is non-fatal; the background mesh remains connected.
			}
		}
		return lines.length ? limitVectorRoadGraph(lines) : null;
	} catch (error) {
		return null;
	}
}
