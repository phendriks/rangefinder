// vectorRoadTiles.js
// Loads a bounded set of OpenFreeMap MVT tiles and builds an optional fast-road graph.

var vectorRoadMetadataPromise = null;
var vectorRoadDecoderPromise = null;
let vectorRoadTileCache = new LruCache(C.VECTOR_ROAD_CACHE_TILES, C.VECTOR_ROAD_CACHE_BYTES);
let vectorRoadDecodedCache = new LruCache(C.VECTOR_ROAD_CACHE_TILES, C.VECTOR_ROAD_DECODE_CACHE_BYTES);
const vectorRoadPendingTiles = new Map();
let vectorRoadLowMemory = false;

function configureVectorRoadCache(lowMemory) {
	vectorRoadLowMemory = lowMemory;
	const entries = lowMemory ? C.VECTOR_ROAD_MOBILE_CACHE_TILES : C.VECTOR_ROAD_CACHE_TILES;
	vectorRoadTileCache = new LruCache(entries, lowMemory ? C.VECTOR_ROAD_MOBILE_CACHE_BYTES : C.VECTOR_ROAD_CACHE_BYTES);
	vectorRoadDecodedCache = new LruCache(entries, lowMemory ? C.VECTOR_ROAD_MOBILE_DECODE_BYTES : C.VECTOR_ROAD_DECODE_CACHE_BYTES);
}

function withVectorRoadTimeout(promise) {
	let timeout;
	return Promise.race([
		promise,
		new Promise((resolve, reject) => {
			timeout = setTimeout(() => reject(new Error('Vector-road dependency timed out.')), C.VECTOR_ROAD_FETCH_TIMEOUT_MS);
		})
	]).finally(() => clearTimeout(timeout));
}

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
		var count = (lngToVectorTileX(bounds.maxLng, zoom) - lngToVectorTileX(bounds.minLng, zoom) + 1) *
			(latToVectorTileY(bounds.minLat, zoom) - latToVectorTileY(bounds.maxLat, zoom) + 1);
		if (count <= maxTiles || zoom === C.VECTOR_ROAD_MIN_ZOOM) {
			return count <= maxTiles ? enumerateVectorRoadTiles(bounds, zoom) : [];
		}
	}
	return [];
}

