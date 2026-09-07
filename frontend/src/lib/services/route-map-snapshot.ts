import type { Waypoint, RouteSegment, ChartOverlay } from '$lib/types/flight';

export interface RouteMapSnapshotOptions {
	waypoints: Waypoint[];
	segments?: RouteSegment[];
	width?: number;
	height?: number;
	padding?: number;
	tileUrlTemplate?: string;
	attribution?: string;
	loadedCharts?: ChartOverlay[];
	routeSummary?: {
		depIcao?: string;
		destIcao?: string;
		totalDistanceNm?: number;
	};
}

/**
 * Projects WGS84 lat/lng coordinates to Web Mercator world pixel coordinates at a given zoom level.
 */
export function latLngToWorldPixel(
	lat: number,
	lng: number,
	zoom: number
): { x: number; y: number } {
	const scale = 256 * (1 << zoom);
	const x = ((lng + 180) / 360) * scale;
	const latRad = (lat * Math.PI) / 180;
	// Clamp latitude to Web Mercator limits (-85.05112878 to 85.05112878)
	const sinLat = Math.min(Math.max(Math.sin(latRad), -0.9999), 0.9999);
	const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
	return { x, y };
}

/**
 * Computes bounding box for an array of coordinate points.
 */
export function getBounds(waypoints: { lat: number; lng: number }[]): {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
} {
	if (waypoints.length === 0) {
		return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
	}

	const lats = waypoints.map((w) => w.lat);
	const lngs = waypoints.map((w) => w.lng);
	let minLat = Math.min(...lats);
	let maxLat = Math.max(...lats);
	let minLng = Math.min(...lngs);
	let maxLng = Math.max(...lngs);

	// If single waypoint or identical points, expand slightly
	if (minLat === maxLat && minLng === maxLng) {
		minLat -= 0.05;
		maxLat += 0.05;
		minLng -= 0.05;
		maxLng += 0.05;
	}

	return { minLat, maxLat, minLng, maxLng };
}

/**
 * Determines the optimal Web Mercator zoom level to fit all waypoints within target canvas dimensions.
 */
export function calculateOptimalZoom(
	waypoints: { lat: number; lng: number }[],
	width: number,
	height: number,
	padding: number = 70
): number {
	if (waypoints.length === 0) return 6;
	if (waypoints.length === 1) return 11;

	const { minLat, maxLat, minLng, maxLng } = getBounds(waypoints);
	const availableWidth = Math.max(100, width - 2 * padding);
	const availableHeight = Math.max(100, height - 2 * padding);

	for (let z = 14; z >= 3; z--) {
		const p1 = latLngToWorldPixel(maxLat, minLng, z);
		const p2 = latLngToWorldPixel(minLat, maxLng, z);
		const spanX = Math.abs(p2.x - p1.x);
		const spanY = Math.abs(p2.y - p1.y);
		if (spanX <= availableWidth && spanY <= availableHeight) {
			return z;
		}
	}
	return 3;
}

export interface RequiredTile {
	tx: number;
	ty: number;
	wrappedTx: number;
	destX: number;
	destY: number;
}

/**
 * Calculates all tile indices intersecting the canvas viewport.
 */
export function getRequiredTiles(
	originX: number,
	originY: number,
	width: number,
	height: number,
	zoom: number
): RequiredTile[] {
	const maxTiles = 1 << zoom;
	const minTileX = Math.floor(originX / 256);
	const maxTileX = Math.floor((originX + width) / 256);
	const minTileY = Math.max(0, Math.floor(originY / 256));
	const maxTileY = Math.min(maxTiles - 1, Math.floor((originY + height) / 256));

	const tiles: RequiredTile[] = [];
	for (let ty = minTileY; ty <= maxTileY; ty++) {
		for (let tx = minTileX; tx <= maxTileX; tx++) {
			const wrappedTx = ((tx % maxTiles) + maxTiles) % maxTiles;
			tiles.push({
				tx,
				ty,
				wrappedTx,
				destX: tx * 256 - originX,
				destY: ty * 256 - originY
			});
		}
	}
	return tiles;
}

