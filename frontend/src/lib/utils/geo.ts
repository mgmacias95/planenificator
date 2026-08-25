/**
 * Geodesic and spatial mathematical utilities for aviation calculations.
 */

export const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_NM = 1.852;

/**
 * Converts degrees to radians.
 */
export function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * Converts kilometers to nautical miles.
 */
export function kmToNm(km: number): number {
	return km / KM_PER_NM;
}

/**
 * Converts nautical miles to kilometers.
 */
export function nmToKm(nm: number): number {
	return nm * KM_PER_NM;
}

/**
 * Calculates the great-circle distance between two points on a sphere (Earth)
 * using the Haversine formula in kilometers.
 *
 * @param lat1 - Latitude of point 1 in decimal degrees
 * @param lon1 - Longitude of point 1 in decimal degrees
 * @param lat2 - Latitude of point 2 in decimal degrees
 * @param lon2 - Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers
 */
export function haversineDistanceKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);
	const radLat1 = toRadians(lat1);
	const radLat2 = toRadians(lat2);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
	return EARTH_RADIUS_KM * c;
}

/**
 * Calculates the great-circle distance between two points on a sphere (Earth)
 * using the Haversine formula in nautical miles.
 *
 * @param lat1 - Latitude of point 1 in decimal degrees
 * @param lon1 - Longitude of point 1 in decimal degrees
 * @param lat2 - Latitude of point 2 in decimal degrees
 * @param lon2 - Longitude of point 2 in decimal degrees
 * @returns Distance in nautical miles
 */
export function haversineDistanceNm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	return kmToNm(haversineDistanceKm(lat1, lon1, lat2, lon2));
}
