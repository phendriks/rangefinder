// Local planar projections. Sites use [lat,lng]; GeoJSON uses [lng,lat].
// Retain the original multiplication/division order for identical contours.
function projectLatLng(lat, lng, clat, clng, cosLat) {
	return [
		(lng - clng) * C.KM_PER_DEG_LAT * cosLat,
		(lat - clat) * C.KM_PER_DEG_LAT
	];
}

function sitesToXy(sites, clat, clng) {
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const xy = new Array(sites.length);
	for (let i = 0; i < sites.length; i++) {
		const lat = sites[i].lat;
		const lng = sites[i].lng;
		xy[i] = projectLatLng(lat, lng, clat, clng, cosLat);
	}
	return xy;
}

function xyToSites(xy, clat, clng) {
	const refLatRad = clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const invLngScale = 1 / (C.KM_PER_DEG_LAT * cosLat);
	const invLatScale = 1 / C.KM_PER_DEG_LAT;
	const sites = new Array(xy.length);
	for (let i = 0; i < xy.length; i++) {
		const p = xy[i];
		sites[i] = {
			lat: clat + (p[1] * invLatScale),
			lng: clng + (p[0] * invLngScale)
		};
	}
	return sites;
}
function lngLatToXy(mesh, p) {
	const refLatRad = mesh.clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const x = (p[0] - mesh.clng) * (C.KM_PER_DEG_LAT * cosLat);
	const y = (p[1] - mesh.clat) * C.KM_PER_DEG_LAT;
	return [x, y];
}

function xyToLngLat(mesh, p) {
	const refLatRad = mesh.clat * Math.PI / 180;
	const cosLat = Math.cos(refLatRad);
	const lng = mesh.clng + (p[0] / (C.KM_PER_DEG_LAT * cosLat));
	const lat = mesh.clat + (p[1] / C.KM_PER_DEG_LAT);
	return [lng, lat];
}