/**
 * Loads an image from URL with CORS enabled and a timeout.
 * Does not set crossOrigin on blob: or data: URLs to avoid browser CORS errors.
 */
export function loadTileImage(
	url: string,
	timeoutMs: number = 3500
): Promise<HTMLImageElement | null> {
	if (typeof Image === 'undefined') return Promise.resolve(null);
	return new Promise((resolve) => {
		const img = new Image();
		if (!url.startsWith('blob:') && !url.startsWith('data:')) {
			img.crossOrigin = 'anonymous';
		}
		let done = false;
		const timer = setTimeout(() => {
			if (!done) {
				done = true;
				resolve(null);
			}
		}, timeoutMs);

		img.onload = () => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				resolve(img);
			}
		};

		img.onerror = () => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				resolve(null);
			}
		};

		img.src = url;
	});
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

/**
 * Generates a PNG data URL of the route map with tiles, route lines, and marked waypoints.
 * When an ENAIRE VFR chart is loaded, it replaces the default basemap tiles.
 */
export async function generateRouteMapSnapshot(
	options: RouteMapSnapshotOptions
): Promise<string | null> {
	const {
		waypoints,
		segments = [],
		width = 1200,
		height = 600,
		padding = 75,
		tileUrlTemplate = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
		attribution = '© OpenStreetMap contributors',
		loadedCharts = [],
		routeSummary
	} = options;

	if (!waypoints || waypoints.length === 0) return null;
	if (typeof document === 'undefined') return null;

	const bounds = getBounds(waypoints);
	const zoom = calculateOptimalZoom(waypoints, width, height, padding);

	const centerLat = (bounds.minLat + bounds.maxLat) / 2;
	const centerLng = (bounds.minLng + bounds.maxLng) / 2;
	const centerWorld = latLngToWorldPixel(centerLat, centerLng, zoom);

	const originX = centerWorld.x - width / 2;
	const originY = centerWorld.y - height / 2;

	const toCanvas = (lat: number, lng: number) => {
		const wp = latLngToWorldPixel(lat, lng, zoom);
		return {
			x: wp.x - originX,
			y: wp.y - originY
		};
	};

	// Check if active ENAIRE charts are loaded
	const activeCharts = (loadedCharts ?? []).filter(
		(c) => c.visible !== false && Boolean(c.imageBlobUrl || c.canvasElement || c.sourceCanvas)
	);
	const hasActiveChart = activeCharts.length > 0;

	// 1. Fetch basemap tiles ONLY if no active ENAIRE charts are loaded
	let loadedTiles: (RequiredTile & { img: HTMLImageElement | null })[] = [];
	if (!hasActiveChart) {
		const tileDefs = getRequiredTiles(originX, originY, width, height, zoom);
		const tilePromises = tileDefs.map(async (tile) => {
			const url = tileUrlTemplate
				.replace('{z}', String(zoom))
				.replace('{x}', String(tile.wrappedTx))
				.replace('{y}', String(tile.ty));
			const img = await loadTileImage(url, 3500);
			return { ...tile, img };
		});
		loadedTiles = await Promise.all(tilePromises);
	}

	// 2. Initialize Canvas
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	// Base background fill (pleasant slate cartographic tone)
	ctx.fillStyle = '#f8fafc';
	ctx.fillRect(0, 0, width, height);

	// Subtle coordinate grid background
	ctx.strokeStyle = '#e2e8f0';
	ctx.lineWidth = 1;
	const gridSize = 40;
	ctx.beginPath();
	for (let gx = 0; gx < width; gx += gridSize) {
		ctx.moveTo(gx, 0);
		ctx.lineTo(gx, height);
	}
	for (let gy = 0; gy < height; gy += gridSize) {
		ctx.moveTo(0, gy);
		ctx.lineTo(width, gy);
	}
	ctx.stroke();

	// 3. Draw Basemap: ENAIRE Chart in place of default map, or fallback to OSM tiles
	let chartsDrawnCount = 0;
	if (hasActiveChart) {
		for (const chart of activeCharts) {
			const chartDrawable = chart.canvasElement || chart.sourceCanvas;
			let img: HTMLImageElement | HTMLCanvasElement | null = chartDrawable ?? null;
			if (!img && chart.imageBlobUrl) {
				img = await loadTileImage(chart.imageBlobUrl, 3500);
			}

			if (img) {
				const tl = toCanvas(chart.bounds.northEast[0], chart.bounds.southWest[1]);
				const br = toCanvas(chart.bounds.southWest[0], chart.bounds.northEast[1]);
				ctx.save();
				// Use full opacity so ENAIRE chart acts as the primary map surface
				ctx.globalAlpha = 1.0;
				ctx.drawImage(img, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
				ctx.restore();
				chartsDrawnCount++;
			}
		}
	}

	// Fallback to default OSM tiles if no chart was loaded or chart rendering failed
	if (!hasActiveChart || chartsDrawnCount === 0) {
		if (loadedTiles.length === 0) {
			const tileDefs = getRequiredTiles(originX, originY, width, height, zoom);
			const tilePromises = tileDefs.map(async (tile) => {
				const url = tileUrlTemplate
					.replace('{z}', String(zoom))
					.replace('{x}', String(tile.wrappedTx))
					.replace('{y}', String(tile.ty));
				const img = await loadTileImage(url, 3500);
				return { ...tile, img };
			});
			loadedTiles = await Promise.all(tilePromises);
		}
		for (const tile of loadedTiles) {
			if (tile.img) {
				ctx.drawImage(tile.img, tile.destX, tile.destY, 256, 256);
			}
		}
	}

	// 3. Draw Route Lines
	const waypointMap = new Map(waypoints.map((w) => [w.id, w]));
	const segmentsToDraw: { color: string; points: { x: number; y: number }[] }[] = [];

	if (segments.length > 0) {
		segments.forEach((seg, sIdx) => {
			const segWps = seg.waypointIds
				.map((id) => waypointMap.get(id))
				.filter((w): w is Waypoint => Boolean(w));

			if (segWps.length >= 2) {
				const points = segWps.map((w) => toCanvas(w.lat, w.lng));
				segmentsToDraw.push({
					color: seg.color || (sIdx % 2 === 0 ? '#0284c7' : '#ec4899'),
					points
				});
			}
		});
	}

	// Fallback if no segments defined or waypoints not in segments
	if (segmentsToDraw.length === 0 && waypoints.length >= 2) {
		segmentsToDraw.push({
			color: '#0284c7',
			points: waypoints.map((w) => toCanvas(w.lat, w.lng))
		});
	}

	// Draw route paths
	for (const seg of segmentsToDraw) {
		if (seg.points.length < 2) continue;

		// Route casing (drop shadow & contrast outline)
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.beginPath();
		ctx.moveTo(seg.points[0].x, seg.points[0].y);
		for (let i = 1; i < seg.points.length; i++) {
			ctx.lineTo(seg.points[i].x, seg.points[i].y);
		}
		ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
		ctx.lineWidth = 7;
		ctx.stroke();

		// Core route line
		ctx.beginPath();
		ctx.moveTo(seg.points[0].x, seg.points[0].y);
		for (let i = 1; i < seg.points.length; i++) {
			ctx.lineTo(seg.points[i].x, seg.points[i].y);
		}
		ctx.strokeStyle = seg.color;
		ctx.lineWidth = 3.5;
		ctx.stroke();

		// Draw direction chevrons at leg midpoints
		for (let i = 0; i < seg.points.length - 1; i++) {
			const p1 = seg.points[i];
			const p2 = seg.points[i + 1];
			const legDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
			if (legDist > 40) {
				const midX = (p1.x + p2.x) / 2;
				const midY = (p1.y + p2.y) / 2;
				const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

				ctx.save();
				ctx.translate(midX, midY);
				ctx.rotate(angle);
				ctx.beginPath();
				ctx.moveTo(-6, -5);
				ctx.lineTo(2, 0);
				ctx.lineTo(-6, 5);
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 2.5;
				ctx.stroke();
				ctx.restore();
			}
		}

		ctx.restore();
	}

	// 4. Draw Waypoint Markers and Labels
	waypoints.forEach((wp, idx) => {
		const { x, y } = toCanvas(wp.lat, wp.lng);
		const isDep = idx === 0;
		const isDest = idx === waypoints.length - 1 && waypoints.length > 1;

		// Drop shadow for marker
		ctx.save();
		ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
		ctx.shadowBlur = 8;
		ctx.shadowOffsetY = 2;

		// Outer circle ring
		ctx.beginPath();
		ctx.arc(x, y, 14, 0, Math.PI * 2);
		ctx.fillStyle = isDep ? '#0284c7' : isDest ? '#059669' : '#0891b2';
		ctx.fill();

		ctx.lineWidth = 2.5;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();
		ctx.restore();

		// Number inside marker
		ctx.save();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 12px ui-sans-serif, system-ui, -apple-system, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(idx + 1), x, y + 0.5);
		ctx.restore();

		// Waypoint label badge
		const nameText = wp.name || `WP ${idx + 1}`;
		ctx.save();
		ctx.font = 'bold 11px ui-sans-serif, system-ui, -apple-system, sans-serif';
		const textWidth = ctx.measureText(nameText).width;
		const badgeW = textWidth + 14;
		const badgeH = 22;

		// Default badge placement: right of marker
		let badgeX = x + 18;
		let badgeY = y - badgeH / 2;

		// Boundary checks so label never renders off-canvas
		if (badgeX + badgeW > width - 10) {
			badgeX = x - 18 - badgeW;
		}
		if (badgeY < 8) badgeY = 8;
		if (badgeY + badgeH > height - 8) badgeY = height - 8 - badgeH;

		// Draw badge box
		ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
		ctx.shadowBlur = 6;
		ctx.shadowOffsetY = 2;
		drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 5);
		ctx.fillStyle = 'rgba(2, 6, 23, 0.90)';
		ctx.fill();

		ctx.shadowColor = 'transparent';
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
		ctx.stroke();

		// Draw badge text
		ctx.fillStyle = '#ecfeff';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(nameText, badgeX + 7, badgeY + badgeH / 2 + 0.5);
		ctx.restore();
	});

	// 5. Flight Overview Banner (Top-Left Badge)
	ctx.save();
	const depLabel = routeSummary?.depIcao || waypoints[0]?.name || 'DEP';
	const destLabel = routeSummary?.destIcao || waypoints[waypoints.length - 1]?.name || 'DEST';
	const distStr =
		routeSummary?.totalDistanceNm !== undefined && routeSummary.totalDistanceNm > 0
			? ` · ${routeSummary.totalDistanceNm.toFixed(1)} NM`
			: '';
	const chartTag = hasActiveChart && chartsDrawnCount > 0 ? ' · CARTA ENAIRE VFR' : '';
	const bannerText = `✈ ${depLabel} → ${destLabel} · ${waypoints.length} WAYPOINTS${distStr}${chartTag}`;

	ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
	const bannerW = ctx.measureText(bannerText).width + 20;
	const bannerH = 26;
	const bannerX = 14;
	const bannerY = 14;

	drawRoundedRect(ctx, bannerX, bannerY, bannerW, bannerH, 6);
	ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
	ctx.fill();
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
	ctx.stroke();

	ctx.fillStyle = '#38bdf8';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(bannerText, bannerX + 10, bannerY + bannerH / 2 + 0.5);
	ctx.restore();

	// 6. Map Attribution (Bottom-Right Badge)
	ctx.save();
	ctx.font = '10px ui-sans-serif, system-ui, -apple-system, sans-serif';
	const effectiveAttribution =
		hasActiveChart && chartsDrawnCount > 0
			? `Carta VFR ENAIRE (${activeCharts.map((c) => c.name).join(', ')}) · AIP España`
			: attribution;
	const attrW = ctx.measureText(effectiveAttribution).width + 12;
	const attrH = 18;
	const attrX = width - attrW - 10;
	const attrY = height - attrH - 8;

	drawRoundedRect(ctx, attrX, attrY, attrW, attrH, 3);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
	ctx.fill();
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
	ctx.stroke();

	ctx.fillStyle = '#475569';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(effectiveAttribution, attrX + 6, attrY + attrH / 2);
	ctx.restore();

	return canvas.toDataURL('image/png');
}
