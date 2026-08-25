import { describe, it, expect, beforeEach } from 'vitest';
import { FlightPlanState } from '$lib/state/flight-plan.svelte';
import { GeocodingService } from '$lib/services/geocoding';
import type { GazetteerDataset } from '$lib/types/geocoding';

const mockDataset: GazetteerDataset = {
	version: '1.0',
	region: 'ES',
	generatedAt: '2026-08-25T12:00:00Z',
	airports: [
		{
			name: 'Madrid / Cuatro Vientos',
			ident: 'LECU',
			lat: 40.3706,
			lon: -3.7853,
			type: 'aerodrome'
		}
	],
	places: [
		{
			name: 'Guadalajara',
			lat: 40.6337,
			lon: -3.1674,
			type: 'city'
		},
		{
			name: 'Alcalá de Henares',
			lat: 40.4819,
			lon: -3.3635,
			type: 'city'
		}
	]
};

describe('Waypoint Custom Name Preservation (User Story 3)', () => {
	let store: FlightPlanState;
	let geocoder: GeocodingService;

	beforeEach(async () => {
		store = new FlightPlanState();
		geocoder = new GeocodingService();
		await geocoder.loadGazetteer(mockDataset);
	});

	it('preserves manual waypoint name when coordinates change', () => {
		const wp = store.addWaypoint(40.6337, -3.1674, 'Custom Reporting Point Alpha');
		store.updateWaypoint(wp.id, { isManualName: true });

		// Simulate moving waypoint to Alcalá de Henares coordinates
		store.updateWaypoint(wp.id, { lat: 40.4819, lng: -3.3635 });

		const currentWp = store.waypoints.find((w) => w.id === wp.id)!;
		expect(currentWp.isManualName).toBe(true);

		// If isManualName is true, the resolved geocoding name should NOT overwrite currentWp.name
		if (!currentWp.isManualName) {
			const resolved = geocoder.reverseGeocode(currentWp.lat, currentWp.lng);
			store.updateWaypoint(currentWp.id, { name: resolved });
		}

		expect(store.waypoints[0].name).toBe('Custom Reporting Point Alpha');
	});

	it('updates waypoint name when isManualName is false or not set', () => {
		const wp = store.addWaypoint(40.6337, -3.1674);
		expect(wp.isManualName).toBeFalsy();

		// Simulate resolving name for Guadalajara
		const initialResolved = geocoder.reverseGeocode(wp.lat, wp.lng);
		store.updateWaypoint(wp.id, { name: initialResolved });
		expect(store.waypoints[0].name).toBe('Guadalajara');

		// Move to Alcalá de Henares
		store.updateWaypoint(wp.id, { lat: 40.4819, lng: -3.3635 });
		const updatedWp = store.waypoints.find((w) => w.id === wp.id)!;

		if (!updatedWp.isManualName) {
			const resolved = geocoder.reverseGeocode(updatedWp.lat, updatedWp.lng);
			store.updateWaypoint(updatedWp.id, { name: resolved });
		}

		expect(store.waypoints[0].name).toBe('Alcalá de Henares');
	});
});
