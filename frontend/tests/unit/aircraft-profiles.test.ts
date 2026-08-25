import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	DEFAULT_AIRCRAFT_PRESETS,
	type AircraftPerformanceProfile
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
	});
});
