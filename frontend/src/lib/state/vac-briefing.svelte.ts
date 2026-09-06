import { scrapeAndRenderAllVacCharts, type AerodromeVacResult } from '$lib/services/vac';

export class VacBriefingState {
	results = $state<AerodromeVacResult[]>([]);
	isLoading = $state<boolean>(false);
	error = $state<string | null>(null);
	lastFingerprint = $state<string | null>(null);
	private activePromise: Promise<AerodromeVacResult[]> | null = null;

	async loadVacCharts(
		depIcao: string,
		destIcao: string,
		altIcaos: string[],
		force = false
	): Promise<AerodromeVacResult[] | undefined> {
		const dep = (depIcao || '').trim().toUpperCase();
		const dest = (destIcao || '').trim().toUpperCase();
		const alts = (altIcaos || []).map((a) => (a || '').trim().toUpperCase()).filter(Boolean);

		if (!dep && !dest && alts.length === 0) {
			this.results = [];
			this.lastFingerprint = null;
			return [];
		}

		const fingerprint = `${dep}__${dest}__${alts.sort().join(',')}`;
		if (!force && fingerprint === this.lastFingerprint && this.results.length > 0) {
			return this.results;
		}

		if (this.activePromise) {
			return this.activePromise;
		}

		this.isLoading = true;
		this.error = null;

		this.activePromise = (async () => {
			try {
				const res = await scrapeAndRenderAllVacCharts(dep, dest, alts);
				this.results = res;
				this.lastFingerprint = fingerprint;
				return res;
			} catch (e: any) {
				this.error = e?.message || 'Failed loading VAC charts';
				return [];
			} finally {
				this.isLoading = false;
				this.activePromise = null;
			}
		})();

		return this.activePromise;
	}

	async ensureLoaded(depIcao: string, destIcao: string, altIcaos: string[]): Promise<void> {
		if (this.activePromise) {
			await this.activePromise;
		} else {
			await this.loadVacCharts(depIcao, destIcao, altIcaos);
		}
	}
}

export const vacBriefingStore = new VacBriefingState();

if (typeof window !== 'undefined') {
	(window as any).__vacBriefingStore = vacBriefingStore;
}
