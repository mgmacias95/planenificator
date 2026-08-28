import proj4 from 'proj4';
import { fromArrayBuffer as tiffFromArrayBuffer } from 'geotiff';

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

function parseWorldFile(tfwContent: string) {
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

function projectToWgs84(x: number, y: number, isCanaries: boolean = false): { lat: number; lng: number } {
	const targetCrs = isCanaries ? 'ENAIRE:GC' : 'ENAIRE:LE';
	const [lng, lat] = proj4(targetCrs, 'WGS84', [x, y]);
	return { lat, lng };
}

self.onmessage = async (e: MessageEvent<{ name: string; tiffBuffer: ArrayBuffer; tfwText: string }>) => {
	const { name, tiffBuffer, tfwText } = e.data;

	try {
		const tiff = await tiffFromArrayBuffer(tiffBuffer);
		const image = await tiff.getImage();
		const srcWidth = image.getWidth();
		const srcHeight = image.getHeight();

		let metrics: ReturnType<typeof parseWorldFile>;
		if (tfwText && tfwText.trim()) {
			metrics = parseWorldFile(tfwText);
		} else {
			// Extract from GeoTIFF embedded tags
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

		const isCanaries = name.toLowerCase().includes('gc') || name.toLowerCase().includes('canarias');
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
				const wgs = projectToWgs84(x_m, y_m, isCanaries);
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

		// 2. Read source rasters with high-resolution 8192px canvas for crystal clear zoom quality
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

		let rasters: any = null;
		let isInterleaved = false;

		try {
			rasters = await image.readRasters({ interleave: false });
			isInterleaved = false;
		} catch {
			try {
				rasters = await image.readRGB();
				isInterleaved = true;
			} catch {
				rasters = await image.readRasters();
				isInterleaved = !Array.isArray(rasters);
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
		const isCmyk = isBands && bandCount >= 4 && (fileDir?.PhotometricInterpretation === 5 || fileDir?.PhotometricInterpretation === undefined);

		const b0 = isBands && rasters[0] ? (rasters[0] as unknown as ArrayLike<number>) : null;
		const b1 = isBands && rasters[1] ? (rasters[1] as unknown as ArrayLike<number>) : b0;
		const b2 = isBands && rasters[2] ? (rasters[2] as unknown as ArrayLike<number>) : b0;
		const b3 = isBands && rasters[3] ? (rasters[3] as unknown as ArrayLike<number>) : null;
		const indices = isColorMapped ? (rasters[0] as unknown as ArrayLike<number>) : null;
		const flatRaster = !isColorMapped && !isBands ? (rasters as unknown as ArrayLike<number>) : null;
		const flatChannels = flatRaster ? Math.max(1, Math.round(flatRaster.length / (srcWidth * srcHeight))) : 1;

		let blob: Blob | null = null;

		if (typeof OffscreenCanvas !== 'undefined') {
			const canvas = new OffscreenCanvas(outWidth, outHeight);
			const ctx = canvas.getContext('2d');

			if (ctx) {
				const imgData = ctx.createImageData(outWidth, outHeight);
				const outData = imgData.data;

				const CELL_SIZE = 32;
				const gridCols = Math.ceil(outWidth / CELL_SIZE);
				const gridRows = Math.ceil(outHeight / CELL_SIZE);

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
				blob = await canvas.convertToBlob({ type: 'image/png' });
			}
		}

		self.postMessage({
			success: true,
			name,
			bounds: { southWest, northEast },
			blob
		});
	} catch (err: any) {
		self.postMessage({
			success: false,
			error: err?.message || String(err)
		});
	}
};
