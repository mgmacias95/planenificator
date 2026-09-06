import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeLiveAipVacIndex, parseAipHtmlToVacCatalog } from '$lib/services/vac';
import { VacBriefingState } from '$lib/state/vac-briefing.svelte';

const SAMPLE_AIP_HTML = `
<!DOCTYPE html>
<html>
<body>
<a id="LECO" class="anclaSeccion noPadding" migapan="AIP / AD / AD 2 / LECO"></a>
<div class="seccionAIPTítulo">
	<h1>LECO</h1>
	<h2 class="conDescripcion">A CORUÑA</h2>
</div>
<table class="enlaces">
	<tr>
		<td class="id">AD 2 LECO VAC 1</td>
		<td class="desc">VAC 1</td>
		<td><a href="contenido_AIP/AD/AD2/LECO/LE_AD_2_LECO_VAC_1_es.pdf">PDF</a></td>
	</tr>
</table>

<a id="LEBA" class="anclaSeccion noPadding" migapan="AIP / AD / AD 2 / LEBA"></a>
<div class="seccionAIPTítulo">
	<h1>LEBA</h1>
	<h2 class="conDescripcion">CÓRDOBA</h2>
</div>
<table class="enlaces">
	<tr>
		<td class="id">AD 2 LEBA VAC 1</td>
		<td class="desc">VAC 1</td>
		<td><a href="contenido_AIP/AD/AD2/LEBA/LE_AD_2_LEBA_VAC_1_es.pdf">PDF</a></td>
	</tr>
</table>

<a id="LECU/LEVS" class="anclaSeccion noPadding" migapan="AIP / AD / AD 2 / LECU/LEVS"></a>
<div class="seccionAIPTítulo">
	<h1>LECU/LEVS</h1>
	<h2 class="conDescripcion">MADRID/Cuatro Vientos</h2>
</div>
<table class="enlaces">
	<tr>
		<td class="id">AD 2 LECU LEVS VAC 1</td>
		<td class="desc">VAC 1</td>
		<td><a href="contenido_AIP/AD/AD2/LECU_LEVS/LE_AD_2_LECU_LEVS_VAC_1_en.pdf">PDF</a></td>
	</tr>
</table>

<a id="LETO" class="anclaSeccion noPadding" migapan="AIP / AD / AD 2 / LETO"></a>
<div class="seccionAIPTítulo">
	<h1>LETO</h1>
	<h2 class="conDescripcion">MADRID/Torrejón</h2>
</div>
<table class="enlaces">
	<tr>
		<td class="id">AD 2 LETO VAC 1</td>
		<td class="desc">VAC 1 - CORREDOR SUR VFR REACTORES</td>
		<td><a href="contenido_AIP/AD/AD2/LETO/LE_AD_2_LETO_VAC_1_en.pdf">PDF</a></td>
	</tr>
	<tr>
		<td class="id">AD 2 LETO VAC 2</td>
		<td class="desc">VAC 2 - CORREDOR ZULU VFR REACTORES</td>
		<td><a href="contenido_AIP/AD/AD2/LETO/LE_AD_2_LETO_VAC_2_en.pdf">PDF</a></td>
	</tr>
</table>

<a id="LEDE" class="anclaSeccion noPadding" migapan="AIP / AD / AD 2 / LEDE"></a>
<div class="seccionAIPTítulo">
	<h1>LEDE</h1>
	<h2 class="conDescripcion">LA MOJONERA</h2>
</div>
<table class="enlaces">
	<tr>
		<td class="id">AD 2 LEDE TEXT</td>
		<td class="desc">Texto sin VAC</td>
		<td><a href="contenido_AIP/AD/AD2/LEDE/LE_AD_2_LEDE_es.pdf">PDF</a></td>
	</tr>
</table>
</body>
</html>
`;

