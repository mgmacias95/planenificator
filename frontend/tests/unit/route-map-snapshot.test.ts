import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	latLngToWorldPixel,
	getBounds,
	calculateOptimalZoom,
	getRequiredTiles,
	loadTileImage,
	generateRouteMapSnapshot
} from '$lib/services/route-map-snapshot';
import { RouteMapSnapshotState } from '$lib/state/route-map-snapshot.svelte';
import type { Waypoint, RouteSegment } from '$lib/types/flight';

describe('Route Map Snapshot Service', () => {
	it('projects (0, 0) at zoom 0 to (128, 128)', () => {
		const pixel = latLngToWorldPixel(0, 0, 0);
		expect(Math.round(pixel.x)).toBe(128);
		expect(Math.round(pixel.y)).toBe(128);
	});

	it('projects (0, 0) at zoom 1 to (256, 256)', () => {
		const pixel = latLngToWorldPixel(0, 0, 1);
		expect(Math.round(pixel.x)).toBe(256);
		expect(Math.round(pixel.y)).toBe(256);
	});

	it('projects coordinates consistently as zoom increases', () => {
		const madridLat = 40.4168;
		const madridLng = -3.7038;
		const z5 = latLngToWorldPixel(madridLat, madridLng, 5);
		const z6 = latLngToWorldPixel(madridLat, madridLng, 6);

		expect(Math.round(z6.x)).toBe(Math.round(z5.x * 2));
		expect(Math.round(z6.y)).toBe(Math.round(z5.y * 2));
	});

	it('computes correct bounds for an empty array of waypoints', () => {
		const bounds = getBounds([]);
		expect(bounds).toEqual({ minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 });
	});

	it('expands bounds for a single waypoint to prevent zero-area box', () => {
		const bounds = getBounds([{ lat: 40.0, lng: -3.0 }]);
		expect(bounds.minLat).toBeCloseTo(39.95);
		expect(bounds.maxLat).toBeCloseTo(40.05);
		expect(bounds.minLng).toBeCloseTo(-3.05);
		expect(bounds.maxLng).toBeCloseTo(-2.95);
	});

	it('computes accurate bounding box for multiple waypoints', () => {
		const wps = [
			{ lat: 40.47, lng: -3.56 }, // LEMD
			{ lat: 39.49, lng: -0.48 }, // LEVC
			{ lat: 38.87, lng: 1.37 } // LEIB
		];
		const bounds = getBounds(wps);
		expect(bounds.minLat).toBeCloseTo(38.87);
		expect(bounds.maxLat).toBeCloseTo(40.47);
		expect(bounds.minLng).toBeCloseTo(-3.56);
		expect(bounds.maxLng).toBeCloseTo(1.37);
	});

	it('calculates optimal zoom level fitting the route', () => {
		// Long route: Madrid to Ibiza (~500 km)
		const madridToIbiza = [
			{ lat: 40.47, lng: -3.56 },
			{ lat: 38.87, lng: 1.37 }
		];
		const zoomLong = calculateOptimalZoom(madridToIbiza, 1200, 600, 70);
		expect(zoomLong).toBeGreaterThanOrEqual(6);
		expect(zoomLong).toBeLessThanOrEqual(8);

		// Short local pattern (~10 km)
		const localPattern = [
			{ lat: 40.47, lng: -3.56 },
			{ lat: 40.52, lng: -3.51 }
		];
		const zoomShort = calculateOptimalZoom(localPattern, 1200, 600, 70);
		expect(zoomShort).toBeGreaterThan(zoomLong);
		expect(zoomShort).toBeLessThanOrEqual(14);
	});

	it('calculates required tile coordinates intersecting the viewport', () => {
		const originX = 1000;
		const originY = 800;
		const width = 600;
		const height = 400;
		const zoom = 5;

		const tiles = getRequiredTiles(originX, originY, width, height, zoom);
		expect(tiles.length).toBeGreaterThan(0);

		// Verify tiles cover the top-left and bottom-right of viewport
		const firstTile = tiles[0];
		expect(firstTile.destX).toBeLessThanOrEqual(0);
		expect(firstTile.destY).toBeLessThanOrEqual(0);

		const lastTile = tiles[tiles.length - 1];
		expect(lastTile.destX + 256).toBeGreaterThanOrEqual(width);
		expect(lastTile.destY + 256).toBeGreaterThanOrEqual(height);
	});

	it('resolves loadTileImage to null when Image constructor is unavailable', async () => {
		const result = await loadTileImage('https://tile.openstreetmap.org/0/0/0.png', 100);
		expect(result).toBeNull();
	});

	it('returns null when no waypoints are provided', async () => {
		const result = await generateRouteMapSnapshot({
			waypoints: []
		});
		expect(result).toBeNull();
	});

	it('returns null gracefully when document is undefined in node environment', async () => {
		const result = await generateRouteMapSnapshot({
			waypoints: [{ id: 'wp-1', lat: 40.4, lng: -3.7, name: 'Madrid' }]
		});
		expect(result).toBeNull();
	});

	it('renders snapshot using mocked canvas API', async () => {
		const mockContext = {
			fillStyle: '',
			fillRect: vi.fn(),
			strokeStyle: '',
			lineWidth: 0,
			lineCap: '',
			lineJoin: '',
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
			arc: vi.fn(),
			fill: vi.fn(),
			closePath: vi.fn(),
			quadraticCurveTo: vi.fn(),
			drawImage: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			translate: vi.fn(),
			rotate: vi.fn(),
			fillText: vi.fn(),
			measureText: vi.fn().mockReturnValue({ width: 50 }),
			shadowColor: '',
			shadowBlur: 0,
			shadowOffsetY: 0
		};

		const mockCanvas = {
			width: 0,
			height: 0,
			getContext: vi.fn().mockReturnValue(mockContext),
			toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockSnapshotData')
		};

		vi.stubGlobal('document', {
			createElement: vi.fn().mockReturnValue(mockCanvas)
		});

		const result = await generateRouteMapSnapshot({
			waypoints: [
				{ id: 'wp-1', lat: 40.4, lng: -3.7, name: 'LEMD (Madrid)' },
				{ id: 'wp-2', lat: 39.5, lng: -0.5, name: 'LEVC (Valencia)' }
			],
			segments: [{ id: 'seg-1', cruiseAlt: 5500, waypointIds: ['wp-1', 'wp-2'], color: '#0284c7' }],
			width: 800,
			height: 400
		});

		expect(result).toBe('data:image/png;base64,mockSnapshotData');
		expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
		expect(mockContext.fillRect).toHaveBeenCalled();
		expect(mockContext.fillText).toHaveBeenCalled();

		vi.unstubAllGlobals();
	});
	it('renders snapshot using ENAIRE chart instead of default map tiles', async () => {
		const mockContext = {
			fillStyle: '',
			fillRect: vi.fn(),
			strokeStyle: '',
			lineWidth: 0,
			lineCap: '',
			lineJoin: '',
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
			arc: vi.fn(),
			fill: vi.fn(),
			closePath: vi.fn(),
			quadraticCurveTo: vi.fn(),
			drawImage: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			translate: vi.fn(),
			rotate: vi.fn(),
			fillText: vi.fn(),
			measureText: vi.fn().mockReturnValue({ width: 60 }),
			shadowColor: '',
			shadowBlur: 0,
			shadowOffsetY: 0,
			globalAlpha: 1
		};

		const mockCanvas = {
			width: 0,
			height: 0,
			getContext: vi.fn().mockReturnValue(mockContext),
			toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockEnaireChartSnapshot')
		};

		vi.stubGlobal('document', {
			createElement: vi.fn().mockReturnValue(mockCanvas)
		});

		const mockChartCanvas = {
			width: 1000,
			height: 1000
		} as unknown as HTMLCanvasElement;

		const result = await generateRouteMapSnapshot({
			waypoints: [
				{ id: 'wp-1', lat: 40.4, lng: -3.7, name: 'LEMD' },
				{ id: 'wp-2', lat: 40.8, lng: -3.2, name: 'LETO' }
			],
			loadedCharts: [
				{
					id: 'enaire_madrid',
					name: 'ENAIRE VFR 1:500k Madrid',
					bounds: {
						southWest: [39.5, -4.5],
						northEast: [41.5, -2.5]
					},
					canvasElement: mockChartCanvas,
					opacity: 0.85,
					visible: true,
					sourceType: 'online_catalog'
				}
			],
			width: 800,
			height: 400
		});

		expect(result).toBe('data:image/png;base64,mockEnaireChartSnapshot');
		// Verified chart canvas was drawn to canvas context
		expect(mockContext.drawImage).toHaveBeenCalledWith(
			mockChartCanvas,
			expect.any(Number),
			expect.any(Number),
			expect.any(Number),
			expect.any(Number)
		);
		// Attribution or banner mentioning ENAIRE VFR
		expect(mockContext.fillText).toHaveBeenCalledWith(
			expect.stringContaining('CARTA ENAIRE VFR'),
			expect.any(Number),
			expect.any(Number)
		);

		vi.unstubAllGlobals();
	});
});

