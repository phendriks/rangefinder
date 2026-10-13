// One active job and one latest pending job. Background jobs can be promoted
// to foreground without restarting downloads or rebuilding an identical mesh.
let activeRangeJob = null;
let pendingRangeJob = null;
let rangeCacheConfigured = false;
let cachedRangeField = null;
let rangeResultCache = new LruCache(C.RANGE_RESULT_CACHE_ENTRIES);

function rangeFieldKey(request) {
	return JSON.stringify([request.clat, request.clng, request.modeKey, request.outerKm]);
}

function rangeResultKey(request) {
	return rangeFieldKey(request) + '|' + request.innerKm;
}

function cancelRangeJob(job) {
	if (!job) return;
	job.controller.abort();
	job.resolveCancelled(null);
}

function configureRangeCaches(lowMemory) {
	if (rangeCacheConfigured) return;
	rangeCacheConfigured = true;
	configureVectorRoadCache(lowMemory);
	const entries = lowMemory ? C.NETWORK_TILE_MOBILE_CACHE_ENTRIES : C.NETWORK_TILE_CACHE_ENTRIES;
	networkTileRecordCache = new LruCache(entries);
	networkTileAssignmentCache = new LruCache(entries);
	rangeResultCache = new LruCache(lowMemory ? C.RANGE_RESULT_MOBILE_CACHE_ENTRIES : C.RANGE_RESULT_CACHE_ENTRIES);
}

function handleRangeWorkerMessage(event) {
	const data = event.data;
	if (data.type === 'warm') {
		configureRangeCaches(Boolean(data.lowMemory));
		ensureLandLoaded().catch(() => {});
		return;
	}
	if (data.type === 'cancel') {
		cancelRangeJob(activeRangeJob);
		pendingRangeJob = null;
		return;
	}
	const request = {
		clat: data.clat, clng: data.clng, outerKm: data.outerKm,
		innerKm: data.innerKm, modeKey: data.modeKey === 'cycle' ? 'cycle' : 'drive'
	};
	const foreground = data.type !== 'prepare';
	const key = rangeResultKey(request);
	if (activeRangeJob && !activeRangeJob.controller.signal.aborted && activeRangeJob.key === key) {
		pendingRangeJob = null;
		if (foreground) {
			activeRangeJob.foregroundId = data.requestId;
		}
		return;
	}
	let resolveCancelled;
	const cancelled = new Promise(resolve => { resolveCancelled = resolve; });
	const job = {
		request, key, cancelled, resolveCancelled,
		controller: new AbortController(), foregroundId: foreground ? data.requestId : null
	};
	// Preparation cannot interrupt a calculation the user explicitly requested.
	if (foreground || !activeRangeJob?.foregroundId) cancelRangeJob(activeRangeJob);
	pendingRangeJob = job;
	drainRangeJobs();
}

function postRangeMessage(job, message) {
	if (job.foregroundId === null || job.controller.signal.aborted) return;
	self.postMessage({ ...message, requestId: job.foregroundId });
}

async function drainRangeJobs() {
	if (activeRangeJob) return;
	while (pendingRangeJob) {
		const job = pendingRangeJob;
		pendingRangeJob = null;
		activeRangeJob = job;
		try {
			await runRangeJob(job);
		} catch (error) {
			postRangeMessage(job, { type: 'error', msg: error?.message || 'Unknown worker error' });
		} finally {
			activeRangeJob = null;
		}
	}
}

function yieldRangeWorker() {
	return new Promise(resolve => setTimeout(resolve, 0));
}

function buildRangeGrid(mesh) {
	return mesh.pts.map((point, index) => {
		const landType = mesh.landTypes[index];
		const hasLandData = landType !== C.CELL_WATER;
		return {
			lat: point[0], lng: point[1], cell: mesh.cellTypes[index], landType,
			speedClass: hasLandData ? mesh.speedClasses[index] : null,
			roadBands: hasLandData ? mesh.roadBands?.[index] : null,
			terrainSeverity: hasLandData ? mesh.terrainSeverities?.[index] : null
		};
	});
}

async function runRangeJob(job) {
	const { clat, clng, outerKm, innerKm, modeKey } = job.request;
	if (!Number.isFinite(outerKm) || outerKm <= 0) throw new Error('Invalid outerKm.');
	if (!Number.isFinite(clat) || !Number.isFinite(clng)) throw new Error('Invalid center coordinate.');
	const cachedResult = rangeResultCache.get(job.key);
	if (cachedResult) {
		postRangeMessage(job, { type: 'grid', pts: cachedResult.grid });
		postRangeMessage(job, { type: 'done', ...cachedResult.result });
		return;
	}
	await ensureLandLoaded();
	await yieldRangeWorker();
	if (job.controller.signal.aborted) return;
	const fieldKey = rangeFieldKey(job.request);
	let field = cachedRangeField?.key === fieldKey ? cachedRangeField : null;
	let cacheable = Boolean(field);
	if (!field) {
		postRangeMessage(job, { type: 'status', msg: 'Loading road network...' });
		const vectorRoadData = await Promise.race([
			loadVectorRoadData(clat, clng, outerKm, modeKey, {
				background: job.foregroundId === null,
				isForeground: () => job.foregroundId !== null,
				signal: job.controller.signal
			}),
			job.cancelled
		]);
		if (job.controller.signal.aborted || vectorRoadData?.preloadOnly) return;
		cacheable = !C.USE_VECTOR_ROADS || vectorRoadData?.cacheable === true;
		// Failed road loading must be retried by Show, rather than pinning a
		// degraded background result in the cache for the rest of the session.
		if (!cacheable && job.foregroundId === null) return;
		postRangeMessage(job, { type: 'status', msg: 'Building mesh...' });
		const mesh = buildSitesMesh(clat, clng, outerKm, vectorRoadData, modeKey);
		await yieldRangeWorker();
		if (job.controller.signal.aborted) return;
		postRangeMessage(job, { type: 'status', msg: 'Walking land graph...' });
		const costs = computeDistanceField(mesh, outerKm, clat, clng);
		field = { key: fieldKey, mesh, costs, grid: buildRangeGrid(mesh), contours: new LruCache(C.RANGE_CONTOUR_CACHE_ENTRIES) };
		if (cacheable) cachedRangeField = field;
	}
	await yieldRangeWorker();
	if (job.controller.signal.aborted) return;
	postRangeMessage(job, { type: 'grid', pts: field.grid });
	postRangeMessage(job, { type: 'status', msg: 'Extracting geometry...' });
	function contour(km) {
		let value = field.contours.get(km);
		if (value === undefined) {
			value = computeIsoPolygonSites(field.mesh, field.costs, km);
			field.contours.set(km, value);
		}
		return value;
	}
	const outer = contour(outerKm);
	const inner = innerKm > 0 ? contour(innerKm) : null;
	const deltaKm = (outerKm + innerKm) / 2;
	const delta = deltaKm > 0 ? contour(deltaKm) : null;
	if (!outer?.ring || outer.ring.length < 4) {
		throw new Error('No reachable land cells were found for this range. Try a smaller range or pick a land location.');
	}
	const result = {
		outerRing: outer.ring, innerRing: inner?.ring || null,
		outerGeo: outer.geo,
		innerGeo: inner?.geo || turf.polygon([outer.ring], { kind: 'inner-fallback' }),
		deltaGeo: delta?.geo || null
	};
	if (cacheable) rangeResultCache.set(job.key, { result, grid: field.grid });
	await yieldRangeWorker();
	postRangeMessage(job, { type: 'done', ...result });
}
