export interface RadarFrame {
	time: number;
	path: string;
}

export interface RadarTimeline {
	host: string;
	generated: number;
	frames: RadarFrame[];
}

const WEATHER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const CACHE_DURATION_MS = 5 * 60 * 1000;

let cachedTimeline: RadarTimeline | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<RadarTimeline> | null = null;

function isRadarFrame(value: unknown): value is RadarFrame {
	if (!value || typeof value !== 'object') return false;
	const frame = value as Record<string, unknown>;
	return (
		typeof frame.time === 'number' &&
		Number.isFinite(frame.time) &&
		typeof frame.path === 'string' &&
		frame.path.startsWith('/')
	);
}

export function parseRadarTimeline(value: unknown): RadarTimeline {
	if (!value || typeof value !== 'object') throw new Error('Invalid radar response');
	const payload = value as Record<string, unknown>;
	const radar = payload.radar as Record<string, unknown> | undefined;
	const host = typeof payload.host === 'string' ? payload.host.replace(/\/$/, '') : '';
	const generated = typeof payload.generated === 'number' ? payload.generated : 0;
	const past = Array.isArray(radar?.past) ? radar.past.filter(isRadarFrame) : [];

	if (!host.startsWith('https://') || past.length === 0) {
		throw new Error('Radar data is unavailable');
	}

	return {
		host,
		generated,
		frames: [...past].sort((a, b) => a.time - b.time)
	};
}

export async function fetchRadarTimeline(
	fetcher: typeof fetch = fetch,
	forceRefresh = false
): Promise<RadarTimeline> {
	if (!forceRefresh && cachedTimeline && Date.now() - cachedAt < CACHE_DURATION_MS) {
		return cachedTimeline;
	}
	if (inFlightRequest) return inFlightRequest;

	inFlightRequest = (async () => {
		const response = await fetcher(WEATHER_MAPS_URL, {
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) throw new Error(`Radar request failed (${response.status})`);

		const timeline = parseRadarTimeline(await response.json());
		cachedTimeline = timeline;
		cachedAt = Date.now();
		return timeline;
	})();

	try {
		return await inFlightRequest;
	} finally {
		inFlightRequest = null;
	}
}

export function radarTileUrl(timeline: RadarTimeline, frame: RadarFrame): string {
	return `${timeline.host}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`;
}
