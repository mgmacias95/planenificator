import proj4 from 'proj4';
import { fromArrayBuffer as tiffFromArrayBuffer } from 'geotiff';
import * as fflate from 'fflate';
import type { ChartOverlay } from '$lib/types/flight';
import ChartProcessorWorker from '$lib/workers/chart-processor.worker?worker';

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

// Setup CRS definitions for Spanish Lambert Conformal Conic (LCC) and Web Mercator
if (!proj4.defs('EPSG:3857')) {
	proj4.defs(
		'EPSG:3857',
		'+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs'
	);
}
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
				baseFilename = filePath.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '');
			}
		}

		if (!tiffBuffer) {
			throw new Error('ZIP chart archive must contain a .TIF or .TIFF file');
		}

		return { tiffBuffer, tfwText: tfwText || '', filename: baseFilename };
	}

	async processRasterChart(
		name: string,
		tiffBuffer: ArrayBuffer,
		tfwText: string
	): Promise<ChartOverlay> {
		const isCanaries = name.toLowerCase().includes('gc') || name.toLowerCase().includes('canarias');

		// 1. Try background Web Worker first to keep the UI completely fluid
		if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
			try {
				const overlay = await new Promise<ChartOverlay>((resolve, reject) => {
					const worker = new ChartProcessorWorker();
					worker.onmessage = (e: MessageEvent<any>) => {
						worker.terminate();
						if (e.data?.success) {
							const blob = e.data.blob;
							const imageBlobUrl = blob ? URL.createObjectURL(blob) : undefined;
							resolve({
								id: `chart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
								name: e.data.name || name,
								bounds: e.data.bounds,
								scale: 1,
								isCanaries,
								imageBlobUrl,
								opacity: 0.85,
								visible: true,
								sourceType: 'user_upload'
							});
						} else {
							reject(new Error(e.data?.error || 'Worker failed processing chart'));
						}
					};
					worker.onerror = (err) => {
						worker.terminate();
						reject(err);
					};
					worker.postMessage({ name, tiffBuffer, tfwText });
				});
				return overlay;
			} catch (e) {
				console.warn('Web Worker chart processing failed, falling back to main thread:', e);
			}
		}
		const tiff = await tiffFromArrayBuffer(tiffBuffer);
		const image = await tiff.getImage();
		const srcWidth = image.getWidth();
		const srcHeight = image.getHeight();

		let metrics: WorldFileMetrics;
		if (tfwText && tfwText.trim()) {
			metrics = this.parseWorldFile(tfwText);
		} else {
			// Extract from GeoTIFF embedded tags if TFW is missing
			const fileDir = image.getFileDirectory() as any;
			const tiePoints = fileDir?.ModelTiepoint;
			const pixelScale = fileDir?.ModelPixelScale;
			const modelTrans = fileDir?.ModelTransformation;

			if (tiePoints && tiePoints.length >= 6 && pixelScale && pixelScale.length >= 2) {
				metrics = {
					originX: tiePoints[3] - tiePoints[0] * pixelScale[0],
					originY: tiePoints[4] + tiePoints[1] * pixelScale[1],
					pixelScaleX: pixelScale[0],
					pixelScaleY: -pixelScale[1],
					rotationX: 0,
					rotationY: 0
				};
			} else if (modelTrans && modelTrans.length >= 16) {
				metrics = {
					originX: modelTrans[3],
					originY: modelTrans[7],
					pixelScaleX: modelTrans[0],
					pixelScaleY: modelTrans[5],
					rotationX: modelTrans[1],
					rotationY: modelTrans[4]
				};
			} else {
				throw new Error(
					'Missing georeference metadata (.TFW file or embedded GeoTIFF tags required)'
				);
			}
		}

		const isProjected = Math.abs(metrics.originX) > 180 || Math.abs(metrics.originY) > 90;
		const targetCrs = isCanaries ? 'ENAIRE:GC' : 'ENAIRE:LE';

		const { originX, originY, pixelScaleX, pixelScaleY, rotationX = 0, rotationY = 0 } = metrics;
		const det = pixelScaleX * pixelScaleY - rotationX * rotationY;

		// 1. Sample perimeter points to determine exact Web Mercator and WGS84 bounding envelope
		const SAMPLES_PER_EDGE = 32;
		const samplePoints: [number, number][] = [];

		for (let i = 0; i <= SAMPLES_PER_EDGE; i++) {
			const u = i / SAMPLES_PER_EDGE;
			samplePoints.push([u * srcWidth, 0]); // Top edge
			samplePoints.push([u * srcWidth, srcHeight]); // Bottom edge
			samplePoints.push([0, u * srcHeight]); // Left edge
			samplePoints.push([srcWidth, u * srcHeight]); // Right edge
		}

		let minLng = Infinity,
			maxLng = -Infinity;
		let minLat = Infinity,
			maxLat = -Infinity;
		let minMercX = Infinity,
			maxMercX = -Infinity;
		let minMercY = Infinity,
			maxMercY = -Infinity;

		for (const [px, py] of samplePoints) {
			const x_m = originX + pixelScaleX * px + rotationX * py;
			const y_m = originY + rotationY * px + pixelScaleY * py;

			let lat: number, lng: number;
			if (isProjected) {
				const wgs = this.projectToWgs84(x_m, y_m, isCanaries);
				lat = wgs.lat;
				lng = wgs.lng;
			} else {
				lat = y_m;
				lng = x_m;
			}

			const [mx, my] = proj4('WGS84', 'EPSG:3857', [lng, lat]);

			minLng = Math.min(minLng, lng);
			maxLng = Math.max(maxLng, lng);
			minLat = Math.min(minLat, lat);
			maxLat = Math.max(maxLat, lat);

			minMercX = Math.min(minMercX, mx);
			maxMercX = Math.max(maxMercX, mx);
			minMercY = Math.min(minMercY, my);
			maxMercY = Math.max(maxMercY, my);
		}

		// Calculate WGS84 corners corresponding to the Web Mercator envelope for Leaflet
		const [swLng, swLat] = proj4('EPSG:3857', 'WGS84', [minMercX, minMercY]);
		const [neLng, neLat] = proj4('EPSG:3857', 'WGS84', [maxMercX, maxMercY]);
		const southWest: [number, number] = [swLat, swLng];
		const northEast: [number, number] = [neLat, neLng];

		// 2. Read source rasters (RGB / Palette / Grayscale)
		let rasters: any = null;
		let isInterleaved = false;
		let numChannels = 3;

		try {
			rasters = await image.readRGB();
			if (rasters) {
				isInterleaved = true;
				numChannels = Math.max(1, Math.round(rasters.length / (srcWidth * srcHeight)));
			}
		} catch {
			// Fall back to readRasters
		}

		if (!rasters) {
			try {
				rasters = await image.readRasters({ interleave: false });
				isInterleaved = false;
			} catch {
				rasters = await image.readRasters();
				if (Array.isArray(rasters)) {
					isInterleaved = false;
				} else {
					isInterleaved = true;
					numChannels = Math.max(1, Math.round((rasters?.length || 0) / (srcWidth * srcHeight)));
				}
			}
		}

		if (!rasters) {
			throw new Error('Failed to read image rasters from TIFF');
		}

		const fileDir = image.getFileDirectory() as { ColorMap?: number[]; PhotometricInterpretation?: number };
		const colorMap = fileDir?.ColorMap;
		const numColors = colorMap ? Math.floor(colorMap.length / 3) : 256;
		const isColorMapped = Boolean(
			colorMap && colorMap.length >= 768 && !isInterleaved && Array.isArray(rasters) && rasters[0]
		);
		const is16Bit = isColorMapped ? colorMap!.some((v: number) => v > 255) : false;
		const factor = is16Bit ? 256 : 1;

		const isBands = !isInterleaved && !isColorMapped && Array.isArray(rasters);
		const bandCount = isBands ? rasters.length : 0;
		const isCmyk =
			isBands &&
			bandCount >= 4 &&
			(fileDir?.PhotometricInterpretation === 5 || fileDir?.PhotometricInterpretation === undefined);

		const b0 = isBands && rasters[0] ? (rasters[0] as unknown as ArrayLike<number>) : null;
		const b1 = isBands && rasters[1] ? (rasters[1] as unknown as ArrayLike<number>) : b0;
		const b2 = isBands && rasters[2] ? (rasters[2] as unknown as ArrayLike<number>) : b0;
		const b3 = isBands && rasters[3] ? (rasters[3] as unknown as ArrayLike<number>) : null;
		const indices = isColorMapped ? (rasters[0] as unknown as ArrayLike<number>) : null;
		const flatRaster = !isColorMapped && !isBands ? (rasters as unknown as ArrayLike<number>) : null;
		const flatChannels = flatRaster
			? Math.max(1, Math.round(flatRaster.length / (srcWidth * srcHeight)))
			: 1;

		// 3. Determine output Web Mercator canvas dimensions
		const MAX_DIM = Math.min(Math.max(srcWidth, srcHeight), 8192);
		const mercWidth = maxMercX - minMercX;
		const mercHeight = maxMercY - minMercY;
		const aspect = mercHeight / mercWidth;

		let outWidth: number;
		let outHeight: number;
		if (aspect <= 1) {
			outWidth = MAX_DIM;
			outHeight = Math.max(1, Math.round(MAX_DIM * aspect));
		} else {
			outHeight = MAX_DIM;
			outWidth = Math.max(1, Math.round(MAX_DIM / aspect));
		}

		let imageBlobUrl: string | undefined;

		if (typeof document !== 'undefined') {
			const canvas = document.createElement('canvas');
			canvas.width = outWidth;
			canvas.height = outHeight;
			const ctx = canvas.getContext('2d');

			if (ctx) {
				const imgData = ctx.createImageData(outWidth, outHeight);
				const outData = imgData.data;

				const CELL_SIZE = 32;
				const gridCols = Math.ceil(outWidth / CELL_SIZE);
				const gridRows = Math.ceil(outHeight / CELL_SIZE);

				// Precalculate grid source pixel coordinates using Proj4
				const gridSrcX = new Float32Array((gridRows + 1) * (gridCols + 1));
				const gridSrcY = new Float32Array((gridRows + 1) * (gridCols + 1));

				for (let gy = 0; gy <= gridRows; gy++) {
					const outY = Math.min(gy * CELL_SIZE, outHeight);
					const my = maxMercY - (outY / outHeight) * mercHeight;

					for (let gx = 0; gx <= gridCols; gx++) {
						const outX = Math.min(gx * CELL_SIZE, outWidth);
						const mx = minMercX + (outX / outWidth) * mercWidth;

						const [lng, lat] = proj4('EPSG:3857', 'WGS84', [mx, my]);

						let x_m: number, y_m: number;
						if (isProjected) {
							[x_m, y_m] = proj4('WGS84', targetCrs, [lng, lat]);
						} else {
							x_m = lng;
							y_m = lat;
						}

						const dx = x_m - originX;
						const dy = y_m - originY;
						const srcPx = (dx * pixelScaleY - dy * rotationX) / det;
						const srcPy = (dy * pixelScaleX - dx * rotationY) / det;

						const idx = gy * (gridCols + 1) + gx;
						gridSrcX[idx] = srcPx;
						gridSrcY[idx] = srcPy;
					}
				}

				// Bilinearly fill each grid block
				for (let gy = 0; gy < gridRows; gy++) {
					const y0 = gy * CELL_SIZE;
					const y1 = Math.min(y0 + CELL_SIZE, outHeight);
					const cellH = y1 - y0;

					const rowTop = gy * (gridCols + 1);
					const rowBot = (gy + 1) * (gridCols + 1);

					for (let gx = 0; gx < gridCols; gx++) {
						const x0 = gx * CELL_SIZE;
						const x1 = Math.min(x0 + CELL_SIZE, outWidth);
						const cellW = x1 - x0;

						const sx00 = gridSrcX[rowTop + gx];
						const sy00 = gridSrcY[rowTop + gx];
						const sx10 = gridSrcX[rowTop + gx + 1];
						const sy10 = gridSrcY[rowTop + gx + 1];
						const sx01 = gridSrcX[rowBot + gx];
						const sy01 = gridSrcY[rowBot + gx];
						const sx11 = gridSrcX[rowBot + gx + 1];
						const sy11 = gridSrcY[rowBot + gx + 1];

						for (let cy = 0; cy < cellH; cy++) {
							const v = cy / cellH;
							const invV = 1.0 - v;

							const sx0 = sx00 * invV + sx01 * v;
							const sx1 = sx10 * invV + sx11 * v;
							const sy0 = sy00 * invV + sy01 * v;
							const sy1 = sy10 * invV + sy11 * v;

							const dSX = (sx1 - sx0) / cellW;
							const dSY = (sy1 - sy0) / cellW;

							let curSX = sx0;
							let curSY = sy0;

							let outIdx = ((y0 + cy) * outWidth + x0) * 4;

							for (let cx = 0; cx < cellW; cx++) {
								const isx = Math.round(curSX);
								const isy = Math.round(curSY);

								if (isx >= 0 && isx < srcWidth && isy >= 0 && isy < srcHeight) {
									const srcIdx = isy * srcWidth + isx;
									if (isCmyk && b0 && b1 && b2 && b3) {
										// CMYK conversion (ENAIRE print charts)
										const c = (b0[srcIdx] || 0) / 255;
										const m = (b1[srcIdx] || 0) / 255;
										const y = (b2[srcIdx] || 0) / 255;
										const k = (b3[srcIdx] || 0) / 255;
										outData[outIdx] = Math.round(255 * (1 - c) * (1 - k));
										outData[outIdx + 1] = Math.round(255 * (1 - m) * (1 - k));
										outData[outIdx + 2] = Math.round(255 * (1 - y) * (1 - k));
										outData[outIdx + 3] = 255;
									} else if (isColorMapped && indices && colorMap) {
										const cIdx = indices[srcIdx];
										outData[outIdx] = Math.floor((colorMap[cIdx] || 0) / factor);
										outData[outIdx + 1] = Math.floor((colorMap[cIdx + numColors] || 0) / factor);
										outData[outIdx + 2] = Math.floor(
											(colorMap[cIdx + numColors * 2] || 0) / factor
										);
										outData[outIdx + 3] = 255;
									} else if (b0 && b1 && b2) {
										outData[outIdx] = b0[srcIdx];
										outData[outIdx + 1] = b1[srcIdx];
										outData[outIdx + 2] = b2[srcIdx];
										outData[outIdx + 3] = b3 ? b3[srcIdx] : 255;
									} else if (flatRaster) {
										const idxCh = srcIdx * flatChannels;
										outData[outIdx] = flatRaster[idxCh] || 0;
										outData[outIdx + 1] = flatRaster[idxCh + 1] ?? flatRaster[idxCh];
										outData[outIdx + 2] = flatRaster[idxCh + 2] ?? flatRaster[idxCh];
										outData[outIdx + 3] = flatChannels >= 4 ? flatRaster[idxCh + 3] : 255;
									}
								}

								curSX += dSX;
								curSY += dSY;
								outIdx += 4;
							}
						}
					}
				}

				ctx.putImageData(imgData, 0, 0);

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
			scale: 1,
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
			throw new Error(`Failed to download chart from ${catalogItem.downloadUrl} (${response.status})`);
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
