import type { NavLogEntry, SemicircularNotice, NotamAlert } from '$lib/types/flight';
import { pyodideService } from '$lib/services/pyodide.svelte';
import { flightPlanStore } from '$lib/state/flight-plan.svelte';

export class CalculationState {
	navLog = $state<NavLogEntry[]>([]);
	semicircularNotices = $state<SemicircularNotice[]>([]);
	notams = $state<NotamAlert[]>([]);
	totalDistanceNm = $state<number>(0);
	totalFlightTimeMinutes = $state<number>(0);
	isCalculating = $state<boolean>(false);
	statusMessage = $state<string>('');
	error = $state<string | null>(null);
	warnings = $state<string[]>([]);
	hasCalculated = $state<boolean>(false);
	calculatedFingerprint = $state<string | null>(null);

	get isStale(): boolean {
		return (
			this.hasCalculated && this.calculatedFingerprint !== flightPlanStore.calculationFingerprint()
		);
	}

	async calculate(): Promise<boolean> {
		if (flightPlanStore.waypoints.length < 2) {
			this.error = 'Please add at least 2 waypoints to compute a route';
			return false;
		}

		this.isCalculating = true;
		this.statusMessage = 'Initializing flight plan calculation...';
		this.error = null;

		// Allow browser DOM to paint the loading overlay before heavy execution
		await new Promise((resolve) => setTimeout(resolve, 80));

		try {
			const result = await pyodideService.calculateRoute({
				waypoints: flightPlanStore.waypoints,
				segments: flightPlanStore.segments,
				profile: flightPlanStore.profile
			});

			this.navLog = result.navLog;
			this.semicircularNotices = result.semicircularNotices;
			this.notams = result.notams;
			this.totalDistanceNm = result.totalDistanceNm;
			this.totalFlightTimeMinutes = result.totalFlightTimeMinutes;
			this.warnings = result.warnings;
			this.calculatedFingerprint = flightPlanStore.calculationFingerprint();
			this.hasCalculated = true;

			return true;
		} catch (err: any) {
			console.error('Calculation execution error:', err);
			this.error = err?.message || String(err);
			return false;
		} finally {
			this.isCalculating = false;
			this.statusMessage = '';
		}
	}

	clear() {
		this.navLog = [];
		this.semicircularNotices = [];
		this.notams = [];
		this.totalDistanceNm = 0;
		this.totalFlightTimeMinutes = 0;
		this.error = null;
		this.warnings = [];
		this.hasCalculated = false;
		this.calculatedFingerprint = null;
		this.statusMessage = '';
	}
}

export const calculationStore = new CalculationState();
