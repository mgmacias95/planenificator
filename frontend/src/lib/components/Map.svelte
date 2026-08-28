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
	import {
		fetchWeatherForecast,
		nearestForecastFrameIndex,
		type ForecastBounds,
		type WeatherForecast
	} from '$lib/services/weather-forecast';
	import { renderForecastField } from '$lib/services/weather-forecast-field';
	import { WindFlowAnimator } from '$lib/services/weather-wind-flow';
	import type { Waypoint } from '$lib/types/flight';
	import * as m from '$lib/paraglide/messages';
	import Icon from './Icon.svelte';
	import L from 'leaflet';

	let mapContainer: HTMLDivElement;
	let windCanvas: HTMLCanvasElement;
	let weatherTrigger: HTMLButtonElement;
	let map: L.Map | null = null;
	let windFlow: WindFlowAnimator | null = null;
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
	let forecastMoveTimer: ReturnType<typeof setTimeout> | null = null;
	let radarLayer: L.TileLayer | null = null;
	let forecastLayer: L.ImageOverlay | null = null;
	let forecastAttributionVisible = false;
	let lastAutoFitRouteKey = '';
	let weatherMode = $state<'forecast' | 'radar'>('forecast');
	let forecastLayerMode = $state<'precipitation' | 'wind'>('precipitation');
	let weatherPanelOpen = $state(false);
	let weatherEnabled = $state(false);
	let weatherLoading = $state(false);
	let weatherError = $state(false);
	let weatherPlaying = $state(false);
	let radarTilesLoading = $state(false);
	let weatherOpacity = $state(58);
	let radarTimeline = $state<RadarTimeline | null>(null);
	let radarFrames = $state<RadarFrame[]>([]);
	let radarFrameIndex = $state(0);
	let forecast = $state<WeatherForecast | null>(null);
	let forecastFrameIndex = $state(0);
	let selectedRadarFrame = $derived(radarFrames[radarFrameIndex] ?? null);
	let selectedForecastTime = $derived(forecast?.times[forecastFrameIndex] ?? null);
	let forecastFrameStats = $derived(
		forecast
			? forecast.points.reduce(
					(summary, point) => ({
						peak: Math.max(summary.peak, point.precipitation[forecastFrameIndex] ?? 0),
						probability: Math.max(
							summary.probability,
							point.precipitationProbability[forecastFrameIndex] ?? 0
						)
					}),
					{ peak: 0, probability: 0 }
				)
			: { peak: 0, probability: 0 }
	);
	let forecastWindStats = $derived(
		forecast && forecast.points.length > 0
			? forecast.points.reduce(
					(summary, point) => {
						const speed = point.windSpeed[forecastFrameIndex] ?? 0;
						return {
							total: summary.total + speed,
							peak: Math.max(summary.peak, speed),
							count: summary.count + 1
						};
					},
					{ total: 0, peak: 0, count: 0 }
				)
			: { total: 0, peak: 0, count: 0 }
	);
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
			closeWeatherPanel();
		}
	}

	function closeWeatherPanel() {
		weatherPanelOpen = false;
		requestAnimationFrame(() => weatherTrigger?.focus());
	}

	function formatRadarTime(timestamp: number) {
		return `${new Intl.DateTimeFormat(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'UTC'
		}).format(new Date(timestamp * 1000))} UTC`;
	}

	function formatRadarDateTimeInput(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'UTC',
			timeZoneName: 'short'
		}).format(new Date(timestamp * 1000));
	}

	function formatForecastDateTime(timestamp: number) {
		return new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'UTC'
		}).format(new Date(timestamp * 1000));
	}

	function formatDateTimeInput(timestamp: number) {
		return new Date(timestamp * 1000).toISOString().slice(0, 16);
	}

	function stopWeatherAnimation() {
		if (radarAnimationTimer) {
			clearInterval(radarAnimationTimer);
			radarAnimationTimer = null;
		}
		weatherPlaying = false;
	}

	function currentForecastBounds(): ForecastBounds | null {
		if (!map) return null;
		const bounds = map.getBounds();
		return {
			south: bounds.getSouth(),
			west: bounds.getWest(),
			north: bounds.getNorth(),
			east: bounds.getEast()
		};
	}

	function updateForecastLayer() {
		if (!map || !weatherEnabled || weatherMode !== 'forecast' || !forecast) return;
		if (!forecastAttributionVisible) {
			map.attributionControl.addAttribution(
				'<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Forecast by Open-Meteo</a>'
			);
			forecastAttributionVisible = true;
		}
		if (forecastLayerMode === 'wind') {
			if (forecastLayer) map.removeLayer(forecastLayer);
			forecastLayer = null;
			windFlow?.update(
				forecast,
				forecastFrameIndex,
				(latitude, longitude) => map!.latLngToContainerPoint([latitude, longitude]),
				mapContainer.clientWidth,
				mapContainer.clientHeight,
				weatherOpacity
			);
			return;
		}
		windFlow?.stop(true);
		const image = renderForecastField(forecast, forecastFrameIndex, weatherOpacity);
		const bounds = L.latLngBounds(
			[forecast.bounds.south, forecast.bounds.west],
			[forecast.bounds.north, forecast.bounds.east]
		);
		if (!forecastLayer) {
			forecastLayer = L.imageOverlay(image, bounds, {
				pane: 'weatherPane',
				className: 'weather-forecast-field',
				interactive: false
			}).addTo(map);
		} else {
			forecastLayer.setUrl(image);
			forecastLayer.setBounds(bounds);
		}
	}

	function removeForecastLayer() {
		if (map && forecastLayer) map.removeLayer(forecastLayer);
		windFlow?.stop(true);
		if (map && forecastAttributionVisible) {
			map.attributionControl.removeAttribution(
				'<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Forecast by Open-Meteo</a>'
			);
		}
		forecastLayer = null;
		forecastAttributionVisible = false;
	}

	function selectForecastLayer(mode: 'precipitation' | 'wind') {
		if (forecastLayerMode === mode) return;
		forecastLayerMode = mode;
		updateForecastLayer();
	}

	async function loadForecast(forceRefresh = false, targetTime?: number) {
		const bounds = currentForecastBounds();
		if (!bounds || weatherLoading) return;
		const hadForecast = forecast !== null;
		const requestedTime =
			targetTime ?? selectedForecastTime ?? Math.ceil(Date.now() / 3_600_000) * 3_600;
		weatherLoading = true;
		weatherError = false;
		try {
			const nextForecast = await fetchWeatherForecast(bounds, fetch, forceRefresh);
			forecast = nextForecast;
			forecastFrameIndex = nearestForecastFrameIndex(nextForecast.times, requestedTime);
			weatherEnabled = true;
			updateForecastLayer();
		} catch (error) {
			console.warn('Weather forecast unavailable:', error);
			if (!hadForecast) {
				weatherError = true;
				weatherEnabled = false;
				removeForecastLayer();
			}
		} finally {
			weatherLoading = false;
		}
	}

	function selectForecastFrame(index: number) {
		stopWeatherAnimation();
		if (!forecast) return;
		forecastFrameIndex = Math.max(0, Math.min(index, forecast.times.length - 1));
		updateForecastLayer();
	}

	function selectForecastDate(value: string) {
		if (!forecast) return;
		const timestamp = Date.parse(`${value}Z`) / 1000;
		if (!Number.isFinite(timestamp)) return;
		selectForecastFrame(nearestForecastFrameIndex(forecast.times, timestamp));
	}

	function jumpToCurrentForecast() {
		if (!forecast) return;
		selectForecastFrame(nearestForecastFrameIndex(forecast.times, Date.now() / 1000));
	}

	function toggleForecastAnimation() {
		if (weatherPlaying) {
			stopWeatherAnimation();
			return;
		}
		if (!forecast || forecast.times.length < 2) return;
		if (forecastFrameIndex >= forecast.times.length - 1) {
			forecastFrameIndex = nearestForecastFrameIndex(
				forecast.times,
				Math.ceil(Date.now() / 3_600_000) * 3_600
			);
			updateForecastLayer();
		}
		weatherPlaying = true;
		radarAnimationTimer = setInterval(() => {
			if (!forecast || forecastFrameIndex >= forecast.times.length - 1) {
				stopWeatherAnimation();
				return;
			}
			forecastFrameIndex += 1;
			updateForecastLayer();
		}, 900);
	}

	function updateRadarLayer() {
		if (!map || !weatherEnabled || weatherMode !== 'radar' || !radarTimeline || !selectedRadarFrame)
			return;
		const url = radarTileUrl(radarTimeline, selectedRadarFrame);
		if (radarLayer) {
			radarTilesLoading = true;
			radarLayer.setUrl(url, false);
			radarLayer.setOpacity(weatherOpacity / 100);
			return;
		}

		radarTilesLoading = true;
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
		});
		radarLayer.on('loading', () => (radarTilesLoading = true));
		radarLayer.on('load', () => (radarTilesLoading = false));
		radarLayer.addTo(map);
	}

	function removeRadarLayer() {
		if (map && radarLayer) map.removeLayer(radarLayer);
		radarLayer = null;
		radarTilesLoading = false;
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
			stopWeatherAnimation();
			removeRadarLayer();
			removeForecastLayer();
			return;
		}
		if (weatherMode === 'forecast') {
			removeRadarLayer();
			if (!forecast) void loadForecast();
			else updateForecastLayer();
		} else {
			removeForecastLayer();
			if (radarFrames.length === 0) void loadRadar();
			else updateRadarLayer();
		}
	}

	function selectWeatherMode(mode: 'forecast' | 'radar') {
		if (weatherMode === mode) return;
		stopWeatherAnimation();
		weatherMode = mode;
		weatherError = false;
		removeRadarLayer();
		removeForecastLayer();
		if (!weatherEnabled) return;
		if (mode === 'forecast') {
			if (forecast) updateForecastLayer();
			else void loadForecast();
		} else if (radarFrames.length > 0) {
			updateRadarLayer();
		} else {
			void loadRadar();
		}
	}

	function openWeatherPanel() {
		weatherPanelOpen = !weatherPanelOpen;
		if (weatherPanelOpen && !weatherEnabled) setWeatherEnabled(true);
	}

	function selectRadarFrame(index: number) {
		stopWeatherAnimation();
		radarFrameIndex = Math.max(0, Math.min(index, radarFrames.length - 1));
		updateRadarLayer();
	}

	function jumpToLatestRadar() {
		selectRadarFrame(radarFrames.length - 1);
	}

	function toggleRadarAnimation() {
		if (weatherPlaying) {
			stopWeatherAnimation();
			return;
		}
		if (radarFrames.length < 2) return;
		if (radarFrameIndex >= radarFrames.length - 1) {
			radarFrameIndex = 0;
			updateRadarLayer();
		}
		weatherPlaying = true;
		radarAnimationTimer = setInterval(() => {
			if (radarFrameIndex >= radarFrames.length - 1) {
				stopWeatherAnimation();
				return;
			}
			radarFrameIndex += 1;
			updateRadarLayer();
		}, 1500);
	}

	function updateWeatherOpacity(value: number) {
		weatherOpacity = value;
		radarLayer?.setOpacity(value / 100);
		updateForecastLayer();
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
		windFlow = new WindFlowAnimator(windCanvas);

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
		map.on('movestart zoomstart', () => {
			if (forecastLayerMode === 'wind') windFlow?.stop(true);
		});
		map.on('moveend', () => {
			if (!weatherEnabled || weatherMode !== 'forecast') return;
			if (forecastMoveTimer) clearTimeout(forecastMoveTimer);
			forecastMoveTimer = setTimeout(() => void loadForecast(false), 350);
		});

		// Trigger size recalculation in case container layout is computing
		requestAnimationFrame(() => {
			map?.invalidateSize();
		});

		if (mapContainer && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(() => {
				requestAnimationFrame(() => {
					map?.invalidateSize();
					if (forecastLayerMode === 'wind') updateForecastLayer();
				});
			});
			resizeObserver.observe(mapContainer);
		}

		updateMarkers();
		updatePolylines();
		updateChartOverlays();

		radarRefreshTimer = setInterval(
			() => {
				if (!weatherEnabled || document.visibilityState !== 'visible') return;
				if (weatherMode === 'radar') void loadRadar(true);
				else void loadForecast(true);
			},
			5 * 60 * 1000
		);
	});

	onDestroy(() => {
		if (feedbackTimer) clearTimeout(feedbackTimer);
		stopWeatherAnimation();
		windFlow?.destroy();
		windFlow = null;
		if (forecastMoveTimer) clearTimeout(forecastMoveTimer);
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
	style="container-type:size"
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
	<canvas
		bind:this={windCanvas}
		class:hidden={!weatherEnabled || weatherMode !== 'forecast' || forecastLayerMode !== 'wind'}
		class="pointer-events-none absolute inset-0 h-full w-full"
		style="z-index: 425"
		aria-hidden="true"
		data-weather-layer="wind-flow"
	></canvas>

	<!-- Map Toolbar Overlay -->
	<div
		class="map-weather-controls pointer-events-none absolute top-3 right-3 bottom-3 z-1000 flex min-h-0 flex-col items-end gap-2 sm:flex-row sm:items-start"
	>
		<div
			class="map-toolbar pointer-events-auto flex flex-col gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/92 p-1.5 text-xs shadow-lg backdrop-blur-xs sm:order-2"
		>
			<button
				type="button"
				onclick={() => (isAddMode = !isAddMode)}
				aria-pressed={isAddMode}
				aria-label={m.map_add_waypoint()}
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
				<span class="map-toolbar-label">{m.map_add_waypoint()}</span>
			</button>

			<button
				bind:this={weatherTrigger}
				type="button"
				onclick={openWeatherPanel}
				aria-expanded={weatherPanelOpen}
				aria-pressed={weatherEnabled}
				aria-label={m.map_weather()}
				aria-controls="weather-overlay-panel"
				class={`relative flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
					weatherEnabled
						? 'border-cyan-500/70 bg-cyan-950/80 text-cyan-100'
						: 'border-transparent bg-slate-800 text-slate-300'
				}`}
				title={m.map_weather_help()}
			>
				<Icon name="cloud" class="h-4 w-4 text-cyan-400" />
				<span class="map-toolbar-label">{m.map_weather()}</span>
				{#if weatherEnabled}
					<span class="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-cyan-300"></span>
				{/if}
			</button>

			{#if flightPlanStore.waypoints.length > 0}
				<button
					type="button"
					onclick={fitRoute}
					aria-label={m.map_fit_route()}
					class="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
					title={m.map_fit_route_help()}
				>
					<Icon name="scan" class="h-4 w-4 text-cyan-400" />
					<span class="map-toolbar-label">{m.map_fit_route()}</span>
				</button>
			{/if}

			<button
				type="button"
				onclick={() => {
					if (map) {
						map.setView([40.4167, -3.7037], 6);
					}
				}}
				aria-label={m.map_center()}
				class="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
				title="Reset map view to Spain VFR region"
			>
				<Icon name="map-pin" class="h-4 w-4 text-cyan-400" />
				<span class="map-toolbar-label">{m.map_center()}</span>
			</button>
		</div>

		{#if weatherPanelOpen}
			<section
				id="weather-overlay-panel"
				class="weather-panel pointer-events-auto max-h-full min-h-0 w-[min(19.5rem,calc(100vw-1.5rem))] shrink-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-700/80 bg-slate-950/94 p-4 text-slate-100 shadow-2xl backdrop-blur-xl sm:order-1"
				aria-label={m.map_weather_title()}
			>
				<div
					class="weather-panel-header sticky -top-4 z-10 -mx-4 -mt-4 flex items-start justify-between gap-3 border-b border-transparent bg-slate-950/94 px-4 pt-4 pb-2 backdrop-blur-xl"
				>
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-sm font-bold">
								{weatherMode === 'forecast'
									? m.map_weather_forecast()
									: m.map_weather_radar_title()}
							</h2>
							{#if weatherMode === 'forecast'}
								<span
									class="rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-violet-200 uppercase"
								>
									{m.map_weather_forecast_badge()}
								</span>
							{:else if selectedRadarFrame}
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
						<p class="mt-1 text-[11px] text-slate-400">
							{weatherMode === 'forecast'
								? forecastLayerMode === 'wind'
									? m.map_weather_wind_summary()
									: m.map_weather_forecast_summary()
								: m.map_weather_history()}
						</p>
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
							onclick={closeWeatherPanel}
							aria-label={m.map_weather_close()}
							class="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
						>
							<Icon name="x" class="h-4 w-4" />
						</button>
					</div>
				</div>

				<div
					class="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1"
					role="tablist"
					aria-label={m.map_weather_title()}
				>
					<button
						type="button"
						role="tab"
						aria-selected={weatherMode === 'forecast'}
						disabled={weatherLoading}
						onclick={() => selectWeatherMode('forecast')}
						class={`min-h-11 rounded-lg px-2 text-xs font-bold transition-colors ${
							weatherMode === 'forecast'
								? 'bg-violet-500 text-white shadow-sm'
								: 'text-slate-400 hover:bg-slate-800 hover:text-white'
						}`}
					>
						{m.map_weather_forecast()}
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={weatherMode === 'radar'}
						disabled={weatherLoading}
						onclick={() => selectWeatherMode('radar')}
						class={`min-h-11 rounded-lg px-2 text-xs font-bold transition-colors ${
							weatherMode === 'radar'
								? 'bg-cyan-500 text-slate-950 shadow-sm'
								: 'text-slate-400 hover:bg-slate-800 hover:text-white'
						}`}
					>
						{m.map_weather_radar()}
					</button>
				</div>

				{#if weatherLoading}
					<div
						class="mt-4 flex min-h-20 items-center justify-center gap-2 text-sm text-slate-300"
						role="status"
					>
						<Icon name="loader" class="h-4 w-4 text-cyan-400" />
						<span
							>{weatherMode === 'forecast'
								? m.map_weather_forecast_loading()
								: m.map_weather_loading()}</span
						>
					</div>
				{:else if weatherError}
					<div class="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3" role="alert">
						<p class="text-sm text-amber-100">
							{weatherMode === 'forecast' ? m.map_weather_forecast_error() : m.map_weather_error()}
						</p>
						<button
							type="button"
							onclick={() => (weatherMode === 'forecast' ? loadForecast(true) : loadRadar(true))}
							class="mt-2 min-h-11 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 hover:bg-amber-300"
						>
							{m.map_weather_retry()}
						</button>
					</div>
				{:else if weatherMode === 'forecast' && forecast && selectedForecastTime}
					<div class="mt-4">
						<p class="mb-1.5 text-[11px] font-semibold text-slate-300">
							{m.map_weather_forecast_layer()}
						</p>
						<div
							class="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1"
							role="group"
							aria-label={m.map_weather_forecast_layer()}
						>
							<button
								type="button"
								aria-pressed={forecastLayerMode === 'precipitation'}
								onclick={() => selectForecastLayer('precipitation')}
								class={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-bold transition-colors ${
									forecastLayerMode === 'precipitation'
										? 'bg-blue-500 text-white shadow-sm'
										: 'text-slate-400 hover:bg-slate-800 hover:text-white'
								}`}
							>
								<Icon name="cloud" class="h-4 w-4" />
								{m.map_weather_precipitation()}
							</button>
							<button
								type="button"
								aria-pressed={forecastLayerMode === 'wind'}
								onclick={() => selectForecastLayer('wind')}
								class={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-xs font-bold transition-colors ${
									forecastLayerMode === 'wind'
										? 'bg-cyan-400 text-slate-950 shadow-sm'
										: 'text-slate-400 hover:bg-slate-800 hover:text-white'
								}`}
							>
								<Icon name="wind" class="h-4 w-4" />
								{m.map_weather_wind()}
							</button>
						</div>
					</div>

					<div class="mt-4">
						<label
							for="forecast-datetime"
							class="mb-1.5 block text-[11px] font-semibold text-slate-300"
						>
							{m.map_weather_forecast_datetime()}
						</label>
						<input
							id="forecast-datetime"
							type="datetime-local"
							value={formatDateTimeInput(selectedForecastTime)}
							min={formatDateTimeInput(
								forecast.times[nearestForecastFrameIndex(forecast.times, Date.now() / 1000)]
							)}
							max={formatDateTimeInput(forecast.times[forecast.times.length - 1])}
							step="3600"
							disabled={!weatherEnabled}
							onchange={(event) => selectForecastDate(event.currentTarget.value)}
							class="min-h-11 w-full rounded-lg border border-violet-500/40 bg-slate-900 px-3 py-2 font-mono text-sm font-semibold text-white scheme-dark focus:border-violet-400 focus:ring-violet-400 disabled:opacity-40"
						/>
					</div>

					<div class="mt-3 rounded-xl border border-violet-400/20 bg-violet-950/25 p-3">
						<div class="flex items-start justify-between gap-3">
							<div role="status" aria-live="polite">
								<p class="font-mono text-base font-bold text-white">
									{formatForecastDateTime(selectedForecastTime)} UTC
								</p>
								{#if forecastLayerMode === 'wind'}
									<p class="mt-1 text-[11px] font-semibold text-cyan-200">
										{m.map_weather_wind_speed({
											average: (forecastWindStats.total / forecastWindStats.count).toFixed(0),
											peak: forecastWindStats.peak.toFixed(0)
										})}
									</p>
									<p class="mt-0.5 text-[10px] text-slate-400">
										{m.map_weather_wind_height()}
									</p>
								{:else}
									<p class="mt-1 text-[11px] font-semibold text-violet-200">
										{m.map_weather_forecast_peak({
											amount: forecastFrameStats.peak.toFixed(1)
										})}
										· {m.map_weather_forecast_chance({
											probability: String(Math.round(forecastFrameStats.probability))
										})}
									</p>
								{/if}
							</div>
							<button
								type="button"
								onclick={jumpToCurrentForecast}
								class="min-h-8 shrink-0 rounded-md px-2 text-[11px] font-bold text-violet-200 hover:bg-violet-900/60"
							>
								{m.map_weather_forecast_now()}
							</button>
						</div>
					</div>

					<div class="mt-3 flex items-center gap-3">
						<div class="flex w-12 shrink-0 flex-col items-center gap-1">
							<button
								type="button"
								onclick={toggleForecastAnimation}
								disabled={!weatherEnabled || forecast.times.length < 2}
								aria-label={weatherPlaying
									? m.map_weather_forecast_pause()
									: forecastFrameIndex === forecast.times.length - 1
										? m.map_weather_forecast_replay()
										: m.map_weather_forecast_play()}
								class="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-violet-400 text-slate-950 shadow-lg shadow-violet-950/40 hover:bg-violet-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
							>
								<Icon name={weatherPlaying ? 'pause' : 'play'} class="h-4 w-4" />
							</button>
							<span class="text-[9px] font-semibold text-slate-400">
								{weatherPlaying
									? m.map_weather_pause_short()
									: forecastFrameIndex === forecast.times.length - 1
										? m.map_weather_replay_short()
										: m.map_weather_play_short()}
							</span>
						</div>
						<div class="min-w-0 flex-1">
							<input
								type="range"
								min={nearestForecastFrameIndex(forecast.times, Date.now() / 1000)}
								max={forecast.times.length - 1}
								step="1"
								value={forecastFrameIndex}
								disabled={!weatherEnabled}
								oninput={(event) => selectForecastFrame(Number(event.currentTarget.value))}
								aria-label={m.map_weather_forecast_time()}
								aria-valuetext={`${formatForecastDateTime(selectedForecastTime)} UTC`}
								class="h-7 w-full cursor-pointer accent-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
							/>
							<div
								class="flex justify-between font-mono text-[9px] text-slate-500"
								aria-hidden="true"
							>
								<span>{m.map_weather_forecast_now()}</span>
								<span>{formatForecastDateTime(forecast.times[forecast.times.length - 1])}</span>
							</div>
						</div>
					</div>

					<details class="mt-3 rounded-xl border border-slate-800 bg-slate-900/70">
						<summary
							class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[11px] font-semibold text-slate-300"
						>
							<span>{m.map_weather_display()}</span>
							<span class="flex items-center gap-1.5 font-mono text-slate-400">
								{weatherOpacity}%
								<Icon name="chevron-down" class="weather-display-chevron h-3.5 w-3.5" />
							</span>
						</summary>
						<div class="border-t border-slate-800 px-3 pt-2 pb-3">
							<label for="forecast-opacity" class="sr-only"
								>{forecastLayerMode === 'wind'
									? m.map_weather_wind_opacity()
									: m.map_weather_opacity()}</label
							>
							<input
								id="forecast-opacity"
								type="range"
								min="30"
								max="85"
								step="5"
								value={weatherOpacity}
								disabled={!weatherEnabled}
								oninput={(event) => updateWeatherOpacity(Number(event.currentTarget.value))}
								class="h-7 w-full cursor-pointer accent-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
							/>
							<div class="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
								<span
									>{forecastLayerMode === 'wind'
										? m.map_weather_calm()
										: m.map_weather_light()}</span
								>
								<span
									class:wind-legend={forecastLayerMode === 'wind'}
									class:weather-legend={forecastLayerMode === 'precipitation'}
									class="h-1.5 flex-1 rounded-full"
								></span>
								<span
									>{forecastLayerMode === 'wind'
										? m.map_weather_strong()
										: m.map_weather_heavy()}</span
								>
							</div>
						</div>
					</details>
				{:else if selectedRadarFrame}
					<div class="mt-4">
						<label
							for="weather-datetime"
							class="mb-1.5 block text-[11px] font-semibold text-slate-300"
						>
							{m.map_weather_datetime()}
						</label>
						<select
							id="weather-datetime"
							value={radarFrameIndex}
							disabled={!weatherEnabled}
							onchange={(event) => selectRadarFrame(Number(event.currentTarget.value))}
							class="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm font-semibold text-white scheme-dark focus:border-cyan-400 focus:ring-cyan-400 disabled:opacity-40"
						>
							{#each radarFrames as frame, index (frame.time)}
								<option value={index}>{formatRadarDateTimeInput(frame.time)}</option>
							{/each}
						</select>
					</div>

					<div class="mt-3 flex items-center gap-3">
						<div class="flex w-12 shrink-0 flex-col items-center gap-1">
							<button
								type="button"
								onclick={toggleRadarAnimation}
								disabled={!weatherEnabled || radarFrames.length < 2}
								aria-label={weatherPlaying
									? m.map_weather_pause()
									: radarFrameIndex === radarFrames.length - 1
										? m.map_weather_replay()
										: m.map_weather_play()}
								class="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/40 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
							>
								<Icon name={weatherPlaying ? 'pause' : 'play'} class="h-4 w-4" />
							</button>
							<span class="text-[9px] font-semibold text-slate-400">
								{weatherPlaying
									? m.map_weather_pause_short()
									: radarFrameIndex === radarFrames.length - 1
										? m.map_weather_replay_short()
										: m.map_weather_play_short()}
							</span>
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline justify-between gap-2">
								<div role="status" aria-live="polite">
									<p class="font-mono text-base font-bold text-white">
										{formatRadarTime(selectedRadarFrame.time)}
									</p>
									<p class="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
										<span
											>{m.map_weather_frame({
												current: String(radarFrameIndex + 1),
												total: String(radarFrames.length)
											})}</span
										>
										{#if radarTilesLoading}
											<span class="text-cyan-300">· {m.map_weather_updating()}</span>
										{/if}
									</p>
								</div>
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
									stopWeatherAnimation();
									radarFrameIndex = Number(event.currentTarget.value);
								}}
								onchange={() => updateRadarLayer()}
								aria-label={m.map_weather_time()}
								aria-valuetext={formatRadarTime(selectedRadarFrame.time)}
								class="mt-2 h-7 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
							/>
							<div
								class="flex justify-between font-mono text-[9px] text-slate-500"
								aria-hidden="true"
							>
								<span>{formatRadarTime(radarFrames[0].time)}</span>
								<span
									>{formatRadarTime(radarFrames[radarFrames.length - 1].time)} · {m.map_weather_latest()}</span
								>
							</div>
						</div>
					</div>

					<details class="mt-3 rounded-xl border border-slate-800 bg-slate-900/70">
						<summary
							class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[11px] font-semibold text-slate-300"
						>
							<span>{m.map_weather_display()}</span>
							<span class="flex items-center gap-1.5 font-mono text-slate-400">
								{weatherOpacity}%
								<Icon name="chevron-down" class="weather-display-chevron h-3.5 w-3.5" />
							</span>
						</summary>
						<div class="border-t border-slate-800 px-3 pt-2 pb-3">
							<label for="weather-opacity" class="sr-only">{m.map_weather_opacity()}</label>
							<input
								id="weather-opacity"
								type="range"
								min="30"
								max="85"
								step="5"
								value={weatherOpacity}
								disabled={!weatherEnabled}
								oninput={(event) => updateWeatherOpacity(Number(event.currentTarget.value))}
								class="h-7 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
							/>
							<div class="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
								<span>{m.map_weather_light()}</span>
								<span class="weather-legend h-1.5 flex-1 rounded-full"></span>
								<span>{m.map_weather_heavy()}</span>
							</div>
						</div>
					</details>
				{/if}

				<a
					href={weatherMode === 'forecast'
						? 'https://open-meteo.com/'
						: 'https://www.rainviewer.com/'}
					target="_blank"
					rel="noreferrer"
					class="mt-3 inline-block text-[10px] text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
				>
					{weatherMode === 'forecast' ? m.map_weather_forecast_source() : m.map_weather_source()}
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
	{:else if flightPlanStore.waypoints.length === 0 && !weatherPanelOpen}
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
		filter: invert(1) hue-rotate(180deg) brightness(0.78) contrast(1.08) saturate(0.82);
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

	:global(.weather-forecast-field) {
		filter: blur(8px) saturate(1.2) contrast(1.04);
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

	.wind-legend {
		background: linear-gradient(90deg, #67e8f9 0%, #e0f2fe 52%, #c4b5fd 100%);
	}

	:global(details[open] .weather-display-chevron) {
		transform: rotate(180deg);
	}

	@container (max-height: 520px) {
		.map-weather-controls {
			inset: 0.75rem;
			display: block;
		}

		.map-toolbar {
			position: absolute;
			top: 0;
			right: 0;
		}

		.weather-panel {
			position: absolute;
			right: 0;
			bottom: 0;
			left: auto;
			width: min(32rem, 100%);
			max-height: 70cqh;
		}
	}

	@container (max-width: 560px) {
		.map-weather-controls {
			inset: 0.75rem;
			display: block;
		}

		.map-toolbar {
			position: absolute;
			top: 0;
			right: 0;
		}

		.weather-panel {
			position: absolute;
			right: 0;
			bottom: 0;
			left: 0;
			width: auto;
			max-height: 70cqh;
		}
	}

	@container (max-width: 520px) {
		.map-toolbar-label {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.weather-radar-tiles) {
			transition: none !important;
		}
	}
</style>
