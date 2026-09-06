import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
	pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export interface VacChartItem {
	code: string;
	name: string;
	url: string;
}

export interface AerodromeVacData {
	icao: string;
	name: string;
	role: 'DEP' | 'DEST' | 'ALT';
	charts: VacChartItem[];
}

export interface VacPageImage {
	pageNumber: number;
	dataUrl: string;
	width: number;
	height: number;
}

export interface RenderedVacChart {
	chart: VacChartItem;
	aerodromeIcao: string;
	aerodromeName: string;
	role: 'DEP' | 'DEST' | 'ALT';
	pages: VacPageImage[];
	error?: string;
}

export interface AerodromeVacResult {
	icao: string;
	role: 'DEP' | 'DEST' | 'ALT';
	name?: string;
	charts: RenderedVacChart[];
	noChartsFound?: boolean;
	error?: string;
}

/**
 * Parses ENAIRE AIP HTML to extract all published VAC charts for each aerodrome.
 */
export function parseAipHtmlToVacCatalog(
	html: string
): Record<string, { icao: string; name: string; charts: VacChartItem[] }> {
	const sections = html.split(
		/<a id="([^"]+)" class="anclaSeccion[^"]*"[^>]*migapan\s*=\s*"([^"]*AD[^"]*)"[^>]*><\/a>/
	);
	const catalog: Record<string, { icao: string; name: string; charts: VacChartItem[] }> = {};

	for (let i = 1; i < sections.length; i += 3) {
		const aid = sections[i].trim();
		const content = sections[i + 2];

		const nameMatch = content.match(
			/<div class="seccionAIPTítulo"[^>]*>\s*<h1[^>]*>([^<]+)<\/h1>\s*<h2[^>]*>([^<]+)<\/h2>/
		);
		const name = nameMatch ? nameMatch[2].trim() : aid;

		const trMatches = content.match(
			/<tr\b[^>]*>(?:(?!<\/tr>).)*?_VAC_(?:(?!<\/tr>).)*?<\/tr>/gs
		);
		if (!trMatches) continue;

		const charts: VacChartItem[] = [];
		for (const tr of trMatches) {
			const idMatch = tr.match(/<td class="id"[^>]*>(.*?)<\/td>/s);
			const descMatch = tr.match(/<td class="desc"[^>]*>(.*?)<\/td>/s);
			const pdfMatch = tr.match(/href="([^"]*_VAC_[^"]*\.pdf)"/s);

			const chartId = idMatch ? idMatch[1].replace(/<[^>]+>/g, '').trim() : '';
			const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
			const pdf = pdfMatch ? pdfMatch[1].trim() : '';

			if (pdf) {
				const fullUrl = pdf.startsWith('http')
					? pdf
					: `https://aip.enaire.es/AIP/${pdf.replace(/^\/+/, '')}`;

				charts.push({
					code: chartId,
					name: desc || chartId,
					url: fullUrl
				});
			}
		}

		if (charts.length > 0) {
			const entry = { icao: aid, name, charts };
			catalog[aid] = entry;
			if (aid.includes('/')) {
				for (const sub of aid.split('/')) {
					catalog[sub.trim()] = entry;
				}
			} else if (aid.includes('_')) {
				for (const sub of aid.split('_')) {
					catalog[sub.trim()] = entry;
				}
			}
		}
	}

	return catalog;
}

/**
 * Scrapes the live ENAIRE AIP index page to extract VAC charts for the given aerodromes.
 * Uses clean standard GET request with no custom headers to avoid CORS preflight rejection.
 */
export async function scrapeLiveAipVacIndex(
	icaos: { icao: string; role: 'DEP' | 'DEST' | 'ALT' }[]
): Promise<AerodromeVacData[]> {
	const validIcaos = icaos
		.map((item) => ({ ...item, icao: item.icao.trim().toUpperCase() }))
		.filter((item) => item.icao.length > 0);

	if (validIcaos.length === 0) return [];

	const catalogUrl = `https://aip.enaire.es/AIP/AIP-es.html?_t=${Date.now()}`;
	const response = await fetch(catalogUrl);

	if (!response.ok) {
		throw new Error(`Failed to fetch live ENAIRE AIP index (${response.status}: ${response.statusText})`);
	}

	const html = await response.text();
	const catalog = parseAipHtmlToVacCatalog(html);

	const results: AerodromeVacData[] = [];

	for (const req of validIcaos) {
		const reqCode = req.icao;
		const matched =
			catalog[reqCode] ||
			Object.values(catalog).find((entry) => {
				const parts = entry.icao.split(/[/_]/).map((p) => p.trim().toUpperCase());
				return parts.includes(reqCode);
			});

		if (matched) {
			results.push({
				icao: reqCode,
				name: matched.name,
				role: req.role,
				charts: matched.charts
			});
		} else {
			results.push({
				icao: reqCode,
				name: '',
				role: req.role,
				charts: []
			});
		}
	}

	return results;
}

/**
 * Renders all pages of a PDF ArrayBuffer into high-resolution PNG data URLs.
 * Uses in-thread rendering with 2.0x scale for crisp, clean A4 print output.
 */
