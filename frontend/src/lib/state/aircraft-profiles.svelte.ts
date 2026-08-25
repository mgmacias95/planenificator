import {
	DEFAULT_AIRCRAFT_PRESETS,
	type AircraftPerformanceProfile,
	type FlightProfile
} from '$lib/types/flight';
import { flightPlanStorage } from '$lib/services/storage';
import { flightPlanStore } from '$lib/state/flight-plan.svelte';

export class AircraftProfilesState {
	customProfiles = $state<AircraftPerformanceProfile[]>([]);
	selectedProfileId = $state<string>('lsa');
	isLoaded = $state<boolean>(false);

	allProfiles = $derived<AircraftPerformanceProfile[]>([
		...DEFAULT_AIRCRAFT_PRESETS,
		...this.customProfiles
	]);

	selectedProfile = $derived<AircraftPerformanceProfile | undefined>(
		this.allProfiles.find((p) => p.id === this.selectedProfileId)
	);

	isCustomSelected = $derived<boolean>(this.selectedProfileId === 'custom');

	isCurrentCustomProfile = $derived<boolean>(
		Boolean(this.selectedProfile?.isCustom)
	);

	async init(): Promise<void> {
		if (this.isLoaded) return;
		try {
			const saved = await flightPlanStorage.listAircraftProfiles();
			this.customProfiles = saved;
			this.isLoaded = true;
			this.syncWithCurrentFlightPlan();
		} catch (e) {
			console.warn('Failed to load custom aircraft profiles:', e);
			this.isLoaded = true;
		}
	}

	syncWithCurrentFlightPlan(): void {
		const current = flightPlanStore.profile;
		// Check if matches the currently selected profile
		if (this.selectedProfile && this.matchesProfile(current, this.selectedProfile)) {
			return;
		}
		// Otherwise check if matches any other profile
		const match = this.allProfiles.find((p) => this.matchesProfile(current, p));
		if (match) {
			this.selectedProfileId = match.id;
		}
	}

	matchesProfile(flightProfile: FlightProfile, aircraftProfile: AircraftPerformanceProfile): boolean {
		return (
			flightProfile.cruiseTas === aircraftProfile.cruiseTas &&
			flightProfile.climbVy === aircraftProfile.climbVy &&
			flightProfile.climbRateFpm === aircraftProfile.climbRateFpm &&
			flightProfile.descentRateFpm === aircraftProfile.descentRateFpm
		);
	}

	selectProfile(id: string): void {
		const profile = this.allProfiles.find((p) => p.id === id);
		if (profile) {
			this.selectedProfileId = id;
			flightPlanStore.updateProfile({
				cruiseTas: profile.cruiseTas,
				climbVy: profile.climbVy,
				climbRateFpm: profile.climbRateFpm,
				descentRateFpm: profile.descentRateFpm
			});
		}
	}

	async saveCustomProfile(data: {
		id?: string;
		name: string;
		cruiseTas: number;
		climbVy: number;
		climbRateFpm: number;
		descentRateFpm: number;
	}): Promise<AircraftPerformanceProfile> {
		const isExisting = Boolean(data.id && this.customProfiles.some((p) => p.id === data.id));
		const profileId =
			isExisting && data.id
				? data.id
				: `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

		const existing = isExisting ? this.customProfiles.find((p) => p.id === profileId) : undefined;
		const now = Date.now();

		const newProfile: AircraftPerformanceProfile = {
			id: profileId,
			name: data.name.trim(),
			cruiseTas: Number(data.cruiseTas),
			climbVy: Number(data.climbVy),
			climbRateFpm: Number(data.climbRateFpm),
			descentRateFpm: Number(data.descentRateFpm),
			isCustom: true,
			createdAt: existing?.createdAt || now,
			updatedAt: now
		};

		await flightPlanStorage.saveAircraftProfile(newProfile);

		if (isExisting) {
			this.customProfiles = this.customProfiles.map((p) => (p.id === profileId ? newProfile : p));
		} else {
			this.customProfiles = [newProfile, ...this.customProfiles];
		}

		this.selectedProfileId = newProfile.id;
		flightPlanStore.updateProfile({
			cruiseTas: newProfile.cruiseTas,
			climbVy: newProfile.climbVy,
			climbRateFpm: newProfile.climbRateFpm,
			descentRateFpm: newProfile.descentRateFpm
		});

		return newProfile;
	}

	async deleteCustomProfile(id: string): Promise<void> {
		await flightPlanStorage.deleteAircraftProfile(id);
		this.customProfiles = this.customProfiles.filter((p) => p.id !== id);

		if (this.selectedProfileId === id) {
			this.selectProfile('lsa');
		}
	}
}

export const aircraftProfilesStore = new AircraftProfilesState();
