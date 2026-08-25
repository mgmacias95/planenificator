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
			}
		};

		const jsonStr = JSON.stringify(plan);
		const parsed = JSON.parse(jsonStr) as SavedFlightPlan;

		expect(parsed.id).toBe('plan_test_123');
		expect(parsed.waypoints.length).toBe(2);
		expect(parsed.segments[0].cruiseAlt).toBe(5500);
		expect(parsed.profile.depIcao).toBe('LEZL');
	});
});