export async function renderPdfPagesToImages(
	pdfBuffer: ArrayBuffer,
	scale: number = 2.0
): Promise<VacPageImage[]> {
	if (typeof window === 'undefined') {
		return [];
	}

	console.log('[VAC] renderPdfPagesToImages: starting with buffer size:', pdfBuffer.byteLength);
	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(pdfBuffer),
		cMapPacked: true
	});
	const pdfDoc = await loadingTask.promise;
	console.log('[VAC] PDF loaded, numPages:', pdfDoc.numPages);
	const pages: VacPageImage[] = [];

	for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
		console.log('[VAC] Rendering page:', pageNum);
		const page = await pdfDoc.getPage(pageNum);
		const viewport = page.getViewport({ scale });

		const canvas = document.createElement('canvas');
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Unable to create 2D canvas context for PDF rendering');
		}

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		await page.render({
			canvas,
			canvasContext: ctx,
			viewport
		}).promise;

		const dataUrl = canvas.toDataURL('image/png');
		console.log('[VAC] Page', pageNum, 'rendered to dataUrl length:', dataUrl.length);
		pages.push({
			pageNumber: pageNum,
			dataUrl,
			width: canvas.width,
			height: canvas.height
		});
	}

	return pages;
}

/**
 * Fetches the latest published PDF for a VAC chart from ENAIRE AIP live,
 * and renders each page to high-res images for print/display.
 */
export async function loadAndRenderVacChart(
	chart: VacChartItem,
	role: 'DEP' | 'DEST' | 'ALT',
	aerodromeIcao: string,
	aerodromeName: string
): Promise<RenderedVacChart> {
	try {
		console.log('[VAC] loadAndRenderVacChart: fetching', chart.code, chart.url);
		const pdfUrl = chart.url.includes('?') ? `${chart.url}&_t=${Date.now()}` : `${chart.url}?_t=${Date.now()}`;
		const response = await fetch(pdfUrl);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status} when fetching PDF`);
		}

		const buffer = await response.arrayBuffer();
		console.log('[VAC] Fetched buffer for', chart.code, 'bytes:', buffer.byteLength);
		const pages = await renderPdfPagesToImages(buffer);

		return {
			chart,
			aerodromeIcao,
			aerodromeName,
			role,
			pages
		};
	} catch (err: any) {
		console.error(`Failed downloading or rendering VAC chart ${chart.code} (${chart.url}):`, err);
		return {
			chart,
			aerodromeIcao,
			aerodromeName,
			role,
			pages: [],
			error: err?.message || 'Failed to download or render chart PDF'
		};
	}
}

/**
 * High-level function to scrape and render all VAC charts for departure, destination,
 * and alternate aerodromes on the fly.
 */
export async function scrapeAndRenderAllVacCharts(
	depIcao: string,
	destIcao: string,
	altIcaos: string[]
): Promise<AerodromeVacResult[]> {
	const requests: { icao: string; role: 'DEP' | 'DEST' | 'ALT' }[] = [];
	const seenIcaos = new Set<string>();

	const dep = (depIcao || '').trim().toUpperCase();
	if (dep) {
		requests.push({ icao: dep, role: 'DEP' });
		seenIcaos.add(dep);
	}

	const dest = (destIcao || '').trim().toUpperCase();
	if (dest && !seenIcaos.has(dest)) {
		requests.push({ icao: dest, role: 'DEST' });
		seenIcaos.add(dest);
	}

	for (const altRaw of altIcaos || []) {
		const alt = (altRaw || '').trim().toUpperCase();
		if (alt && !seenIcaos.has(alt)) {
			requests.push({ icao: alt, role: 'ALT' });
			seenIcaos.add(alt);
		}
	}

	if (requests.length === 0) {
		return [];
	}

	try {
		const aerodromesData = await scrapeLiveAipVacIndex(requests);
		const results: AerodromeVacResult[] = [];
		const seenChartUrls = new Set<string>();

		for (const ad of aerodromesData) {
			if (ad.charts.length === 0) {
				results.push({
					icao: ad.icao,
					role: ad.role,
					name: ad.name,
					charts: [],
					noChartsFound: true
				});
				continue;
			}

			// Deduplicate charts across aerodromes (e.g. compound aerodromes with identical PDF URLs)
			const uniqueCharts = ad.charts.filter((chart) => {
				const urlKey = chart.url.toLowerCase();
				if (seenChartUrls.has(urlKey)) {
					return false;
				}
				seenChartUrls.add(urlKey);
				return true;
			});

			if (uniqueCharts.length === 0) {
				continue;
			}

			const renderedCharts = await Promise.all(
				uniqueCharts.map((chart) =>
					loadAndRenderVacChart(chart, ad.role, ad.icao, ad.name)
				)
			);

			results.push({
				icao: ad.icao,
				role: ad.role,
				name: ad.name,
				charts: renderedCharts
			});
		}

		return results;
	} catch (err: any) {
		console.error('Error during on-the-fly VAC scraping:', err);
		return requests.map((r) => ({
			icao: r.icao,
			role: r.role,
			charts: [],
			error: err?.message || 'Error scraping ENAIRE AIP'
		}));
	}
}
