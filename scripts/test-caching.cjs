// Run with Node: node scripts/test-caching.cjs. No packages or network needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function context(files, globals = {}) {
	const ctx = vm.createContext({ console, setTimeout, clearTimeout, AbortController, ...globals });
	ctx.self = ctx;
	for (const file of files) {
		vm.runInContext(fs.readFileSync(path.join(root, 'src', file + '.js'), 'utf8'), ctx, { filename: file });
	}
	return ctx;
}
const json = value => JSON.stringify(value);
const evaluate = (ctx, code) => vm.runInContext(code, ctx);
const waitFor = async predicate => {
	const deadline = Date.now() + 2000;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, 'Timed out waiting for worker');
		await new Promise(resolve => setTimeout(resolve, 2));
	}
};

async function main() {
	const cache = context(['shared/lruCache']);
	evaluate(cache, `
		const lru = new LruCache(2, 10);
		lru.set('a', 1, 4); lru.set('b', 2, 4); lru.get('a'); lru.set('c', 3, 4);
	`);
	assert.equal(evaluate(cache, "lru.get('b')"), undefined);
	assert.equal(evaluate(cache, "lru.get('a')"), 1);
	evaluate(cache, "lru.set('a', 4, 7)");
	assert.equal(evaluate(cache, "lru.get('c')"), undefined);
	assert.equal(evaluate(cache, 'lru.bytes'), 7);
	evaluate(cache, "lru.set('oversized', 5, 11)");
	assert.equal(evaluate(cache, "lru.get('oversized')"), undefined);
	evaluate(cache, 'lru.clear()');
	assert.equal(evaluate(cache, 'lru.bytes'), 0);

	const calls = [];
	let failNext = false;
	const roads = context(['config/base-constants', 'config/travel-constants', 'config/shape-constants',
		'shared/lruCache', 'shared/math', 'shared/geo', 'worker/vectorRoadTiles'], {
		fetch: async (url, options) => {
			calls.push(url);
			if (failNext) { failNext = false; throw new Error('offline'); }
			if (options?.signal?.aborted) throw new Error('aborted');
			return { ok: true, arrayBuffer: async () => new Uint8Array([url.length]).buffer };
		}
	});
	evaluate(roads, `
		function originalSelect(bounds, mode) {
			const maxZoom = mode === 'cycle' ? C.VECTOR_ROAD_CYCLE_MAX_ZOOM : C.VECTOR_ROAD_MAX_ZOOM;
			for (let z = maxZoom; z >= C.VECTOR_ROAD_MIN_ZOOM; z--) {
				const tiles = enumerateVectorRoadTiles(bounds, z);
				if (tiles.length <= C.VECTOR_ROAD_MAX_TILES || z === C.VECTOR_ROAD_MIN_ZOOM) {
					return tiles.length <= C.VECTOR_ROAD_MAX_TILES ? tiles : [];
				}
			}
			return [];
		}
	`);
	for (const [lat, lng] of [[52.37, 4.9], [40.71, -74.01], [30.04, 31.24], [-33.86, 151.21], [0, 179.9], [84, 10]]) {
		for (const mode of ['drive', 'cycle']) for (const km of [8, 120, 320]) {
			roads.input = { lat, lng, mode, km };
			assert.equal(evaluate(roads, `(() => {
				const b = getVectorRoadBounds(input.lat, input.lng, input.km);
				return JSON.stringify(selectVectorRoadTiles(b, input.mode)) === JSON.stringify(originalSelect(b, input.mode));
			})()`), true);
		}
	}
	// Large ranges are counted without allocating millions of rejected tiles.
	assert.equal(evaluate(roads, "selectVectorRoadTiles(getVectorRoadBounds(52.37,4.9,4166.67),'cycle').length"), 64);
	await Promise.all([evaluate(roads, "fetchVectorRoadTile('same')"), evaluate(roads, "fetchVectorRoadTile('same')")]);
	assert.equal(calls.filter(url => url === 'same').length, 1);
	await evaluate(roads, "fetchVectorRoadTile('same')");
	assert.equal(calls.filter(url => url === 'same').length, 1);
	failNext = true;
	await assert.rejects(evaluate(roads, "fetchVectorRoadTile('retry')"));
	await evaluate(roads, "fetchVectorRoadTile('retry')");
	assert.equal(calls.filter(url => url === 'retry').length, 2);
	const tiles = [{ z: 3, x: 0, y: 0 }, { z: 3, x: 4, y: 4 }, { z: 3, x: 4, y: 5 }];
	roads.tiles = tiles;
	calls.length = 0;
	const buffers = await evaluate(roads, "fetchVectorRoadTiles(tiles,'/{z}/{x}/{y}',{clat:0,clng:0})");
	assert.equal(calls[0], '/3/4/4');
	assert.equal(buffers.length, 3);
	for (let i = 0; i < buffers.length; i++) assert.equal(new Uint8Array(buffers[i])[0], `/3/${tiles[i].x}/${tiles[i].y}`.length);
	// Decoded data remains usable even if its original raw buffer was evicted.
	evaluate(roads, `
		decodeCalls = 0;
		getVectorRoadMetadata = async () => ({tiles:['/{z}/{x}/{y}']});
		getVectorRoadDecoder = async () => ({});
		decodeVectorRoadLines = (buffer, tile) => {
			decodeCalls++;
			return [{points:[[52 + tile.y/100,4 + tile.x/100],[52 + tile.y/100 + .01,4 + tile.x/100 + .01]],speed:105,spacing:8,bridge:false}];
		};
	`);
	const firstGraph = await evaluate(roads, "loadVectorRoadData(52.37,4.9,120,'drive')");
	const downloads = calls.length;
	const decodes = evaluate(roads, 'decodeCalls');
	evaluate(roads, 'vectorRoadTileCache.clear()');
	assert.equal(json(await evaluate(roads, "loadVectorRoadData(52.37,4.9,120,'drive')")), json(firstGraph));
	assert.equal(calls.length, downloads);
	assert.equal(evaluate(roads, 'decodeCalls'), decodes);
	evaluate(roads, 'configureVectorRoadCache(true)');
	calls.length = 0;
	const partial = await evaluate(roads, "loadVectorRoadData(52.37,4.9,120,'cycle',{background:true})");
	assert.equal(partial.preloadOnly, true);
	assert.equal(calls.length, 24);
	const allTiles = evaluate(roads, "selectVectorRoadTiles(getVectorRoadBounds(52.37,4.9,120),'cycle').length");
	await evaluate(roads, "loadVectorRoadData(52.37,4.9,120,'cycle')");
	assert.equal(calls.length, allTiles);
	assert.ok(evaluate(roads, 'vectorRoadTileCache.bytes <= C.VECTOR_ROAD_MOBILE_CACHE_BYTES'));
	assert.ok(evaluate(roads, 'vectorRoadDecodedCache.bytes <= C.VECTOR_ROAD_MOBILE_DECODE_BYTES'));
	// Show can arrive after the mobile download cap, while tiles are decoding.
	evaluate(roads, `
		configureVectorRoadCache(true);
		promoted = false;
		const previousDecode = decodeVectorRoadLines;
		decodeVectorRoadLines = (...args) => { promoted = true; return previousDecode(...args); };
	`);
	calls.length = 0;
	const promotedGraph = await evaluate(roads, "loadVectorRoadData(52.37,4.9,120,'cycle',{background:true,isForeground:()=>promoted})");
	assert.equal(promotedGraph.cacheable, true);
	assert.equal(calls.length, allTiles);

	const messages = [];
	const jobs = context(['config/base-constants', 'shared/lruCache', 'worker/calculationJobs'], {
		postMessage: message => messages.push(message),
		ensureLandLoaded: async () => {},
		configureVectorRoadCache: () => {},
		loadVectorRoadData: async () => ({ nodes: [], edges: [], cacheable: true }),
		buildSitesMesh: () => ({ pts: [[52, 4]], landTypes: [1], cellTypes: [1], speedClasses: [.8], roadBands: [[1, 2, 3, 4]], terrainSeverities: [0] }),
		computeDistanceField: () => [0],
		computeIsoPolygonSites: (mesh, costs, km) => ({ ring: [[0, 0], [km, 0], [km, km], [0, 0]], geo: { km } })
	});
	const request = { clat: 52, clng: 4, outerKm: 120, innerKm: 80, modeKey: 'drive' };
	const originalMeshBuilder = jobs.buildSitesMesh;
	const send = (type, id, changes = {}) => jobs.handleRangeWorkerMessage({ data: { type, requestId: id, ...request, ...changes } });
	// Promote the existing preload while it waits for roads.
	let releaseRoads;
	let roadLoads = 0;
	jobs.loadVectorRoadData = () => { roadLoads++; return new Promise(resolve => { releaseRoads = resolve; }); };
	send('prepare', 1);
	await waitFor(() => releaseRoads);
	send('calculate', 2);
	releaseRoads({ nodes: [], edges: [], cacheable: true });
	await waitFor(() => messages.some(message => message.type === 'done'));
	assert.equal(roadLoads, 1);
	assert.ok(messages.every(message => message.requestId === 2));
	await waitFor(() => evaluate(jobs, 'activeRangeJob === null'));
	messages.length = 0;
	jobs.buildSitesMesh = () => { throw new Error('Cached requests must not rebuild'); };
	send('calculate', 3);
	await waitFor(() => messages.some(message => message.type === 'done'));
	assert.equal(roadLoads, 1);
	await waitFor(() => evaluate(jobs, 'activeRangeJob === null'));
	messages.length = 0;
	send('calculate', 4, { innerKm: 60 });
	await waitFor(() => messages.some(message => message.type === 'done'));
	assert.equal(roadLoads, 1);
	await waitFor(() => evaluate(jobs, 'activeRangeJob === null'));
	// Cancelled work cannot emit a stale result, even when its roads finish later.
	messages.length = 0;
	releaseRoads = null;
	send('calculate', 5, { clng: 5 });
	await waitFor(() => releaseRoads);
	jobs.handleRangeWorkerMessage({ data: { type: 'cancel' } });
	releaseRoads({ nodes: [], edges: [], cacheable: true });
	await waitFor(() => evaluate(jobs, 'activeRangeJob === null'));
	assert.ok(!messages.some(message => message.type === 'done' || message.type === 'error'));
	// Degraded results from failed road loading must not suppress future retries.
	messages.length = 0;
	evaluate(jobs, 'C.USE_VECTOR_ROADS = true; cachedRangeField = null; rangeResultCache.clear()');
	jobs.buildSitesMesh = originalMeshBuilder;
	let retryLoads = 0;
	jobs.loadVectorRoadData = async () => {
		retryLoads++;
		return retryLoads < 3 ? null : { nodes: [], edges: [], cacheable: true };
	};
	send('prepare', 6);
	await waitFor(() => retryLoads === 1 && evaluate(jobs, 'activeRangeJob === null'));
	assert.equal(messages.length, 0);
	send('calculate', 7);
	await waitFor(() => messages.some(message => message.type === 'done'));
	await waitFor(() => evaluate(jobs, 'activeRangeJob === null'));
	assert.equal(evaluate(jobs, 'cachedRangeField === null'), true);
	messages.length = 0;
	send('calculate', 8);
	await waitFor(() => messages.some(message => message.type === 'done'));
	assert.equal(retryLoads, 3);
	assert.equal(evaluate(jobs, 'cachedRangeField !== null'), true);
	console.log('Passed: bounded LRU, 108 tile-selection cases, near-first downloads, download sharing/retry, decoded reuse, mobile preload promotion, exact-request reuse, minimum-range reuse, and cancellation.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
