import type { ChartOverlay } from '$lib/types/flight';
import type { EnaireCatalogItem } from '../../../../specs/001-migrate-svelte-frontend/contracts/chart-georef';
import { chartGeoreferencer } from '$lib/services/georef';

export class ChartState {
	loadedCharts = $state<ChartOverlay[]>([]);
	catalog = $state<EnaireCatalogItem[]>([]);
	isLoadingCatalog = $state<boolean>(false);
	isLoadingChart = $state<boolean>(false);
	errorMessage = $state<string | null>(null);

	async loadCatalog() {
		this.isLoadingCatalog = true;
		this.errorMessage = null;
		try {
			this.catalog = await chartGeoreferencer.fetchEnaireCatalog();
		} catch (e: any) {
			this.errorMessage = 'Failed to load ENAIRE chart catalog';
			console.warn(e);
		} finally {
			this.isLoadingCatalog = false;
		}
	}

	addChart(chart: ChartOverlay) {
		if (this.loadedCharts.length >= 4) {
			throw new Error('Maximum of 4 concurrent charts allowed to conserve memory');
		}
		this.loadedCharts = [...this.loadedCharts, chart];
	}

	removeChart(id: string) {
		const chart = this.loadedCharts.find((c) => c.id === id);
		if (chart?.imageBlobUrl && chart.imageBlobUrl.startsWith('blob:')) {
			URL.revokeObjectURL(chart.imageBlobUrl);
		}
		this.loadedCharts = this.loadedCharts.filter((c) => c.id !== id);
	}

	setOpacity(id: string, opacity: number) {
		const chart = this.loadedCharts.find((c) => c.id === id);
		if (chart) {
			chart.opacity = Math.max(0, Math.min(1, opacity));
		}
	}

	toggleVisibility(id: string) {
		const chart = this.loadedCharts.find((c) => c.id === id);
		if (chart) {
			chart.visible = !chart.visible;
		}
	}

	async loadOnlineCatalogItem(item: EnaireCatalogItem): Promise<ChartOverlay> {
		this.isLoadingChart = true;
		this.errorMessage = null;
		try {
			const overlay = await chartGeoreferencer.loadOnlineChart(item);
			this.addChart(overlay);
			return overlay;
		} catch (e: any) {
			this.errorMessage = `Failed loading online chart: ${e?.message || e}`;
			throw e;
		} finally {
			this.isLoadingChart = false;
		}
	}

	clearCharts() {
		this.loadedCharts.forEach((c) => {
			if (c.imageBlobUrl && c.imageBlobUrl.startsWith('blob:')) {
				URL.revokeObjectURL(c.imageBlobUrl);
			}
		});
		this.loadedCharts = [];
	}
}

export const chartStore = new ChartState();
