import proj4 from 'proj4';
import { fromArrayBuffer as tiffFromArrayBuffer } from 'geotiff';
import * as fflate from 'fflate';
import type { ChartOverlay } from '$lib/types/flight';

export interface WorldFileMetrics {
	pixelScaleX: number;
	rotationY: number;
	rotationX: number;
	pixelScaleY: number;
	originX: number;
	originY: number;
}

export interface EnaireCatalogItem {
	id: string;
	name: string;
	downloadUrl: string;
	region: string;
	isCanaries?: boolean;
}

export interface IChartGeoreferencer {
	parseWorldFile(tfwContent: string): WorldFileMetrics;
	projectToWgs84(x: number, y: number, isCanaries?: boolean): { lat: number; lng: number };
	unpackZipChart(
		zipBuffer: ArrayBuffer
	): Promise<{ tiffBuffer: ArrayBuffer; tfwText: string; filename: string }>;
	processRasterChart(name: string, tiffBuffer: ArrayBuffer, tfwText: string): Promise<ChartOverlay>;
	fetchEnaireCatalog(): Promise<EnaireCatalogItem[]>;
	loadOnlineChart(catalogItem: EnaireCatalogItem): Promise<ChartOverlay>;
}

// Setup CRS for Spanish Lambert Conformal Conic (LCC)
if (!proj4.defs('ENAIRE:LE')) {
	proj4.defs(
		'ENAIRE:LE',
		'+proj=lcc +lat_0=40 +lon_0=-4 +lat_1=37 +lat_2=42 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'
	);
}
if (!proj4.defs('ENAIRE:GC')) {
	proj4.defs(
		'ENAIRE:GC',
		'+proj=lcc +lat_0=26 +lon_0=-17 +lat_1=24 +lat_2=29 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'
	);
}

export class ChartGeoreferencer implements IChartGeoreferencer {
	parseWorldFile(tfwContent: string): WorldFileMetrics {
		const lines = tfwContent
			.trim()
			.split(/\r?\n/)
			.map((line) => parseFloat(line.trim()))
			.filter((val) => !isNaN(val));

		if (lines.length < 6) {
			throw new Error('Invalid World File (.TFW): expected 6 numerical parameters');
		}

		const [pixelScaleX, rotationY, rotationX, pixelScaleY, originX, originY] = lines;
		return { pixelScaleX, rotationY, rotationX, pixelScaleY, originX, originY };
	}

	projectToWgs84(x: number, y: number, isCanaries: boolean = false): { lat: number; lng: number } {
		const targetCrs = isCanaries ? 'ENAIRE:GC' : 'ENAIRE:LE';
		const [lng, lat] = proj4(targetCrs, 'WGS84', [x, y]);
		return { lat, lng };
	}

	async unpackZipChart(
		zipBuffer: ArrayBuffer
	): Promise<{ tiffBuffer: ArrayBuffer; tfwText: string; filename: string }> {
		const zipped = new Uint8Array(zipBuffer);
		const unzipped = fflate.unzipSync(zipped);

		let tfwText: string | null = null;
		let tiffBuffer: ArrayBuffer | null = null;
		let baseFilename = 'chart';

		for (const [filePath, data] of Object.entries(unzipped)) {
			const lower = filePath.toLowerCase();
			if (lower.endsWith('.tfw')) {
				tfwText = new TextDecoder().decode(data);
			} else if (lower.endsWith('.tif') || lower.endsWith('.tiff')) {
				tiffBuffer = data.slice().buffer;
				baseFilename = filePath.replace(/\.[^/.]+$/, '');
			}
		}

		if (!tfwText || !tiffBuffer) {
			throw new Error('ZIP chart archive must contain both a .TFW and a .TIF file');
		}

		return { tiffBuffer, tfwText, filename: baseFilename };
	}

