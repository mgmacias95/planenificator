<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { flightPlanStore, SEGMENT_COLORS } from '$lib/state/flight-plan.svelte';
	import { chartStore } from '$lib/state/charts.svelte';
	import { geocodingService } from '$lib/services/geocoding';
	import type { Waypoint } from '$lib/types/flight';
	import * as m from '$lib/paraglide/messages';
	import Icon from './Icon.svelte';
	import L from 'leaflet';

	let mapContainer: HTMLDivElement;
	let map: L.Map | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let waypointMarkers = new Map<string, L.Marker>();
	let segmentPolylines: L.Polyline[] = [];
	let chartLayers = new Map<string, L.Layer>();
	let isAddMode = $state(false);
	let isTouchDevice = $state(false);

	function createWaypointIcon(index: number) {
		const markerSize = isTouchDevice ? 34 : 26;
		return L.divIcon({
			className: 'custom-wp-marker',
			html: `<div style="background: #06b6d4; color: #020617; font-weight: 800; font-size: ${isTouchDevice ? 14 : 12}px; width: ${markerSize}px; height: ${markerSize}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.7);">${index + 1}</div>`,
			iconSize: [markerSize, markerSize],
			iconAnchor: [markerSize / 2, markerSize / 2]
		});
	}

	function addWaypoint(latlng: L.LatLng) {
		flightPlanStore.addWaypoint(latlng.lat, latlng.lng);
	}

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
		const lastSeg = flightPlanStore.segments[flightPlanStore.segments.length - 1];
		const lastSegWpIds = new Set(lastSeg?.waypointIds ?? []);

		flightPlanStore.waypoints.forEach((wp, idx) => {
			const isEditable = lastSegWpIds.has(wp.id);
			let marker = waypointMarkers.get(wp.id);
			if (!marker) {
				marker = L.marker([wp.lat, wp.lng], {
					draggable: isEditable,
					title: wp.name,
					icon: createWaypointIcon(idx)
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
				marker.setIcon(createWaypointIcon(idx));
				marker.setPopupContent(`<b>WP ${idx + 1}:</b> ${wp.name}`);
				// Update draggability based on current segment membership
				if (isEditable) {
					marker.dragging?.enable();
				} else {
					marker.dragging?.disable();
				}
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
				if (chart.imageBlobUrl) {
					layer = L.imageOverlay(chart.imageBlobUrl, bounds, {
						opacity: chart.visible ? chart.opacity : 0,
						interactive: false
					});
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
			untrack(() => {
				updateMarkers();
				updatePolylines();
			});
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
			untrack(() => {
				updateChartOverlays();
			});
		}
	});

	onMount(() => {
		isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
		// On touchscreens the map opens ready for single-tap waypoint placement.
		// Pilots can switch the mode off whenever they only want to inspect the chart.
		isAddMode = isTouchDevice;

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

		map.on('click', (e: L.LeafletMouseEvent) => {
			if (isAddMode) {
				addWaypoint(e.latlng);
			}
		});

		map.on('dblclick', (e: L.LeafletMouseEvent) => {
			if (!isAddMode) {
				addWaypoint(e.latlng);
			}
		});

		// Trigger size recalculation in case container layout is computing
		requestAnimationFrame(() => {
			map?.invalidateSize();
		});

		if (mapContainer && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(() => {
				map?.invalidateSize();
			});
			resizeObserver.observe(mapContainer);
		}

		updateMarkers();
		updatePolylines();
		updateChartOverlays();
	});

	onDestroy(() => {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (map) {
			map.remove();
			map = null;
		}
	});
</script>

<div
	class="relative h-full min-h-[280px] w-full overflow-hidden rounded-xl border border-slate-800 shadow-xl sm:min-h-[320px] lg:min-h-[450px]"
>
	<div
		bind:this={mapContainer}
		id="map"
		class:map-add-mode={isAddMode}
		class="h-full w-full"
		aria-label={m.map_aria_label()}
	></div>

	<!-- Map Toolbar Overlay -->
	<div class="absolute top-3 right-3 z-1000 flex flex-col gap-2">
		<div
			class="flex flex-col gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/92 p-1.5 text-xs shadow-lg backdrop-blur-xs"
		>
			<button
				type="button"
				onclick={() => (isAddMode = !isAddMode)}
				aria-pressed={isAddMode}
				class="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors"
				class:border-cyan-400={isAddMode}
				class:bg-cyan-500={isAddMode}
				class:text-slate-950={isAddMode}
				class:border-slate-700={!isAddMode}
				class:bg-slate-800={!isAddMode}
				class:text-slate-200={!isAddMode}
				title={m.map_add_waypoint_help()}
			>
				<Icon name="plus" class="h-4 w-4" />
				<span>{m.map_add_waypoint()}</span>
			</button>

			<button
				type="button"
				onclick={() => {
					if (map) {
						map.setView([40.4167, -3.7037], 6);
					}
				}}
				class="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
				title="Reset map view to Spain VFR region"
			>
				<Icon name="map-pin" class="h-4 w-4 text-cyan-400" />
				<span>{m.map_center()}</span>
			</button>
		</div>
	</div>

	<div
		class={`pointer-events-none absolute bottom-6 left-1/2 z-1000 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border px-4 py-2 text-center text-xs font-semibold shadow-lg backdrop-blur-md ${
			isAddMode
				? 'border-cyan-400/60 bg-cyan-950/90 text-cyan-100'
				: 'border-slate-700/80 bg-slate-900/85 text-slate-200'
		}`}
		role="status"
	>
		{isAddMode
			? isTouchDevice
				? m.map_touch_add_hint()
				: m.map_click_add_hint()
			: isTouchDevice
				? m.map_touch_pan_hint()
				: m.map_desktop_hint()}
	</div>
</div>

<style>
	:global(.map-add-mode) {
		cursor: crosshair;
	}

	:global(.leaflet-image-layer) {
		image-rendering: -webkit-optimize-contrast;
		image-rendering: auto;
	}
</style>