async function getVectorRoadMetadata()
{
	if (!vectorRoadMetadataPromise) {
		vectorRoadMetadataPromise = withVectorRoadTimeout(fetch(C.VECTOR_ROAD_TILEJSON_URL)).then(function(response) {
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
		vectorRoadDecoderPromise = withVectorRoadTimeout(Promise.all([
			import(C.VECTOR_ROAD_PBF_MODULE_URL),
			import(C.VECTOR_ROAD_MVT_MODULE_URL)
		])).then(function(modules) {
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

function fetchVectorRoadTile(url, signal)
{
	var cached = vectorRoadTileCache.get(url);
	if (cached !== undefined) return Promise.resolve(cached);
	var pending = vectorRoadPendingTiles.get(url);
	if (pending && !pending.signal?.aborted) return pending.promise;
	var request = new Promise(function(resolve, reject) {
		var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		function cancel() {
			if (controller) controller.abort();
			reject(new Error('Vector-road preload cancelled.'));
		}
		if (signal && signal.aborted) { cancel(); return; }
		if (signal) signal.addEventListener('abort', cancel, { once: true });
		var timeoutId = setTimeout(function() {
			if (controller) controller.abort();
			reject(new Error('Vector-road tile timed out.'));
		}, C.VECTOR_ROAD_FETCH_TIMEOUT_MS);
		fetch(url, controller ? { signal: controller.signal } : undefined).then(function(response) {
			if (!response.ok) throw new Error('Vector-road tile request failed.');
			return response.arrayBuffer();
		}).then(resolve, reject).finally(function() {
			clearTimeout(timeoutId);
			if (signal) signal.removeEventListener('abort', cancel);
		});
	}).then(function(buffer) {
		vectorRoadTileCache.set(url, buffer, buffer.byteLength);
		return buffer;
	}).finally(function() {
		if (vectorRoadPendingTiles.get(url)?.promise === request) vectorRoadPendingTiles.delete(url);
	});
	vectorRoadPendingTiles.set(url, { promise: request, signal: signal });
	return request;
}

async function fetchVectorRoadTiles(tiles, template, options = {})
{
	var results = new Array(tiles.length);
	// Fetch near the pin first, but keep results in their original tile order.
	// Changing decode order would change graph node IDs and mesh jitter.
	var order = tiles.map(function(tile, index) {
		var x = options.clng === undefined ? tile.x : lngToVectorTileX(options.clng, tile.z);
		var y = options.clat === undefined ? tile.y : latToVectorTileY(options.clat, tile.z);
		return { index: index, distance: (tile.x - x) ** 2 + (tile.y - y) ** 2 };
	}).sort(function(a, b) { return a.distance - b.distance || a.index - b.index; });
	var nextIndex = 0;
	var attemptedCount = 0;
	var deadline = Date.now() + Math.max(C.VECTOR_ROAD_FETCH_TIMEOUT_MS, C.VECTOR_ROAD_TOTAL_TIMEOUT_MS);
	var concurrency = Math.max(1, Math.min(16, Number(C.VECTOR_ROAD_FETCH_CONCURRENCY) || 8));
	if (vectorRoadLowMemory) concurrency = Math.min(concurrency, C.VECTOR_ROAD_MOBILE_CONCURRENCY);
	async function worker() {
		while (true) {
			if (Date.now() >= deadline || options.signal?.aborted) return;
			var next = nextIndex++;
			var limit = options.background && !options.isForeground?.()
				? (vectorRoadLowMemory ? C.VECTOR_ROAD_MOBILE_PRELOAD_TILES : C.VECTOR_ROAD_PRELOAD_TILES)
				: tiles.length;
			if (next >= Math.min(tiles.length, limit)) return;
			var index = order[next].index;
			attemptedCount++;
			try {
				var url = buildVectorRoadTileUrl(template, tiles[index]);
				var decoded = options.modeKey ? vectorRoadDecodedCache.get(url + '|' + options.modeKey) : undefined;
				results[index] = decoded === undefined
					? await fetchVectorRoadTile(url, options.signal)
					: { decoded: decoded };
			} catch (error) {
				results[index] = null;
			}
		}
	}
	var workers = [];
	for (var i = 0; i < Math.min(concurrency, tiles.length); i++) workers.push(worker());
	await Promise.all(workers);
	results.preloadOnly = attemptedCount < tiles.length && options.background;
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

async function loadVectorRoadData(clat, clng, maxKm, modeKey, options = {})
{
	if (!C.USE_VECTOR_ROADS) return null;
	try {
		var bounds = getVectorRoadBounds(clat, clng, maxKm);
		var tiles = selectVectorRoadTiles(bounds, modeKey);
		if (!tiles.length) return { nodes: [], edges: [], cacheable: true };
		var dependencies = await Promise.all([getVectorRoadMetadata(), getVectorRoadDecoder()]);
		if (options.signal?.aborted) return null;
		var template = dependencies[0].tiles[0];
		options.clat = clat;
		options.clng = clng;
		options.modeKey = modeKey;
		var buffers = await fetchVectorRoadTiles(tiles, template, options);
		// A foreground click may arrive as a bounded mobile preload finishes.
		if (buffers.preloadOnly && options.isForeground?.() && !options.signal?.aborted) {
			buffers = await fetchVectorRoadTiles(tiles, template, { ...options, background: false });
		}
		var lines = [];
		var cacheable = !buffers.preloadOnly;
		for (var i = 0; i < buffers.length; i++) {
			if (options.signal?.aborted) return null;
			if (!buffers[i]) { cacheable = false; continue; }
			try {
				var decodeKey = buildVectorRoadTileUrl(template, tiles[i]) + '|' + modeKey;
				var decoded = buffers[i].decoded || vectorRoadDecodedCache.get(decodeKey);
				if (decoded === undefined) {
					decoded = decodeVectorRoadLines(buffers[i], tiles[i], dependencies[1], modeKey);
					var bytes = decoded.reduce(function(total, line) { return total + 128 + line.points.length * 64; }, 0);
					vectorRoadDecodedCache.set(decodeKey, decoded, bytes);
				}
				// Avoid apply's argument limit on dense cycle tiles.
				for (var lineIndex = 0; lineIndex < decoded.length; lineIndex++) lines.push(decoded[lineIndex]);
			} catch (error) {
				cacheable = false;
				// A malformed tile is non-fatal; the background mesh remains connected.
			}
			if (i % 8 === 7) await new Promise(function(resolve) { setTimeout(resolve, 0); });
		}
		if (buffers.preloadOnly) {
			// Promotion can also arrive during a decode yield, after the first
			// promotion check. Finish the missing tiles before resolving Show.
			if (options.isForeground?.() && !options.signal?.aborted) {
				return loadVectorRoadData(clat, clng, maxKm, modeKey, { ...options, background: false });
			}
			return { preloadOnly: true };
		}
		if (options.signal?.aborted) return null;
		var graph = lines.length ? limitVectorRoadGraph(lines) : null;
		return { nodes: graph ? graph.nodes : [], edges: graph ? graph.edges : [], cacheable: cacheable };
	} catch (error) {
		return null;
	}
}