	async processRasterChart(
		name: string,
		tiffBuffer: ArrayBuffer,
		tfwText: string
	): Promise<ChartOverlay> {
		const metrics = this.parseWorldFile(tfwText);
		const tiff = await tiffFromArrayBuffer(tiffBuffer);
		const image = await tiff.getImage();
		const width = image.getWidth();
		const height = image.getHeight();

		const isCanaries = name.toLowerCase().includes('gc') || name.toLowerCase().includes('canarias');
		const isProjected = Math.abs(metrics.originX) > 180 || Math.abs(metrics.originY) > 90;

		let southWest: [number, number];
		let northEast: [number, number];

		if (isProjected) {
			const corners = [
				this.projectToWgs84(metrics.originX, metrics.originY, isCanaries),
				this.projectToWgs84(
					metrics.originX + metrics.pixelScaleX * width,
					metrics.originY,
					isCanaries
				),
				this.projectToWgs84(
					metrics.originX,
					metrics.originY + metrics.pixelScaleY * height,
					isCanaries
				),
				this.projectToWgs84(
					metrics.originX + metrics.pixelScaleX * width,
					metrics.originY + metrics.pixelScaleY * height,
					isCanaries
				)
			];

			const lats = corners.map((c) => c.lat);
			const lngs = corners.map((c) => c.lng);

			southWest = [Math.min(...lats), Math.min(...lngs)];
			northEast = [Math.max(...lats), Math.max(...lngs)];
		} else {
			const latSW = metrics.originY + metrics.pixelScaleY * height;
			const lngSW = metrics.originX;
			const latNE = metrics.originY;
			const lngNE = metrics.originX + metrics.pixelScaleX * width;

			southWest = [Math.min(latSW, latNE), Math.min(lngSW, lngNE)];
			northEast = [Math.max(latSW, latNE), Math.max(lngSW, lngNE)];
		}

		const MAX_DIM = 8192;
		let scale = 1;
		if (width > MAX_DIM || height > MAX_DIM) {
			scale = MAX_DIM / Math.max(width, height);
		}
		const canvasWidth = Math.round(width * scale);
		const canvasHeight = Math.round(height * scale);

		let rgbData: any;
		try {
			const rgb = await image.readRGB({
				width: canvasWidth,
				height: canvasHeight
			});
			rgbData = rgb;
		} catch {
			const rasters = await image.readRasters({
				width: canvasWidth,
				height: canvasHeight
			});
			const fileDir = image.getFileDirectory() as { ColorMap?: number[] };
			const colorMap = fileDir.ColorMap;

			if (colorMap && colorMap.length >= 768 && rasters[0]) {
				const indices = rasters[0] as unknown as ArrayLike<number>;
				const totalPixels = canvasWidth * canvasHeight;
				const r = new Uint8Array(totalPixels);
				const g = new Uint8Array(totalPixels);
				const b = new Uint8Array(totalPixels);
				const is16Bit = colorMap.some((v: number) => v > 255);
				const factor = is16Bit ? 256 : 1;

				for (let k = 0; k < indices.length && k < totalPixels; k++) {
					const idx = indices[k];
					r[k] = Math.floor((colorMap[idx] || 0) / factor);
					g[k] = Math.floor((colorMap[idx + 256] || 0) / factor);
					b[k] = Math.floor((colorMap[idx + 512] || 0) / factor);
				}
				rgbData = [r, g, b];
			} else {
				const r = (rasters[0] || []) as unknown as ArrayLike<number>;
				const g = (rasters[1] || r) as unknown as ArrayLike<number>;
				const b = (rasters[2] || r) as unknown as ArrayLike<number>;
				const a = rasters[3] as unknown as ArrayLike<number> | undefined;
				rgbData = a ? [r, g, b, a] : [r, g, b];
			}
		}

		let canvasElement: HTMLCanvasElement | undefined;
		let imageBlobUrl: string | undefined;

		if (typeof document !== 'undefined') {
			const canvas = document.createElement('canvas');
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				const imgData = ctx.createImageData(canvasWidth, canvasHeight);
				const data = imgData.data;

				if (Array.isArray(rgbData)) {
					const r = rgbData[0] as unknown as ArrayLike<number>;
					const g = (rgbData[1] || r) as unknown as ArrayLike<number>;
					const b = (rgbData[2] || r) as unknown as ArrayLike<number>;
					const a = rgbData[3] as unknown as ArrayLike<number> | undefined;
					const total = Math.min(r.length, canvasWidth * canvasHeight);

					for (let p = 0, j = 0; p < total; p++, j += 4) {
						data[j] = r[p];
						data[j + 1] = g[p];
						data[j + 2] = b[p];
						data[j + 3] = a ? a[p] : 255;
					}
				} else {
					const len = Math.min(rgbData.length, canvasWidth * canvasHeight * 3);
					for (let i = 0, j = 0; i < len && j < data.length; i += 3, j += 4) {
						data[j] = rgbData[i];
						data[j + 1] = rgbData[i + 1];
						data[j + 2] = rgbData[i + 2];
						data[j + 3] = 255;
					}
				}

				ctx.putImageData(imgData, 0, 0);
				canvasElement = canvas;

				const blob = await new Promise<Blob | null>((resolve) =>
					canvas.toBlob(resolve, 'image/png')
				);
				if (blob) {
					imageBlobUrl = URL.createObjectURL(blob);
				} else {
					imageBlobUrl = canvas.toDataURL('image/png');
				}
			}
		}