describe('ENAIRE AIP VAC Scraping & Parsing', () => {
	it('should parse aerodrome sections and extract VAC charts with full URLs', () => {
		const catalog = parseAipHtmlToVacCatalog(SAMPLE_AIP_HTML);

		expect(catalog['LEBA']).toBeDefined();
		expect(catalog['LEBA'].name).toBe('CÓRDOBA');
		expect(catalog['LEBA'].charts).toHaveLength(1);
		expect(catalog['LEBA'].charts[0].code).toBe('AD 2 LEBA VAC 1');
		expect(catalog['LEBA'].charts[0].url).toBe(
			'https://aip.enaire.es/AIP/contenido_AIP/AD/AD2/LEBA/LE_AD_2_LEBA_VAC_1_es.pdf'
		);
	});

	it('should index compound aerodromes individually (e.g. LECU and LEVS)', () => {
		const catalog = parseAipHtmlToVacCatalog(SAMPLE_AIP_HTML);

		expect(catalog['LECU']).toBeDefined();
		expect(catalog['LEVS']).toBeDefined();
		expect(catalog['LECU'].charts[0].url).toContain('LECU_LEVS');
		expect(catalog['LEVS'].charts[0].url).toContain('LECU_LEVS');
	});

	it('should extract multiple VAC charts for aerodromes with multiple procedures', () => {
		const catalog = parseAipHtmlToVacCatalog(SAMPLE_AIP_HTML);

		expect(catalog['LETO']).toBeDefined();
		expect(catalog['LETO'].charts).toHaveLength(2);
		expect(catalog['LETO'].charts[0].code).toBe('AD 2 LETO VAC 1');
		expect(catalog['LETO'].charts[1].code).toBe('AD 2 LETO VAC 2');
	});

	it('should ignore aerodromes without any published VAC charts', () => {
		const catalog = parseAipHtmlToVacCatalog(SAMPLE_AIP_HTML);

		expect(catalog['LEDE']).toBeUndefined();
	});

	it('should scrape live AIP index for requested departure, destination, and alternates', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => SAMPLE_AIP_HTML
		});
		vi.stubGlobal('fetch', fetchMock);

		const data = await scrapeLiveAipVacIndex([
			{ icao: 'LEBA', role: 'DEP' },
			{ icao: 'LECU', role: 'DEST' },
			{ icao: 'LEDE', role: 'ALT' }
		]);

		expect(fetchMock).toHaveBeenCalled();
		expect(data).toHaveLength(3);

		const dep = data.find((d) => d.role === 'DEP');
		expect(dep?.icao).toBe('LEBA');
		expect(dep?.name).toBe('CÓRDOBA');
		expect(dep?.charts).toHaveLength(1);

		const dest = data.find((d) => d.role === 'DEST');
		expect(dest?.icao).toBe('LECU');
		expect(dest?.charts).toHaveLength(1);

		const alt = data.find((d) => d.role === 'ALT');
		expect(alt?.icao).toBe('LEDE');
		expect(alt?.charts).toHaveLength(0); // No VAC in AIP for LEDE

		vi.unstubAllGlobals();
	});

	it('should not duplicate aerodromes when departure and destination are the same', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => SAMPLE_AIP_HTML
		});
		vi.stubGlobal('fetch', fetchMock);

		const { scrapeAndRenderAllVacCharts } = await import('$lib/services/vac');
		const results = await scrapeAndRenderAllVacCharts('LEBA', 'LEBA', ['LEBA']);

		// Only one request for LEBA should be processed
		expect(results).toHaveLength(1);
		expect(results[0].icao).toBe('LEBA');
		expect(results[0].role).toBe('DEP');

		vi.unstubAllGlobals();
	});

	it('should deduplicate alternate aerodromes matching departure or destination', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => SAMPLE_AIP_HTML
		});
		vi.stubGlobal('fetch', fetchMock);

		const { scrapeAndRenderAllVacCharts } = await import('$lib/services/vac');
		const results = await scrapeAndRenderAllVacCharts('LEBA', 'LECU', ['LEBA', 'LECU', 'LETO']);

		// Should have LEBA (DEP), LECU (DEST), and LETO (ALT) - no duplicates
		expect(results).toHaveLength(3);
		expect(results.map((r) => r.icao)).toEqual(['LEBA', 'LECU', 'LETO']);

		vi.unstubAllGlobals();
	});
});

describe('VacBriefingState', () => {
	it('should avoid duplicate requests when aerodrome fingerprint does not change', async () => {
		const store = new VacBriefingState();

		const mockScrape = vi.fn().mockResolvedValue([
			{
				icao: 'LEBA',
				role: 'DEP',
				name: 'CÓRDOBA',
				charts: []
			}
		]);

		// Monkey-patch scrape function
		vi.spyOn(await import('$lib/services/vac'), 'scrapeAndRenderAllVacCharts').mockImplementation(
			mockScrape
		);

		await store.loadVacCharts('LEBA', 'LECU', ['LEDE']);
		expect(mockScrape).toHaveBeenCalledTimes(1);

		// Second call with exact same aerodromes should not re-trigger fetch if already loaded
		await store.loadVacCharts('LEBA', 'LECU', ['LEDE']);
		expect(mockScrape).toHaveBeenCalledTimes(1);

		// With force=true, it should reload
		await store.loadVacCharts('LEBA', 'LECU', ['LEDE'], true);
		expect(mockScrape).toHaveBeenCalledTimes(2);

		vi.restoreAllMocks();
	});
});
