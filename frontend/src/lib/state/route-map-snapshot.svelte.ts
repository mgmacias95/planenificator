import type { Waypoint, RouteSegment, ChartOverlay } from '$lib/types/flight';
import { flightPlanStore } from '$lib/state/flight-plan.svelte';
import { calculationStore } from '$lib/state/calculation.svelte';
import { chartStore } from '$lib/state/charts.svelte';
import { generateRouteMapSnapshot } from '$lib/services/route-map-snapshot';

export class RouteMapSnapshotState {
	dataUrl = $state<string | null>(null);
	isLoading = $state(false);
	lastFingerprint = $state<string | null>(null);

	hasEnaireChart = $derived.by(() =>
		chartStore.loadedCharts.some(
			(c) => c.visible !== false && Boolean(c.imageBlobUrl || c.canvasElement || c.sourceCanvas)
		)
	);

	computeFingerprint(
		waypoints: Waypoint[],
		segments: RouteSegment[],
		charts?: ChartOverlay[]
	): string {
		const wpStr = waypoints
			.map((w) => `${w.id}:${w.lat.toFixed(5)}:${w.lng.toFixed(5)}:${w.name}`)
			.join('|');
		const segStr = segments
			.map((s) => `${s.id}:${s.color ?? ''}:${s.waypointIds.join(',')}`)
			.join('|');
		const chartStr = (charts ?? [])
			.map((c) => `${c.id}:${c.visible}:${c.imageBlobUrl ?? ''}`)
			.join('|');
		return `${wpStr}##${segStr}##${chartStr}`;
	}

	async ensureSnapshot(force = false): Promise<string | null> {
		const waypoints = flightPlanStore.waypoints;
		const segments = flightPlanStore.segments;
		const charts = chartStore.loadedCharts;

		if (waypoints.length === 0) {
			this.dataUrl = null;
			this.lastFingerprint = null;
			return null;
		}

		const fp = this.computeFingerprint(waypoints, segments, charts);
		if (!force && fp === this.lastFingerprint && this.dataUrl) {
			return this.dataUrl;
		}

		this.isLoading = true;
		try {
			const dep = flightPlanStore.profile.depIcao || waypoints[0]?.name || 'DEP';
			const dest =
				flightPlanStore.profile.destIcao ||
				(waypoints.length > 1 ? waypoints[waypoints.length - 1]?.name : '') ||
				'DEST';

			const result = await generateRouteMapSnapshot({
				waypoints,
				segments,
				loadedCharts: chartStore.loadedCharts,
				routeSummary: {
					depIcao: dep,
					destIcao: dest,
					totalDistanceNm: calculationStore.totalDistanceNm
				}
			});

			if (result) {
				this.dataUrl = result;
				this.lastFingerprint = fp;
			}
			return result;
		} catch (err) {
			console.warn('Failed to generate route map snapshot:', err);
			return null;
		} finally {
			this.isLoading = false;
		}
	}

	clear() {
		this.dataUrl = null;
		this.lastFingerprint = null;
		this.isLoading = false;
	}
}

export const routeMapSnapshotStore = new RouteMapSnapshotState();
