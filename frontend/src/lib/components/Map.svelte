<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { flightPlanStore, SEGMENT_COLORS } from '$lib/state/flight-plan.svelte';
	import { chartStore } from '$lib/state/charts.svelte';
	import { geocodingService } from '$lib/services/geocoding';
	import {
		fetchRadarTimeline,
		radarTileUrl,
		type RadarFrame,
		type RadarTimeline
	} from '$lib/services/weather-radar';
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
	let feedbackMessage = $state('');
	let feedbackWaypointId = $state<string | null>(null);
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let radarAnimationTimer: ReturnType<typeof setInterval> | null = null;
	let radarRefreshTimer: ReturnType<typeof setInterval> | null = null;
	let radarLayer: L.TileLayer | null = null;
	let lastAutoFitRouteKey = '';
	let weatherPanelOpen = $state(false);
	let weatherEnabled = $state(false);
	let weatherLoading = $state(false);
	let weatherError = $state(false);
	let weatherPlaying = $state(false);
	let weatherOpacity = $state(58);
	let radarTimeline = $state<RadarTimeline | null>(null);
	let radarFrames = $state<RadarFrame[]>([]);
	let radarFrameIndex = $state(0);
	let selectedRadarFrame = $derived(radarFrames[radarFrameIndex] ?? null);
	let radarShowingHistory = $derived(
		radarFrames.length > 0 && radarFrameIndex < radarFrames.length - 1
	);
	let radarIsDelayed = $derived(
		radarFrames.length > 0
			? Date.now() / 1000 - radarFrames[radarFrames.length - 1].time > 15 * 60
			: false
	);

	function createWaypointIcon(index: number) {
		const markerSize = isTouchDevice ? 44 : 34;
		const dotSize = isTouchDevice ? 32 : 26;
		return L.divIcon({
			className: 'custom-wp-marker',
			html: `<div style="width:${markerSize}px;height:${markerSize}px;display:flex;align-items:center;justify-content:center;"><div style="background:#06b6d4;color:#020617;font-weight:800;font-size:${isTouchDevice ? 14 : 12}px;width:${dotSize}px;height:${dotSize}px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.7);">${index + 1}</div></div>`,
			iconSize: [markerSize, markerSize],
			iconAnchor: [markerSize / 2, markerSize / 2]
		});
	}

	function showFeedback(message: string, waypointId: string | null = null) {
		feedbackMessage = message;
		feedbackWaypointId = waypointId;
		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedbackTimer = setTimeout(() => {
			feedbackMessage = '';
			feedbackWaypointId = null;
		}, 5000);
	}

	function escapeHtml(value: string) {
		return value.replace(
			/[&<>'"]/g,
			(character) =>
				({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ??
				character
		);
	}

	function waypointPopup(name: string, index: number) {
		return `<strong>${escapeHtml(name)}</strong><br><span class="waypoint-popup-meta">Waypoint ${index + 1}</span>`;
	}

	function waypointDisplayName(waypoint: Waypoint) {
		return /^WP\s+\d+$/i.test(waypoint.name) ? m.map_finding_place() : waypoint.name;
	}

	function addWaypoint(latlng: L.LatLng) {
		const waypoint = flightPlanStore.addWaypoint(latlng.lat, latlng.lng);
		showFeedback(
			m.map_waypoint_finding({ number: String(flightPlanStore.waypoints.length) }),
			waypoint.id
		);
	}

	function undoLastWaypoint() {
		if (!feedbackWaypointId) return;
		flightPlanStore.removeWaypoint(feedbackWaypointId);
		showFeedback(m.map_waypoint_removed());
	}

	function fitRoute() {
		if (!map || flightPlanStore.waypoints.length === 0) return;
		if (flightPlanStore.waypoints.length === 1) {
			const waypoint = flightPlanStore.waypoints[0];
			map.setView([waypoint.lat, waypoint.lng], 11, { animate: true });
			return;
		}
		const bounds = L.latLngBounds(
			flightPlanStore.waypoints.map((waypoint) => [waypoint.lat, waypoint.lng] as [number, number])
		);
		map.fitBounds(bounds, { padding: [56, 56], animate: true });
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isAddMode) {
			isAddMode = false;
			mapContainer?.focus();
		}
		if (event.key === 'Escape' && weatherPanelOpen) {
			weatherPanelOpen = false;
			mapContainer?.focus();
		}
	}

	function formatRadarTime(timestamp: number) {
		return `${new Intl.DateTimeFormat(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'UTC'
		}).format(new Date(timestamp * 1000))} UTC`;
	}

	function stopRadarAnimation() {
		if (radarAnimationTimer) {
			clearInterval(radarAnimationTimer);
			radarAnimationTimer = null;
		}
		weatherPlaying = false;
	}

	function updateRadarLayer() {
		if (!map || !weatherEnabled || !radarTimeline || !selectedRadarFrame) return;
		const url = radarTileUrl(radarTimeline, selectedRadarFrame);
		if (radarLayer) {
			radarLayer.setUrl(url, false);
			radarLayer.setOpacity(weatherOpacity / 100);
			return;
		}

		radarLayer = L.tileLayer(url, {
			attribution:
				'<a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">Weather data by RainViewer</a>',
			className: 'weather-radar-tiles',
			pane: 'weatherPane',
			opacity: weatherOpacity / 100,
			tileSize: 512,
			zoomOffset: -1,
			maxNativeZoom: 8,
			maxZoom: 19,
			keepBuffer: 0,
			updateWhenIdle: true,
			updateWhenZooming: false
		}).addTo(map);
	}

	function removeRadarLayer() {
		if (map && radarLayer) map.removeLayer(radarLayer);
		radarLayer = null;
	}

	async function loadRadar(forceRefresh = false) {
		if (weatherLoading) return;
		const hadRadar = radarTimeline !== null && radarFrames.length > 0;
		const wasAtLatest = hadRadar && radarFrameIndex === radarFrames.length - 1;
		const selectedTime = selectedRadarFrame?.time;
		weatherLoading = true;
		weatherError = false;
		try {
			const timeline = await fetchRadarTimeline(fetch, forceRefresh);
			radarTimeline = timeline;
			radarFrames = timeline.frames;
			const preservedIndex = selectedTime
				? timeline.frames.findIndex((frame) => frame.time === selectedTime)
				: -1;
			radarFrameIndex =
				!hadRadar || wasAtLatest || preservedIndex < 0
					? Math.max(0, timeline.frames.length - 1)
					: preservedIndex;
			weatherEnabled = true;
			updateRadarLayer();
		} catch (error) {
			console.warn('Weather radar unavailable:', error);
			if (!hadRadar) {
				weatherError = true;
				weatherEnabled = false;
				removeRadarLayer();
			}
		} finally {
			weatherLoading = false;
		}
	}

	function setWeatherEnabled(enabled: boolean) {
		weatherEnabled = enabled;
		if (!enabled) {
			stopRadarAnimation();
			removeRadarLayer();
			return;
		}
		if (radarFrames.length === 0) {
			void loadRadar();
		} else {
			radarFrameIndex = radarFrames.length - 1;
			updateRadarLayer();
		}
	}

	function openWeatherPanel() {
		weatherPanelOpen = !weatherPanelOpen;
		if (weatherPanelOpen && !weatherEnabled) setWeatherEnabled(true);
	}

	function selectRadarFrame(index: number) {
		stopRadarAnimation();
		radarFrameIndex = Math.max(0, Math.min(index, radarFrames.length - 1));
		updateRadarLayer();
	}

	function jumpToLatestRadar() {
		selectRadarFrame(radarFrames.length - 1);
	}

	function toggleRadarAnimation() {
		if (weatherPlaying) {
			stopRadarAnimation();
			return;
		}
		if (radarFrames.length < 2) return;
		weatherPlaying = true;
		const firstRecentFrame = Math.max(0, radarFrames.length - 4);
		if (radarFrameIndex < firstRecentFrame) radarFrameIndex = firstRecentFrame;
		radarAnimationTimer = setInterval(() => {
			radarFrameIndex =
				radarFrameIndex >= radarFrames.length - 1 ? firstRecentFrame : radarFrameIndex + 1;
			updateRadarLayer();
		}, 1300);
	}

	function updateRadarOpacity(value: number) {
		weatherOpacity = value;
		radarLayer?.setOpacity(value / 100);
	}

	function updateMarkerAccessibility(marker: L.Marker, waypoint: Waypoint, index: number) {
		const label = `${m.map_waypoint_label({ number: String(index + 1), name: waypointDisplayName(waypoint) })}, ${waypoint.lat.toFixed(3)}, ${waypoint.lng.toFixed(3)}`;
		marker.options.title = label;
		const element = marker.getElement();
		if (element) {
			element.setAttribute('aria-label', label);
			element.setAttribute('title', label);
		}
	}

	async function resolveWaypointName(
		wp: Waypoint,
		marker: L.Marker,
		targetLat?: number,
		targetLng?: number
	) {
		if (wp.isManualName) return;
		const lat = targetLat !== undefined ? targetLat : wp.lat;
		const lng = targetLng !== undefined ? targetLng : wp.lng;

		try {
			if (!geocodingService.isReady()) {
				await geocodingService.loadGazetteer();
			}
			const resolvedName = geocodingService.reverseGeocode(lat, lng);

			const currentWp = flightPlanStore.waypoints.find((w) => w.id === wp.id);
			if (currentWp && !currentWp.isManualName) {
				flightPlanStore.updateWaypoint(wp.id, { name: resolvedName });
				marker.setTooltipContent(escapeHtml(resolvedName));
				showFeedback(m.map_waypoint_named({ name: resolvedName }), wp.id);
			}
		} catch (e) {
			console.warn('Offline geocoding error:', e);
			const fallbackName = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
			const currentWp = flightPlanStore.waypoints.find((waypoint) => waypoint.id === wp.id);
			if (currentWp && !currentWp.isManualName) {
				flightPlanStore.updateWaypoint(wp.id, { name: fallbackName });
				marker.setTooltipContent(escapeHtml(fallbackName));
			}
			showFeedback(m.map_waypoint_name_failed(), wp.id);
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
					alt: m.map_waypoint_label({ number: String(idx + 1), name: wp.name }),
					keyboard: true,
					autoPanOnFocus: true,
					icon: createWaypointIcon(idx)
				}).addTo(map!);

				marker.bindTooltip(escapeHtml(waypointDisplayName(wp)), {
					permanent: true,
					direction: 'right',
					offset: L.point(isTouchDevice ? 20 : 16, 0),
					className: 'waypoint-name-label'
				});
				marker.bindPopup(waypointPopup(waypointDisplayName(wp), idx));

				marker.on('dragend', () => {
					const newLatLng = marker!.getLatLng();
					const currentWp = flightPlanStore.waypoints.find((w) => w.id === wp.id);
					marker!.setTooltipContent(escapeHtml(m.map_finding_place()));
					flightPlanStore.updateWaypoint(wp.id, {
						lat: newLatLng.lat,
						lng: newLatLng.lng
					});
					showFeedback(m.map_waypoint_moved());
					if (currentWp && !currentWp.isManualName) {
						resolveWaypointName(currentWp, marker!, newLatLng.lat, newLatLng.lng);
					}
				});

				waypointMarkers.set(wp.id, marker);
				updateMarkerAccessibility(marker, wp, idx);
				if (!wp.isManualName) {
					resolveWaypointName(wp, marker);
				}
			} else {
				marker.setLatLng([wp.lat, wp.lng]);
				marker.setIcon(createWaypointIcon(idx));
				marker.setTooltipContent(escapeHtml(waypointDisplayName(wp)));
				marker.setPopupContent(waypointPopup(waypointDisplayName(wp), idx));
				updateMarkerAccessibility(marker, wp, idx);
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
					smoothFactor: 1,
					pane: 'routePane',
					className: 'route-line'
				}).addTo(map!);

				segmentPolylines.push(polyline);
				allBounds.push(polyline.getBounds());
			}
		});

		// If new route plotted and no charts loaded, fit map
		const routeKey = flightPlanStore.waypoints.map((waypoint) => waypoint.id).join(':');
		if (
			allBounds.length > 0 &&
			chartStore.loadedCharts.length === 0 &&
			routeKey !== lastAutoFitRouteKey
		) {
			const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0]);
			map.fitBounds(combined, { padding: [40, 40] });
			lastAutoFitRouteKey = routeKey;
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

		geocodingService.loadGazetteer().catch((e) => {
			console.warn('Failed to pre-load gazetteer dataset:', e);
			showFeedback(m.map_waypoint_name_failed());
		});

		map = L.map(mapContainer, {
			doubleClickZoom: true
		}).setView([40.4167, -3.7037], 6);
		map.createPane('weatherPane').style.zIndex = '425';
		map.getPane('weatherPane')!.style.pointerEvents = 'none';
		map.createPane('routePane').style.zIndex = '450';
		map.getPane('routePane')!.style.pointerEvents = 'none';

		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> | Airfields: <a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">OurAirports</a> | Places: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames (CC BY 4.0)</a>',
			className: 'base-map-tiles',
			maxZoom: 19
		}).addTo(map);

		map.on('click', (e: L.LeafletMouseEvent) => {
			if (isAddMode) {
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

		radarRefreshTimer = setInterval(
			() => {
				if (weatherEnabled && document.visibilityState === 'visible') void loadRadar(true);
			},
			5 * 60 * 1000
		);
	});

	onDestroy(() => {
		if (feedbackTimer) clearTimeout(feedbackTimer);
		stopRadarAnimation();
		if (radarRefreshTimer) clearInterval(radarRefreshTimer);
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

<svelte:window onkeydown={handleWindowKeydown} />

<div
	class={`relative h-full min-h-0 w-full overflow-hidden rounded-xl border border-slate-800 shadow-lg ${isAddMode ? 'ring-2 ring-cyan-400/70' : ''}`}
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Leaflet turns this container into an interactive map.) -->
	<div
		bind:this={mapContainer}
		id="map"
		role="application"
		tabindex="0"
		class:map-add-mode={isAddMode}
		class="h-full w-full"
		aria-label={m.map_aria_label()}
	></div>

	<!-- Map Toolbar Overlay -->
	<div
		class="pointer-events-none absolute top-3 right-3 bottom-3 z-1000 flex min-h-0 flex-col items-end gap-2 sm:flex-row sm:items-start"
	>
		<div
			class="pointer-events-auto flex flex-col gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/92 p-1.5 text-xs shadow-lg backdrop-blur-xs sm:order-2"
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
				onclick={openWeatherPanel}
				aria-expanded={weatherPanelOpen}
				aria-controls="weather-overlay-panel"
				class={`relative flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
					weatherEnabled
						? 'border-cyan-500/70 bg-cyan-950/80 text-cyan-100'
						: 'border-transparent bg-slate-800 text-slate-300'
				}`}
				title={m.map_weather_help()}
			>
				<Icon name="cloud" class="h-4 w-4 text-cyan-400" />
				<span>{m.map_weather()}</span>
				{#if weatherEnabled}
					<span class="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-cyan-300"></span>
				{/if}
			</button>

			{#if flightPlanStore.waypoints.length > 0}
				<button
					type="button"
					onclick={fitRoute}
					class="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
					title={m.map_fit_route_help()}
				>
					<Icon name="scan" class="h-4 w-4 text-cyan-400" />
					<span>{m.map_fit_route()}</span>
				</button>
			{/if}

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

		{#if weatherPanelOpen}
			<section
				id="weather-overlay-panel"
				class="pointer-events-auto min-h-0 w-[min(19.5rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-slate-700/80 bg-slate-950/94 p-4 text-slate-100 shadow-2xl backdrop-blur-xl sm:order-1"
				aria-label={m.map_weather_title()}
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-sm font-bold">{m.map_weather_title()}</h2>
							{#if selectedRadarFrame}
								<span
									class={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
										radarShowingHistory
											? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
											: radarIsDelayed
												? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
												: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
									}`}
								>
									{radarShowingHistory
										? m.map_weather_history_badge()
										: radarIsDelayed
											? m.map_weather_delayed()
											: m.map_weather_recent()}
								</span>
							{/if}
						</div>
						<p class="mt-1 text-[11px] text-slate-400">{m.map_weather_history()}</p>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onclick={() => setWeatherEnabled(!weatherEnabled)}
							aria-pressed={weatherEnabled}
							aria-label={weatherEnabled ? m.map_weather_on() : m.map_weather_off()}
							class="relative min-h-11 min-w-11 rounded-full"
						>
							<span
								class="mx-auto block h-6 w-10 rounded-full border transition-colors"
								class:border-cyan-400={weatherEnabled}
								class:bg-cyan-500={weatherEnabled}
								class:border-slate-600={!weatherEnabled}
								class:bg-slate-800={!weatherEnabled}
							>
								<span
									class="mt-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
									class:translate-x-[17px]={weatherEnabled}
									class:translate-x-0={!weatherEnabled}
								></span>
							</span>
						</button>
						<button
							type="button"
							onclick={() => (weatherPanelOpen = false)}
							aria-label={m.map_weather_close()}
							class="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
						>
							<Icon name="x" class="h-4 w-4" />
						</button>
					</div>
				</div>

				{#if weatherLoading}
					<div
						class="mt-4 flex min-h-20 items-center justify-center gap-2 text-sm text-slate-300"
						role="status"
					>
						<Icon name="loader" class="h-4 w-4 text-cyan-400" />
						<span>{m.map_weather_loading()}</span>
					</div>
				{:else if weatherError}
					<div class="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3" role="alert">
						<p class="text-sm text-amber-100">{m.map_weather_error()}</p>
						<button
							type="button"
							onclick={() => loadRadar(true)}
							class="mt-2 min-h-11 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 hover:bg-amber-300"
						>
							{m.map_weather_retry()}
						</button>
					</div>
				{:else if selectedRadarFrame}
					<div class="mt-4 flex items-center gap-3">
						<button
							type="button"
							onclick={toggleRadarAnimation}
							disabled={!weatherEnabled || radarFrames.length < 2}
							aria-label={weatherPlaying ? m.map_weather_pause() : m.map_weather_play()}
							class="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/40 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
						>
							<Icon name={weatherPlaying ? 'pause' : 'play'} class="h-4 w-4" />
						</button>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline justify-between gap-2">
								<p
									class="font-mono text-base font-bold text-white"
									role="status"
									aria-live="polite"
								>
									{formatRadarTime(selectedRadarFrame.time)}
								</p>
								<button
									type="button"
									onclick={jumpToLatestRadar}
									disabled={radarFrameIndex === radarFrames.length - 1}
									class="min-h-8 rounded-md px-2 text-[11px] font-bold text-cyan-300 hover:bg-slate-800 disabled:text-slate-600"
								>
									{m.map_weather_latest()}
								</button>
							</div>
							<input
								type="range"
								min="0"
								max={Math.max(0, radarFrames.length - 1)}
								step="1"
								value={radarFrameIndex}
								disabled={!weatherEnabled}
								oninput={(event) => {
									stopRadarAnimation();
									radarFrameIndex = Number(event.currentTarget.value);
								}}
								onchange={() => updateRadarLayer()}
								aria-label={m.map_weather_time()}
								aria-valuetext={formatRadarTime(selectedRadarFrame.time)}
								class="mt-2 h-7 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
							/>
						</div>
					</div>

					<div class="mt-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
						<div
							class="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-300"
						>
							<label for="weather-opacity">{m.map_weather_opacity()}</label>
							<span class="font-mono text-slate-400">{weatherOpacity}%</span>
						</div>
						<input
							id="weather-opacity"
							type="range"
							min="30"
							max="85"
							step="5"
							value={weatherOpacity}
							disabled={!weatherEnabled}
							oninput={(event) => updateRadarOpacity(Number(event.currentTarget.value))}
							class="mt-1 h-7 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
						/>
						<div class="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
							<span>{m.map_weather_light()}</span>
							<span class="weather-legend h-1.5 flex-1 rounded-full"></span>
							<span>{m.map_weather_heavy()}</span>
						</div>
					</div>
				{/if}

				<a
					href="https://www.rainviewer.com/"
					target="_blank"
					rel="noreferrer"
					class="mt-3 inline-block text-[10px] text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
				>
					{m.map_weather_source()}
				</a>
			</section>
		{/if}
	</div>

	{#if feedbackMessage}
		<div
			class="absolute bottom-8 left-1/2 z-1000 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-slate-600/80 bg-slate-950/94 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg backdrop-blur-md"
			role="status"
			aria-live="polite"
		>
			<span>{feedbackMessage}</span>
			{#if feedbackWaypointId}
				<button
					type="button"
					onclick={undoLastWaypoint}
					class="min-h-9 rounded-md px-2 font-bold text-cyan-300 hover:bg-slate-800 hover:text-cyan-200"
				>
					{m.btn_undo()}
				</button>
			{/if}
		</div>
	{:else if flightPlanStore.waypoints.length === 0}
		<div
			class={`pointer-events-none absolute bottom-8 left-1/2 z-1000 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border px-4 py-2 text-center text-xs font-semibold shadow-lg backdrop-blur-md ${
				isAddMode
					? 'border-cyan-400/60 bg-cyan-950/90 text-cyan-100'
					: 'border-slate-700/80 bg-slate-900/90 text-slate-200'
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
	{/if}
</div>

<style>
	:global(.map-add-mode) {
		cursor: crosshair;
	}

	:global(.base-map-tiles) {
		filter: invert(1) hue-rotate(180deg) brightness(0.68) contrast(1.15) saturate(0.75);
	}

	:global(.waypoint-name-label) {
		max-width: 220px;
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 0.24) !important;
		border-radius: 7px !important;
		background: rgb(2 6 23 / 0.92) !important;
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.5) !important;
		color: #ecfeff !important;
		font-size: 12px !important;
		font-weight: 600 !important;
		line-height: 1.2 !important;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	:global(.waypoint-name-label::before) {
		border-right-color: rgb(255 255 255 / 0.24) !important;
	}

	:global(.waypoint-popup-meta) {
		color: #94a3b8;
		font-size: 11px;
	}

	:global(.leaflet-image-layer) {
		image-rendering: -webkit-optimize-contrast;
		image-rendering: auto;
	}

	:global(.route-line) {
		filter: drop-shadow(0 0 1.5px rgb(2 6 23 / 0.95));
	}

	:global(.weather-radar-tiles) {
		mix-blend-mode: screen;
	}

	.weather-legend {
		background: linear-gradient(
			90deg,
			#66a1ff 0%,
			#2b6cff 35%,
			#7c3aed 58%,
			#e11d48 78%,
			#facc15 100%
		);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.weather-radar-tiles) {
			transition: none !important;
		}
	}
</style>