		return {
			id: `chart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
			name,
			bounds: {
				southWest,
				northEast
			},
			canvasElement,
			sourceCanvas: canvasElement,
			tfwParams: metrics,
			scale,
			isCanaries,
			imageBlobUrl,
			opacity: 0.85,
			visible: true,
			sourceType: 'user_upload'
		};
	}

	async fetchEnaireCatalog(): Promise<EnaireCatalogItem[]> {
		const catalogUrl = 'https://aip.enaire.es/AIP/CartasInsigniaImpresas-es.html';
		try {
			const response = await fetch(catalogUrl);
			if (!response.ok) throw new Error(`HTTP error ${response.status}`);
			const html = await response.text();

			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');
			const rows = Array.from(doc.querySelectorAll('table.cartasVFR500 tr'));
			const items: EnaireCatalogItem[] = [];

			rows.forEach((row) => {
				const descCell = row.querySelector('td.desc');
				if (!descCell) return;
				const descText = descCell.textContent?.trim() || '';

				const zipLinks = Array.from(row.querySelectorAll('a[href$=".zip"]'));
				zipLinks.forEach((link, idx) => {
					let href = link.getAttribute('href');
					if (href) {
						if (href.startsWith('..')) {
							href = 'https://aip.enaire.es/' + href.replace(/^\.\.\//, '');
						} else if (href.startsWith('/')) {
							href = 'https://aip.enaire.es' + href;
						} else if (!href.startsWith('http')) {
							href = 'https://aip.enaire.es/recursos/descargas/VFR500/' + href;
						}

						const title = link.getAttribute('title') || 'GeoTiff';
						const fullName = zipLinks.length > 1 ? `${descText} (${title})` : descText;
						const isCanaries =
							fullName.toLowerCase().includes('gc') || fullName.toLowerCase().includes('canarias');

						items.push({
							id: `enaire_${idx}_${Math.random().toString(36).substring(2, 6)}`,
							name: fullName,
							downloadUrl: href,
							region: isCanaries ? 'Canary Islands' : 'Mainland Spain',
							isCanaries
						});
					}
				});
			});

			return items;
		} catch (e) {
			console.warn('Failed to fetch online ENAIRE catalog:', e);
			return [
				{
					id: 'enaire_madrid',
					name: 'ENAIRE VFR 1:500k Madrid',
					downloadUrl:
						'https://aip.enaire.es/recursos/descargas/VFR500/LE_VFR500_4_MADRID_GEOTIFF.zip',
					region: 'Mainland Spain',
					isCanaries: false
				},
				{
					id: 'enaire_sevilla',
					name: 'ENAIRE VFR 1:500k Sevilla',
					downloadUrl:
						'https://aip.enaire.es/recursos/descargas/VFR500/LE_VFR500_7_SEVILLA_GEOTIFF.zip',
					region: 'Mainland Spain',
					isCanaries: false
				},
				{
					id: 'enaire_barcelona',
					name: 'ENAIRE VFR 1:500k Barcelona',
					downloadUrl:
						'https://aip.enaire.es/recursos/descargas/VFR500/LE_VFR500_3_BARCELONA_GEOTIFF.zip',
					region: 'Mainland Spain',
					isCanaries: false
				}
			];
		}
	}

	async loadOnlineChart(catalogItem: EnaireCatalogItem): Promise<ChartOverlay> {
		const response = await fetch(catalogItem.downloadUrl);
		if (!response.ok) {
			throw new Error(`Failed to download chart from ${catalogItem.downloadUrl}`);
		}
		const zipBuffer = await response.arrayBuffer();
		const { tiffBuffer, tfwText } = await this.unpackZipChart(zipBuffer);
		const overlay = await this.processRasterChart(catalogItem.name, tiffBuffer, tfwText);
		overlay.sourceType = 'online_catalog';
		overlay.sourceUrl = catalogItem.downloadUrl;
		return overlay;
	}
}

export const chartGeoreferencer = new ChartGeoreferencer();
