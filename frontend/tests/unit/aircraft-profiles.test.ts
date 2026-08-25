import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	DEFAULT_AIRCRAFT_PRESETS,
	type AircraftPerformanceProfile,
	type SavedFlightPlan
} from '$lib/types/flight';
import { AircraftProfilesState } from '$lib/state/aircraft-profiles.svelte';
import { flightPlanStore } from '$lib/state/flight-plan.svelte';
import { flightPlanStorage } from '$lib/services/storage';

describe('Aircraft Performance Profiles & Presets', () => {
	it('should include standard default aircraft presets', () => {
		expect(DEFAULT_AIRCRAFT_PRESETS.length).toBeGreaterThanOrEqual(4);
		const lsa = DEFAULT_AIRCRAFT_PRESETS.find((p) => p.id === 'lsa');
		const c172 = DEFAULT_AIRCRAFT_PRESETS.find((p) => p.id === 'c172');

		expect(lsa).toBeDefined();
		expect(lsa?.cruiseTas).toBe(80);
		expect(lsa?.climbVy).toBe(70);

		expect(c172).toBeDefined();
		expect(c172?.cruiseTas).toBe(110);
		expect(c172?.climbVy).toBe(74);
	});

	it('should serialize and parse AircraftPerformanceProfile correctly', () => {
		const customProfile: AircraftPerformanceProfile = {
			id: 'prof_diamond_da40',
			name: 'Diamond DA40 NG',
			cruiseTas: 125,
			climbVy: 73,
			climbRateFpm: 750,
			descentRateFpm: 600,
			isCustom: true,
			createdAt: 1724600000,
			updatedAt: 1724600000
		};

		const json = JSON.stringify(customProfile);
		const parsed = JSON.parse(json) as AircraftPerformanceProfile;

		expect(parsed.id).toBe('prof_diamond_da40');
		expect(parsed.name).toBe('Diamond DA40 NG');
		expect(parsed.cruiseTas).toBe(125);
		expect(parsed.climbVy).toBe(73);
		expect(parsed.climbRateFpm).toBe(750);
		expect(parsed.descentRateFpm).toBe(600);
		expect(parsed.isCustom).toBe(true);
	});

	describe('AircraftProfilesState operations', () => {
		let state: AircraftProfilesState;

		beforeEach(() => {
			state = new AircraftProfilesState();
			// Mock storage calls
			vi.spyOn(flightPlanStorage, 'listAircraftProfiles').mockResolvedValue([]);
			vi.spyOn(flightPlanStorage, 'saveAircraftProfile').mockResolvedValue(undefined);
			vi.spyOn(flightPlanStorage, 'deleteAircraftProfile').mockResolvedValue(undefined);
		});

		it('should select preset and update flight plan store', () => {
			state.selectProfile('c172');
			expect(state.selectedProfileId).toBe('c172');
			expect(flightPlanStore.profile.cruiseTas).toBe(110);
			expect(flightPlanStore.profile.climbVy).toBe(74);
			expect(flightPlanStore.profile.climbRateFpm).toBe(700);
			expect(flightPlanStore.profile.descentRateFpm).toBe(500);
		});

		it('should create and store a new custom profile', async () => {
			const saved = await state.saveCustomProfile({
				name: 'Tecnam P2002-JF',
				cruiseTas: 105,
				climbVy: 68,
				climbRateFpm: 650,
				descentRateFpm: 500
			});

			expect(saved.id).toMatch(/^prof_/);
			expect(saved.name).toBe('Tecnam P2002-JF');
			expect(saved.isCustom).toBe(true);
			expect(state.customProfiles.length).toBe(1);
			expect(state.selectedProfileId).toBe(saved.id);
			expect(flightPlanStore.profile.cruiseTas).toBe(105);
			expect(flightPlanStore.profile.climbVy).toBe(68);
		});

		it('should edit an existing custom profile', async () => {
			const created = await state.saveCustomProfile({
				name: 'RV-7 Experimental',
				cruiseTas: 160,
				climbVy: 90,
				climbRateFpm: 1200,
				descentRateFpm: 700
			});

			const updated = await state.saveCustomProfile({
				id: created.id,
				name: 'RV-7 Super Fast',
				cruiseTas: 170,
				climbVy: 95,
				climbRateFpm: 1400,
				descentRateFpm: 800
			});

			expect(updated.id).toBe(created.id);
			expect(updated.name).toBe('RV-7 Super Fast');
			expect(state.customProfiles.length).toBe(1);
			expect(state.customProfiles[0].cruiseTas).toBe(170);
			expect(flightPlanStore.profile.cruiseTas).toBe(170);
		});

		it('should delete a custom profile and revert to default preset', async () => {
			const created = await state.saveCustomProfile({
				name: 'Temporary Plane',
				cruiseTas: 100,
				climbVy: 70,
				climbRateFpm: 700,
				descentRateFpm: 500
			});

			expect(state.selectedProfileId).toBe(created.id);
			await state.deleteCustomProfile(created.id);

			expect(state.customProfiles.length).toBe(0);
			expect(state.selectedProfileId).toBe('lsa');
			expect(flightPlanStore.profile.cruiseTas).toBe(80);
		});

		it('should synchronize selectedProfileId when flight plan values match another preset', () => {
			state.selectProfile('c172');
			expect(state.selectedProfileId).toBe('c172');

			// Manually change values in flight plan to match pa28
			const pa28 = DEFAULT_AIRCRAFT_PRESETS.find((p) => p.id === 'pa28')!;
			flightPlanStore.updateProfile({
				cruiseTas: pa28.cruiseTas,
				climbVy: pa28.climbVy,
				climbRateFpm: pa28.climbRateFpm,
				descentRateFpm: pa28.descentRateFpm
			});
			state.syncWithCurrentFlightPlan();

			expect(state.selectedProfileId).toBe('pa28');
		});

		it('should include selected aircraft profile in exported flight plan', () => {
			state.selectProfile('pa28');
			const exported = flightPlanStore.exportAsSavedPlan('Test Flight');
			expect(exported.aircraftProfileId).toBe('pa28');
		});

		it('should load flight plan with aircraftProfileId and apply it', () => {
			state.selectProfile('lsa');
			expect(state.selectedProfileId).toBe('lsa');

			const savedPlan: SavedFlightPlan = {
				id: 'plan_456',
				name: 'Piper Flight',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				waypoints: [{ id: 'wp1', lat: 40, lng: -3, name: 'WP1' }],
				segments: [{ id: 'seg1', cruiseAlt: 5500, waypointIds: ['wp1'] }],
				profile: {
					depIcao: 'LEMD',
					destIcao: 'LEBA',
					altIcaos: [],
					departureTime: '2026-08-25T10:00',
					cruiseTas: 115,
					initialAlt: 2000,
					arrivalAlt: 1500,
					climbVy: 76,
					climbRateFpm: 650,
					descentRateFpm: 500
				},
				aircraftProfileId: 'pa28'
			};

			state.applySavedAircraftProfile(savedPlan.aircraftProfileId);
			expect(state.selectedProfileId).toBe('pa28');
		});

		it('should handle loading flight plan whose custom aircraft was deleted gracefully', async () => {
			const custom = await state.saveCustomProfile({
				name: 'Custom Jet',
				cruiseTas: 200,
				climbVy: 100,
				climbRateFpm: 1500,
				descentRateFpm: 1000
			});

			const planWithCustom: SavedFlightPlan = {
				id: 'plan_custom',
				name: 'Jet Route',
				createdAt: Date.now(),
				updatedAt: Date.now(),
				waypoints: [{ id: 'wp1', lat: 40, lng: -3, name: 'WP1' }],
				segments: [{ id: 'seg1', cruiseAlt: 9500, waypointIds: ['wp1'] }],
				profile: {
					depIcao: 'LEMD',
					destIcao: 'LEBL',
					altIcaos: [],
					departureTime: '2026-08-25T10:00',
					cruiseTas: 200,
					initialAlt: 2000,
					arrivalAlt: 1500,
					climbVy: 100,
					climbRateFpm: 1500,
					descentRateFpm: 1000
				},
				aircraftProfileId: custom.id
			};

			// Delete the custom profile
			await state.deleteCustomProfile(custom.id);
			expect(state.customProfiles.some((p) => p.id === custom.id)).toBe(false);

			// Load the plan that referenced the deleted profile
			flightPlanStore.updateProfile(planWithCustom.profile);
			state.applySavedAircraftProfile(planWithCustom.aircraftProfileId);

			// Profile parameters in the flight plan must be preserved
			expect(flightPlanStore.profile.cruiseTas).toBe(200);
			// Aircraft selection should safely fallback to default or matching without throwing error
			expect(state.selectedProfileId).toBe('lsa');
		});

		it('should create new plan with unique ID on default export instead of overwriting activePlanId', () => {
			flightPlanStore.activePlanId = 'existing_loaded_plan_id';
			const newExport = flightPlanStore.exportAsSavedPlan('New Copy Plan');
			expect(newExport.id).not.toBe('existing_loaded_plan_id');
			expect(newExport.id).toMatch(/^plan_/);

			const overwriteExport = flightPlanStore.exportAsSavedPlan(
				'Overwrite Plan',
				'existing_loaded_plan_id'
			);
			expect(overwriteExport.id).toBe('existing_loaded_plan_id');
		});
	});
});
