import type { Waypoint, RouteSegment, FlightProfile, SavedFlightPlan } from '$lib/types/flight';
import { flightPlanStorage } from '$lib/services/storage';
import { aircraftProfilesStore } from '$lib/state/aircraft-profiles.svelte';

export const SEGMENT_COLORS = [
	'#00f0ff', // Cyan
	'#ff007f', // Magenta
	'#ffd600', // Yellow
	'#00e676', // Green
	'#ff9100', // Orange
	'#b388ff', // Purple
	'#ff3d00', // Red
	'#00e5ff' // Deep Cyan
];

export class FlightPlanState {
	waypoints = $state<Waypoint[]>([]);
	segments = $state<RouteSegment[]>([
		{ id: 'seg_1', cruiseAlt: 5500, waypointIds: [], collapsed: false, color: SEGMENT_COLORS[0] }
	]);
	activeSegmentIndex = $state<number>(0);
	profile = $state<FlightProfile>({
		depIcao: '',
		destIcao: '',
		altIcaos: [],
		departureTime: new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 16),
		cruiseTas: 80,
		initialAlt: 2500,
		arrivalAlt: 2000,
		climbVy: 70,
		climbRateFpm: 700,
		descentRateFpm: 500
	});
	aircraftProfileId = $state<string>('lsa');
	activePlanId = $state<string | null>(null);
	activePlanName = $state<string>('Untitled Flight Plan');

	private cleanSnapshot: string | null = null;
	private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	private serializeForDiff(): string {
		const normalizedSegments = this.segments.map((s) => ({
			id: s.id,
			cruiseAlt: s.cruiseAlt,
			waypointIds: s.waypointIds,
			color: s.color
		}));

		return JSON.stringify({
			waypoints: this.waypoints,
			segments: normalizedSegments,
			profile: this.profile,
			aircraftProfileId: this.aircraftProfileId || aircraftProfilesStore.selectedProfileId
		});
	}

	takeCleanSnapshot(): void {
		this.cleanSnapshot = this.serializeForDiff();
	}

	hasUnsavedChanges(): boolean {
		if (!this.cleanSnapshot) {
			return (
				this.waypoints.length > 0 || Boolean(this.profile.depIcao) || Boolean(this.profile.destIcao)
			);
		}

		return this.serializeForDiff() !== this.cleanSnapshot;
	}

	constructor() {
		// Initial segment setup
	}

	// Trigger debounced auto-save
	private scheduleAutoSave() {
		if (typeof window === 'undefined') return;
		if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
		this.autoSaveTimer = setTimeout(() => {
			this.persistActiveSession();
		}, 1000);
	}

	async persistActiveSession(): Promise<void> {
		try {
			const plan = this.exportAsSavedPlan(this.activePlanName, this.activePlanId || undefined);
			await flightPlanStorage.saveActiveSession(plan);
		} catch (e) {
			console.warn('Auto-save active session failed:', e);
		}
	}

	async restoreActiveSession(): Promise<boolean> {
		try {
			const session = await flightPlanStorage.getActiveSession();
			if (session && (session.waypoints.length > 0 || session.profile.depIcao)) {
				this.loadSavedPlan(session);
				return true;
			}
		} catch (e) {
			console.warn('Restore active session failed:', e);
		}
		return false;
	}

	addWaypoint(lat: number, lng: number, name?: string): Waypoint {
		if (this.segments.length === 0) {
			this.addSegment();
		}

		if (this.activeSegmentIndex >= this.segments.length) {
			this.activeSegmentIndex = this.segments.length - 1;
		}

		const currentSeg = this.segments[this.activeSegmentIndex];
		const totalWaypointsCount = this.waypoints.length + 1;

		const wp: Waypoint = {
			id: `wp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
			lat,
			lng,
			name: name || `WP ${totalWaypointsCount}`
		};

		this.waypoints.push(wp);
		currentSeg.waypointIds.push(wp.id);

		this.scheduleAutoSave();
		return wp;
	}

	updateWaypoint(id: string, updates: Partial<Waypoint>) {
		const wp = this.waypoints.find((w) => w.id === id);
		if (wp) {
			Object.assign(wp, updates);
			this.scheduleAutoSave();
		}
	}

	removeWaypoint(wpId: string) {
		// Remove from segment waypoint lists
		this.segments.forEach((seg) => {
			seg.waypointIds = seg.waypointIds.filter((id) => id !== wpId);
		});

		// Remove from global waypoints
		this.waypoints = this.waypoints.filter((w) => w.id !== wpId);
		this.scheduleAutoSave();
	}

	addSegment(cruiseAlt: number = 5500): RouteSegment {
		const segIdx = this.segments.length;
		const color = SEGMENT_COLORS[segIdx % SEGMENT_COLORS.length];
		const newSeg: RouteSegment = {
			id: `seg_${segIdx + 1}`,
			cruiseAlt,
			waypointIds: [],
			collapsed: false,
			color
		};

		// Connect previous segment's last waypoint if it exists
		if (this.segments.length > 0) {
			const prevSeg = this.segments[this.segments.length - 1];
			if (prevSeg.waypointIds.length > 0) {
				const lastWpId = prevSeg.waypointIds[prevSeg.waypointIds.length - 1];
				newSeg.waypointIds.push(lastWpId);
			}
		}

		// Collapse previous segments
		this.segments.forEach((s) => {
			s.collapsed = true;
		});

		this.segments.push(newSeg);
		this.activeSegmentIndex = this.segments.length - 1;
		this.scheduleAutoSave();
		return newSeg;
	}

	updateSegment(id: string, updates: Partial<RouteSegment>) {
		const seg = this.segments.find((s) => s.id === id);
		if (seg) {
			Object.assign(seg, updates);
			this.scheduleAutoSave();
		}
	}

	removeSegment(index: number) {
		if (this.segments.length <= 1) return;
		if (index < 0 || index >= this.segments.length) return;

		const removed = this.segments.splice(index, 1)[0];

		// Clean up waypoints belonging solely to this segment
		removed.waypointIds.forEach((wpId) => {
			const isUsedElsewhere = this.segments.some((s) => s.waypointIds.includes(wpId));
			if (!isUsedElsewhere) {
				this.waypoints = this.waypoints.filter((w) => w.id !== wpId);
			}
		});

		this.activeSegmentIndex = Math.max(
			0,
			Math.min(this.activeSegmentIndex, this.segments.length - 1)
		);
		this.scheduleAutoSave();
	}

	setActiveSegment(index: number) {
		if (index >= 0 && index < this.segments.length) {
			this.activeSegmentIndex = index;
			this.segments.forEach((s, i) => {
				s.collapsed = i !== index;
			});
		}
	}

	toggleSegmentCollapse(index: number) {
		if (index >= 0 && index < this.segments.length) {
			this.segments[index].collapsed = !this.segments[index].collapsed;
		}
	}

	updateProfile(updates: Partial<FlightProfile>) {
		Object.assign(this.profile, updates);
		this.scheduleAutoSave();
	}

	clearRoute() {
		this.waypoints = [];
		this.segments = [
			{ id: 'seg_1', cruiseAlt: 5500, waypointIds: [], collapsed: false, color: SEGMENT_COLORS[0] }
		];
		this.activeSegmentIndex = 0;
		this.activePlanId = null;
		this.activePlanName = 'Untitled Flight Plan';
		this.cleanSnapshot = null;
		this.scheduleAutoSave();
	}

	loadSavedPlan(plan: SavedFlightPlan) {
		this.waypoints = [...plan.waypoints];
		this.segments = plan.segments.map((seg, idx) => ({
			...seg,
			color: seg.color || SEGMENT_COLORS[idx % SEGMENT_COLORS.length]
		}));
		this.profile = { ...plan.profile };
		this.activePlanId = plan.id;
		this.activePlanName = plan.name;
		this.activeSegmentIndex = 0;
		this.aircraftProfileId = plan.aircraftProfileId || 'lsa';
		aircraftProfilesStore.applySavedAircraftProfile(plan.aircraftProfileId);
		this.takeCleanSnapshot();
	}

	exportAsSavedPlan(name: string, planId?: string): SavedFlightPlan {
		return {
			id: planId || `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
			name,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			waypoints: JSON.parse(JSON.stringify(this.waypoints)),
			segments: JSON.parse(JSON.stringify(this.segments)),
			profile: JSON.parse(JSON.stringify(this.profile)),
			aircraftProfileId: this.aircraftProfileId || aircraftProfilesStore.selectedProfileId || 'lsa'
		};
	}
}

export const flightPlanStore = new FlightPlanState();
