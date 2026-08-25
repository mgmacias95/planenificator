import { describe, it, expect } from 'vitest';
import { ChartGeoreferencer } from '$lib/services/georef';

describe('Chart Georeferencer & World File Parser', () => {
	const georef = new ChartGeoreferencer();

	it('should accurately parse 6-parameter World File (.TFW)', () => {
		const sampleTfw = `
      50.0
      0.0
      0.0
      -50.0
      440000.0
      4480000.0
    `;

		const metrics = georef.parseWorldFile(sampleTfw);
		expect(metrics.pixelScaleX).toBe(50.0);
		expect(metrics.pixelScaleY).toBe(-50.0);
		expect(metrics.rotationY).toBe(0.0);
		expect(metrics.rotationX).toBe(0.0);
		expect(metrics.originX).toBe(440000.0);
		expect(metrics.originY).toBe(4480000.0);
	});

	it('should throw descriptive error on invalid TFW content', () => {
		expect(() => georef.parseWorldFile('invalid text')).toThrow('Invalid World File');
	});

	it('should project Spanish Lambert Conformal Conic coordinates to WGS84 LatLng', () => {
		// Madrid center approximate LCC coordinates
		const { lat, lng } = georef.projectToWgs84(0, 0, false);
		// Origin for ENAIRE:LE is lat_0=40, lon_0=-4
		expect(lat).toBeCloseTo(40, 1);
		expect(lng).toBeCloseTo(-4, 1);
	});

	it('should accurately project Canary Islands LCC coordinates', () => {
		// Canary Islands center LCC origin: lat_0=26, lon_0=-17
		const { lat, lng } = georef.projectToWgs84(0, 0, true);
		expect(lat).toBeCloseTo(26, 1);
		expect(lng).toBeCloseTo(-17, 1);
	});

	it('should provide fallback ENAIRE catalog items when network unavailable', async () => {
		const items = await georef.fetchEnaireCatalog();
		expect(items.length).toBeGreaterThan(0);
		expect(items[0]).toHaveProperty('downloadUrl');
		expect(items[0]).toHaveProperty('name');
	});

	it('should manage loaded charts state correctly in ChartState', async () => {
		const { ChartState } = await import('$lib/state/charts.svelte');
		const store = new ChartState();

		const sampleChart = {
			id: 'test_chart_1',
			name: 'Test Chart',
			bounds: {
				southWest: [39.0, -5.0] as [number, number],
				northEast: [41.0, -3.0] as [number, number]
			},
			opacity: 0.85,
			visible: true,
			sourceType: 'user_upload' as const
		};

		store.addChart(sampleChart);
		expect(store.loadedCharts.length).toBe(1);
		expect(store.loadedCharts[0].id).toBe('test_chart_1');

		store.setOpacity('test_chart_1', 0.5);
		expect(store.loadedCharts[0].opacity).toBe(0.5);

		store.toggleVisibility('test_chart_1');
		expect(store.loadedCharts[0].visible).toBe(false);

		store.removeChart('test_chart_1');
		expect(store.loadedCharts.length).toBe(0);
	});

	it('should successfully unpack real 2026_LE5_CENTROSUR.zip chart if present', async () => {
		const fs = await import('node:fs');
		const zipPath = '/home/wocat/2026_LE5_CENTROSUR.zip';
		if (fs.existsSync(zipPath)) {
			const buf = fs.readFileSync(zipPath).buffer;
			const { tiffBuffer, tfwText, filename } = await georef.unpackZipChart(buf);
			expect(tiffBuffer.byteLength).toBeGreaterThan(0);
			expect(filename).toBe('2026_LE5_CENTROSUR');
			expect(tfwText).toBeTruthy();

			const metrics = georef.parseWorldFile(tfwText);
			expect(metrics.pixelScaleX).toBeCloseTo(42.33, 1);
			expect(metrics.pixelScaleY).toBeCloseTo(-42.33, 1);
		}
	});
});