describe('RouteMapSnapshotState Store', () => {
	let store: RouteMapSnapshotState;

	beforeEach(() => {
		store = new RouteMapSnapshotState();
	});

	it('computes deterministic fingerprints based on waypoints, segments, and charts', () => {
		const wps: Waypoint[] = [
			{ id: 'w1', lat: 40.1, lng: -3.1, name: 'WP1' },
			{ id: 'w2', lat: 40.5, lng: -3.5, name: 'WP2' }
		];
		const segs: RouteSegment[] = [
			{ id: 's1', cruiseAlt: 5500, waypointIds: ['w1', 'w2'], color: '#00f0ff' }
		];

		const fp1 = store.computeFingerprint(wps, segs);
		const fp2 = store.computeFingerprint(wps, segs);
		expect(fp1).toBe(fp2);

		// Changing a coordinate changes fingerprint
		const wpsChanged: Waypoint[] = [
			{ id: 'w1', lat: 40.1001, lng: -3.1, name: 'WP1' },
			{ id: 'w2', lat: 40.5, lng: -3.5, name: 'WP2' }
		];
		const fp3 = store.computeFingerprint(wpsChanged, segs);
		expect(fp1).not.toBe(fp3);

		// Adding a chart changes fingerprint
		const fpWithChart = store.computeFingerprint(wps, segs, [
			{
				id: 'chart1',
				name: 'Madrid VFR',
				bounds: { southWest: [39, -4], northEast: [41, -2] },
				visible: true,
				opacity: 0.9,
				sourceType: 'online_catalog'
			}
		]);
		expect(fp1).not.toBe(fpWithChart);
	});

	it('returns null and resets dataUrl if waypoints list is empty', async () => {
		store.dataUrl = 'data:image/png;base64,oldSnapshot';
		store.lastFingerprint = 'oldFingerprint';

		const result = await store.ensureSnapshot();
		expect(result).toBeNull();
		expect(store.dataUrl).toBeNull();
		expect(store.lastFingerprint).toBeNull();
	});

	it('clears state on clear()', () => {
		store.dataUrl = 'data:image/png;base64,sample';
		store.lastFingerprint = 'fp123';
		store.isLoading = true;

		store.clear();
		expect(store.dataUrl).toBeNull();
		expect(store.lastFingerprint).toBeNull();
		expect(store.isLoading).toBe(false);
	});
});
