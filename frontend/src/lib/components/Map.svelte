<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { flightPlanStore, SEGMENT_COLORS } from '$lib/state/flight-plan.svelte';
	import { chartStore } from '$lib/state/charts.svelte';
	import { geocodingService } from '$lib/services/geocoding';
	import type { Waypoint } from '$lib/types/flight';
	import type { WorldFileMetrics } from '$lib/services/georef';
	import L from 'leaflet';
	import proj4 from 'proj4';

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

	class GeotiffWarpedTileLayer extends L.GridLayer {
		sourceCanvas: HTMLCanvasElement;
		tfwParams: WorldFileMetrics;
		scale: number;
		isCanaries: boolean;
		crs: string;
		isProjected: boolean;
		sourcePixels: Uint8ClampedArray;
		sourceWidth: number;
		sourceHeight: number;

		constructor(options: {
			sourceCanvas: HTMLCanvasElement;
			bounds: L.LatLngBounds;
			tfwParams: WorldFileMetrics;
			scale: number;
			isCanaries?: boolean;
			opacity?: number;
			maxZoom?: number;
			minZoom?: number;
		}) {
			super(options);
			this.sourceCanvas = options.sourceCanvas;
			this.tfwParams = options.tfwParams;
			this.scale = options.scale;
			this.isCanaries = Boolean(options.isCanaries);
			this.crs = this.isCanaries ? 'ENAIRE:GC' : 'ENAIRE:LE';
			const { originX, originY } = this.tfwParams;
			this.isProjected = Math.abs(originX) > 180 || Math.abs(originY) > 90;

			const ctx = this.sourceCanvas.getContext('2d');
			if (ctx) {
				const imgData = ctx.getImageData(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
				this.sourcePixels = imgData.data;
			} else {
				this.sourcePixels = new Uint8ClampedArray(0);
			}
			this.sourceWidth = this.sourceCanvas.width;
			this.sourceHeight = this.sourceCanvas.height;
		}

		createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
			const tile = document.createElement('canvas');
			tile.width = 256;
			tile.height = 256;
			const ctx = tile.getContext('2d');
			if (!ctx) {
				setTimeout(() => done(undefined, tile), 0);
				return tile;
			}

			const tileImageData = ctx.createImageData(256, 256);
			const tilePixels = tileImageData.data;
			const srcPixels = this.sourcePixels;
			const srcW = this.sourceWidth;
			const srcH = this.sourceHeight;
			const {
				originX,
				originY,
				pixelScaleX,
				pixelScaleY,
				rotationX = 0,
				rotationY = 0
			} = this.tfwParams;
			const scale = this.scale;
			const crs = this.crs;
			const isProjected = this.isProjected;

			const det = pixelScaleX * pixelScaleY - rotationX * rotationY;
			const hasRotation = Math.abs(rotationX) > 1e-9 || Math.abs(rotationY) > 1e-9;

			const GRID_SIZE = 8;
			const CELL_SIZE = 32;

			const gridSX = new Float32Array(81);
			const gridSY = new Float32Array(81);

			let tileHasData = false;

			for (let gy = 0; gy <= GRID_SIZE; gy++) {
				const ty = gy * CELL_SIZE;
				const mapY = coords.y * 256 + (ty === 256 ? 255.999 : ty);
				for (let gx = 0; gx <= GRID_SIZE; gx++) {
					const tx = gx * CELL_SIZE;
					const mapX = coords.x * 256 + (tx === 256 ? 255.999 : tx);

					const latLng = L.CRS.EPSG3857.pointToLatLng(L.point(mapX, mapY), coords.z);

					let x_m: number;
					let y_m: number;
					if (isProjected) {
						[x_m, y_m] = proj4('WGS84', crs, [latLng.lng, latLng.lat]);
					} else {
						x_m = latLng.lng;
						y_m = latLng.lat;
					}

					const dx = x_m - originX;
					const dy = y_m - originY;

					let px_orig: number;
					let py_orig: number;
					if (!hasRotation) {
						px_orig = dx / pixelScaleX;
						py_orig = dy / pixelScaleY;
					} else {
						px_orig = (dx * pixelScaleY - dy * rotationX) / det;
						py_orig = (dy * pixelScaleX - dx * rotationY) / det;
					}

					const sx = px_orig * scale;
					const sy = py_orig * scale;

					const idx = gy * 9 + gx;
					gridSX[idx] = sx;
					gridSY[idx] = sy;

					if (sx >= 0 && sx < srcW && sy >= 0 && sy < srcH) {
						tileHasData = true;
					}
				}
			}

			if (!tileHasData) {
				setTimeout(() => done(undefined, tile), 0);
				return tile;
			}

			let tileIdx = 0;
			for (let gy = 0; gy < GRID_SIZE; gy++) {
				const rowStart = gy * 9;
				for (let cy = 0; cy < CELL_SIZE; cy++) {
					const v = cy / CELL_SIZE;
					const invV = 1.0 - v;

					for (let gx = 0; gx < GRID_SIZE; gx++) {
						const v00 = rowStart + gx;
						const v10 = v00 + 1;
						const v01 = v00 + 9;
						const v11 = v01 + 1;

						const sx0 = gridSX[v00] * invV + gridSX[v01] * v;
						const sx1 = gridSX[v10] * invV + gridSX[v11] * v;
						const sy0 = gridSY[v00] * invV + gridSY[v01] * v;
						const sy1 = gridSY[v10] * invV + gridSY[v11] * v;

						const dSX = (sx1 - sx0) / CELL_SIZE;
						const dSY = (sy1 - sy0) / CELL_SIZE;

						let curSX = sx0;
						let curSY = sy0;

						for (let cx = 0; cx < CELL_SIZE; cx++) {
							const isx = Math.floor(curSX);
							const isy = Math.floor(curSY);

							if (isx >= 0 && isx < srcW && isy >= 0 && isy < srcH) {
								const srcIdx = (isy * srcW + isx) * 4;
								tilePixels[tileIdx] = srcPixels[srcIdx];
								tilePixels[tileIdx + 1] = srcPixels[srcIdx + 1];
								tilePixels[tileIdx + 2] = srcPixels[srcIdx + 2];
								tilePixels[tileIdx + 3] = srcPixels[srcIdx + 3];
							}

							curSX += dSX;
							curSY += dSY;
							tileIdx += 4;
						}
					}
				}
			}

			ctx.putImageData(tileImageData, 0, 0);
			setTimeout(() => done(undefined, tile), 0);
			return tile;
		}
	}

	let mapContainer: HTMLDivElement;
	let map = $state<L.Map | null>(null);
	let waypointMarkers = new Map<string, L.Marker>();
	let segmentPolylines: L.Polyline[] = [];
	let chartLayers = new Map<string, L.Layer>();

	async function resolveWaypointName(
		wp: Waypoint,
		marker: L.Marker,
		targetLat?: number,
		targetLng?: number
	) {
		if (wp.isManualName) return;

		try {
			if (!geocodingService.isReady()) {
				await geocodingService.loadGazetteer();
			}
			const lat = targetLat !== undefined ? targetLat : wp.lat;
			const lng = targetLng !== undefined ? targetLng : wp.lng;
			const resolvedName = geocodingService.reverseGeocode(lat, lng);

			const currentWp = flightPlanStore.waypoints.find((w) => w.id === wp.id);
			if (currentWp && !currentWp.isManualName) {
				flightPlanStore.updateWaypoint(wp.id, { name: resolvedName });
				marker.setPopupContent(`<b>WP:</b> ${resolvedName}`);
			}
		} catch (e) {
			console.warn('Offline geocoding error:', e);
		}
	}

	function updateMarkers() {
		if (!map) return;

		const currentWpIds = new Set(flightPlanStore.waypoints.map((w) => w.id));

		// Remove obsolete markers
		for (const [id, marker] of waypointMarkers.entries()) {
			if (!currentWpIds.has(id)) {
				map.removeLayer(marker);
				waypointMarkers.delete(id);
			}
		}

		// Add or update markers
		flightPlanStore.waypoints.forEach((wp, idx) => {
			let marker = waypointMarkers.get(wp.id);
			if (!marker) {
				marker = L.marker([wp.lat, wp.lng], {
					draggable: true,
					title: wp.name
				}).addTo(map!);

				marker.bindPopup(`<b>WP ${idx + 1}:</b> ${wp.name}`);

				marker.on('dragend', () => {
					const newLatLng = marker!.getLatLng();
					const currentWp = flightPlanStore.waypoints.find((w) => w.id === wp.id);
					flightPlanStore.updateWaypoint(wp.id, {
						lat: newLatLng.lat,
						lng: newLatLng.lng
					});
					if (currentWp && !currentWp.isManualName) {
						resolveWaypointName(currentWp, marker!, newLatLng.lat, newLatLng.lng);
					}
				});

				waypointMarkers.set(wp.id, marker);
				if (!wp.isManualName) {
					resolveWaypointName(wp, marker);
				}
			} else {
				marker.setLatLng([wp.lat, wp.lng]);
				marker.setPopupContent(`<b>WP ${idx + 1}:</b> ${wp.name}`);
			}
		});
	}

	function updatePolylines() {
		if (!map) return;

		// Clear old polylines
		segmentPolylines.forEach((p) => map?.removeLayer(p));
		segmentPolylines = [];

		const waypointMap = new Map(flightPlanStore.waypoints.map((w) => [w.id, w]));
		const allBounds: L.LatLngBounds[] = [];

		flightPlanStore.segments.forEach((seg, sIdx) => {
			const segWps = seg.waypointIds
				.map((id) => waypointMap.get(id))
				.filter((w): w is Waypoint => Boolean(w));

			if (segWps.length >= 2) {
				const color = seg.color || SEGMENT_COLORS[sIdx % SEGMENT_COLORS.length];
				const latLngs = segWps.map((w) => [w.lat, w.lng] as [number, number]);

				const polyline = L.polyline(latLngs, {
					color,
					weight: 4,
					opacity: 0.9,
					smoothFactor: 1
				}).addTo(map!);

				segmentPolylines.push(polyline);
				allBounds.push(polyline.getBounds());
			}
		});

		// If new route plotted and no charts loaded, fit map
		if (allBounds.length > 0 && chartStore.loadedCharts.length === 0) {
			const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0]);
			map.fitBounds(combined, { padding: [40, 40] });
		}
	}

	function updateChartOverlays() {
		if (!map) return;

		const currentChartIds = new Set(chartStore.loadedCharts.map((c) => c.id));

		// Remove deleted charts
		for (const [id, layer] of chartLayers.entries()) {
			if (!currentChartIds.has(id)) {
				map.removeLayer(layer);
				chartLayers.delete(id);
			}
		}

		// Add or update active charts
		chartStore.loadedCharts.forEach((chart) => {
			let layer = chartLayers.get(chart.id);
			const bounds = L.latLngBounds(
				L.latLng(chart.bounds.southWest[0], chart.bounds.southWest[1]),
				L.latLng(chart.bounds.northEast[0], chart.bounds.northEast[1])
			);

			if (!layer) {
				if (chart.sourceCanvas && chart.tfwParams) {
					layer = new GeotiffWarpedTileLayer({
						sourceCanvas: chart.sourceCanvas,
						bounds: bounds,
						tfwParams: chart.tfwParams as any,
						scale: chart.scale || 1,
						isCanaries: chart.isCanaries,
						opacity: chart.visible ? chart.opacity : 0,
						maxZoom: 18,
						minZoom: 4
					});
				} else if (chart.imageBlobUrl) {
					layer = L.imageOverlay(chart.imageBlobUrl, bounds, {
						opacity: chart.visible ? chart.opacity : 0,
						interactive: false
					});
				}

				if (layer) {
					layer.addTo(map!);
					chartLayers.set(chart.id, layer);
					map!.fitBounds(bounds);
				}
			} else {
				if ('setOpacity' in layer && typeof (layer as any).setOpacity === 'function') {
					(layer as any).setOpacity(chart.visible ? chart.opacity : 0);
				}
			}
		});
	}

	$effect(() => {
		// Reactively watch waypoints and segments
		const _wps = flightPlanStore.waypoints;
		for (const wp of _wps) {
			void wp.id;
			void wp.lat;
			void wp.lng;
			void wp.name;
			void wp.isManualName;
		}
		const _segs = flightPlanStore.segments;
		for (const seg of _segs) {
			void seg.id;
			void seg.color;
			void seg.waypointIds.length;
			for (const id of seg.waypointIds) {
				void id;
			}
		}
		if (map) {
			updateMarkers();
			updatePolylines();
		}
	});

	$effect(() => {
		// Reactively watch charts
		const _charts = chartStore.loadedCharts;
		for (const chart of _charts) {
			void chart.id;
			void chart.visible;
			void chart.opacity;
			void chart.imageBlobUrl;
			if (chart.bounds) {
				void chart.bounds.southWest[0];
				void chart.bounds.southWest[1];
				void chart.bounds.northEast[0];
				void chart.bounds.northEast[1];
			}
		}
		if (map) {
			updateChartOverlays();
		}
	});

	onMount(() => {
		geocodingService.loadGazetteer().catch((e) => {
			console.warn('Failed to pre-load gazetteer dataset:', e);
		});

		map = L.map(mapContainer, {
			doubleClickZoom: false
		}).setView([40.4167, -3.7037], 6);

		L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a> | Airfields: <a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">OurAirports</a> | Places: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames (CC BY 4.0)</a>',
			maxZoom: 18
		}).addTo(map);

		map.on('dblclick', (e: L.LeafletMouseEvent) => {
			flightPlanStore.addWaypoint(e.latlng.lat, e.latlng.lng);
		});

		updateMarkers();
		updatePolylines();
		updateChartOverlays();
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});
</script>

<div
	class="relative h-full min-h-[450px] w-full overflow-hidden rounded-xl border border-slate-800 shadow-xl"
>
	<div bind:this={mapContainer} id="map" class="h-full w-full"></div>

	<!-- Map Toolbar Overlay -->
	<div class="absolute top-3 right-3 z-1000 flex flex-col gap-2">
		<div
			class="flex flex-col gap-1 rounded-lg border border-slate-700/80 bg-slate-900/90 p-1.5 text-xs shadow-lg backdrop-blur-xs"
		>
			<button
				type="button"
				onclick={() => {
					if (map) {
						map.setView([40.4167, -3.7037], 6);
					}
				}}
				class="rounded-sm bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700"
				title="Reset map view to Spain VFR region"
			>
				🇪🇸 Center
			</button>
		</div>
	</div>
</div>
