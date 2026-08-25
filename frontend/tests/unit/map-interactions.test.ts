import { describe, it, expect } from 'vitest';
import { FlightPlanState } from '$lib/state/flight-plan.svelte';

// Great circle bearing formula
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const rad = Math.PI / 180;
	const phi1 = lat1 * rad;
	const phi2 = lat2 * rad;
	const deltaLambda = (lon2 - lon1) * rad;

	const y = Math.sin(deltaLambda) * Math.cos(phi2);
	const x =
		Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
	const theta = Math.atan2(y, x);
	return ((theta * 180) / Math.PI + 360) % 360;
}

// Great circle distance in nautical miles (Haversine)
function calculateDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const rad = Math.PI / 180;
	const R = 3440.065; // Earth radius in NM
	const dLat = (lat2 - lat1) * rad;
	const dLon = (lon2 - lon1) * rad;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

describe('Map Waypoint & Nav Math Utilities', () => {
	it('should calculate accurate Great Circle bearing between two airport coordinates', () => {
		// LEBA (Córdoba: 37.842, -4.848) to LEMD (Madrid Barajas: 40.485, -3.567)
		const bearing = calculateBearing(37.842, -4.848, 40.485, -3.567);
		expect(bearing).toBeGreaterThan(15);
		expect(bearing).toBeLessThan(30);
	});

	it('should calculate accurate nautical mile distance between coordinates', () => {
		const distNm = calculateDistanceNm(37.842, -4.848, 40.485, -3.567);
		expect(distNm).toBeGreaterThan(160);
		expect(distNm).toBeLessThan(180);
	});

	it('should add, update, and remove waypoints in FlightPlanState store', () => {
		const store = new FlightPlanState();
		const wp1 = store.addWaypoint(37.842, -4.848, 'Córdoba');
		const wp2 = store.addWaypoint(40.485, -3.567, 'Madrid');

		expect(store.waypoints.length).toBe(2);
		expect(store.segments[0].waypointIds).toContain(wp1.id);
		expect(store.segments[0].waypointIds).toContain(wp2.id);

		store.updateWaypoint(wp1.id, { name: 'LEBA Aerodrome' });
		expect(store.waypoints[0].name).toBe('LEBA Aerodrome');

		store.removeWaypoint(wp1.id);
		expect(store.waypoints.length).toBe(1);
		expect(store.segments[0].waypointIds).not.toContain(wp1.id);
	});
});
