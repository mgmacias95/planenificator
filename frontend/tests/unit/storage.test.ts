import { describe, it, expect } from 'vitest';
import type { SavedFlightPlan } from '$lib/types/flight';

describe('Flight Plan Storage Model & Persistence', () => {
	it('should create valid serializable SavedFlightPlan payload', () => {
		const plan: SavedFlightPlan = {
			id: 'plan_test_123',
			name: 'Sevilla to Granada VFR',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			waypoints: [
				{ id: 'wp1', lat: 37.418, lng: -5.893, name: 'LEZL (Sevilla)' },
				{ id: 'wp2', lat: 37.188, lng: -3.777, name: 'LEGR (Granada)' }
			],
			segments: [{ id: 'seg_1', cruiseAlt: 5500, waypointIds: ['wp1', 'wp2'], collapsed: false }],
			profile: {
				depIcao: 'LEZL',
				destIcao: 'LEGR',
				altIcaos: ['LEMG'],
				departureTime: '2026-08-25T10:00',
				cruiseTas: 90,
				initialAlt: 300,
				arrivalAlt: 1800,
				climbVy: 75,
				climbRateFpm: 750,
				descentRateFpm: 500
			},
			aircraftProfileId: 'c172'
		};

		const jsonStr = JSON.stringify(plan);
		const parsed = JSON.parse(jsonStr) as SavedFlightPlan;

		expect(parsed.id).toBe('plan_test_123');
		expect(parsed.waypoints.length).toBe(2);
		expect(parsed.segments[0].cruiseAlt).toBe(5500);
		expect(parsed.profile.depIcao).toBe('LEZL');
		expect(parsed.aircraftProfileId).toBe('c172');
	});

	it('should track unsaved changes accurately after loading or modifying plans', async () => {
		const { FlightPlanState } = await import('$lib/state/flight-plan.svelte');
		const store = new FlightPlanState();

		// Initially clean empty route
		expect(store.hasUnsavedChanges()).toBe(false);

		// Adding waypoint makes it dirty
		const wp = store.addWaypoint(37.418, -5.893, 'LEZL');
		expect(store.hasUnsavedChanges()).toBe(true);

		// Loading a plan takes a clean snapshot
		const mockPlan: SavedFlightPlan = {
			id: 'plan_clean_1',
			name: 'Test Clean Plan',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			waypoints: [wp],
			segments: [{ id: 'seg_1', cruiseAlt: 5500, waypointIds: [wp.id], collapsed: false }],
			profile: {
				depIcao: 'LEZL',
				destIcao: 'LEBA',
				altIcaos: [],
				departureTime: '2026-08-25T10:00',
				cruiseTas: 80,
				initialAlt: 2500,
				arrivalAlt: 2000,
				climbVy: 70,
				climbRateFpm: 700,
				descentRateFpm: 500
			},
			aircraftProfileId: 'lsa'
		};

		store.loadSavedPlan(mockPlan);
		expect(store.hasUnsavedChanges()).toBe(false);

		// Modifying waypoint makes it dirty
		store.addWaypoint(37.9, -4.8, 'LEBA');
		expect(store.hasUnsavedChanges()).toBe(true);

		// Taking a clean snapshot (e.g. after save) clears dirty state
		store.takeCleanSnapshot();
		expect(store.hasUnsavedChanges()).toBe(false);
	});
});
