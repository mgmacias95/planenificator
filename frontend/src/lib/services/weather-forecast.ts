export interface ForecastBounds {
	south: number;
	west: number;
	north: number;
	east: number;
}

export interface ForecastPoint {
	latitude: number;
	longitude: number;
	precipitation: number[];
	precipitationProbability: number[];
}

export interface PrecipitationForecast {
	times: number[];
	points: ForecastPoint[];
	bounds: ForecastBounds;
	fetchedAt: number;
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_DURATION_MS = 30 * 60 * 1000;
const GRID_COLUMNS = 5;
const GRID_ROWS = 4;
const forecastCache = new Map<string, PrecipitationForecast>();
const inFlightRequests = new Map<string, Promise<PrecipitationForecast>>();

interface OpenMeteoLocation {
	latitude?: unknown;
	longitude?: unknown;
	hourly?: {
		time?: unknown;
		precipitation?: unknown;
		precipitation_probability?: unknown;
	};
}

function finiteNumbers(value: unknown): number[] | null {
	if (!Array.isArray(value)) return null;
	const values = value.map(Number);
	return values.every(Number.isFinite) ? values : null;
}

function normalizeLongitude(value: number) {
	return Math.max(-180, Math.min(180, value));
}

export function normalizeForecastBounds(bounds: ForecastBounds): ForecastBounds {
	const south = Math.max(-89, Math.min(89, Math.min(bounds.south, bounds.north)));
	const north = Math.max(-89, Math.min(89, Math.max(bounds.south, bounds.north)));
	const west = normalizeLongitude(Math.min(bounds.west, bounds.east));
	const east = normalizeLongitude(Math.max(bounds.west, bounds.east));

	return { south, west, north, east };
}

export function forecastGrid(bounds: ForecastBounds) {
	const normalized = normalizeForecastBounds(bounds);
	const latitudeStep = (normalized.north - normalized.south) / (GRID_ROWS - 1 || 1);
	const longitudeStep = (normalized.east - normalized.west) / (GRID_COLUMNS - 1 || 1);
	const points: Array<{ latitude: number; longitude: number }> = [];

	for (let row = 0; row < GRID_ROWS; row += 1) {
		for (let column = 0; column < GRID_COLUMNS; column += 1) {
			points.push({
				latitude: normalized.south + latitudeStep * row,
				longitude: normalized.west + longitudeStep * column
			});
		}
	}

	return points;
}

export function buildForecastUrl(bounds: ForecastBounds) {
	const points = forecastGrid(bounds);
	const url = new URL(FORECAST_URL);
	url.search = new URLSearchParams({
		latitude: points.map((point) => point.latitude.toFixed(3)).join(','),
		longitude: points.map((point) => point.longitude.toFixed(3)).join(','),
		hourly: 'precipitation,precipitation_probability',
		timezone: 'UTC',
		timeformat: 'unixtime',
		forecast_days: '8',
		cell_selection: 'nearest'
	}).toString();
	return url.toString();
}

export function parsePrecipitationForecast(
	value: unknown,
	bounds: ForecastBounds,
	fetchedAt = Date.now()
): PrecipitationForecast {
	const locations = (Array.isArray(value) ? value : [value]) as OpenMeteoLocation[];
	if (locations.length === 0) throw new Error('Forecast data is unavailable');

	let times: number[] | null = null;
	const points: ForecastPoint[] = [];
	for (const location of locations) {
		const locationTimes = finiteNumbers(location?.hourly?.time);
		const precipitation = finiteNumbers(location?.hourly?.precipitation);
		const probability = finiteNumbers(location?.hourly?.precipitation_probability);
		const latitude = Number(location?.latitude);
		const longitude = Number(location?.longitude);
		if (
			!locationTimes ||
			!precipitation ||
			!probability ||
			!Number.isFinite(latitude) ||
			!Number.isFinite(longitude) ||
			locationTimes.length === 0 ||
			precipitation.length !== locationTimes.length ||
			probability.length !== locationTimes.length
		) {
			continue;
		}
		if (
			times &&
			(locationTimes.length !== times.length ||
				locationTimes.some((time, index) => time !== times?.[index]))
		)
			continue;
		times ??= locationTimes;
		points.push({ latitude, longitude, precipitation, precipitationProbability: probability });
	}

	if (!times || points.length === 0) throw new Error('Forecast data is unavailable');
	return { times, points, bounds: normalizeForecastBounds(bounds), fetchedAt };
}

function cacheKey(bounds: ForecastBounds) {
	const normalized = normalizeForecastBounds(bounds);
	return [normalized.south, normalized.west, normalized.north, normalized.east]
		.map((value) => (Math.round(value * 2) / 2).toFixed(1))
		.join(':');
}

export async function fetchPrecipitationForecast(
	bounds: ForecastBounds,
	fetcher: typeof fetch = fetch,
	forceRefresh = false
): Promise<PrecipitationForecast> {
	const key = cacheKey(bounds);
	const cached = forecastCache.get(key);
	if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_DURATION_MS) return cached;
	const inFlight = inFlightRequests.get(key);
	if (inFlight) return inFlight;

	const request = (async () => {
		const response = await fetcher(buildForecastUrl(bounds), {
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) throw new Error(`Forecast request failed (${response.status})`);
		const forecast = parsePrecipitationForecast(await response.json(), bounds);
		forecastCache.set(key, forecast);
		return forecast;
	})();
	inFlightRequests.set(key, request);

	try {
		return await request;
	} finally {
		inFlightRequests.delete(key);
	}
}

export function nearestForecastFrameIndex(times: number[], timestamp: number) {
	if (times.length === 0) return 0;
	let nearestIndex = 0;
	let nearestDifference = Math.abs(times[0] - timestamp);
	for (let index = 1; index < times.length; index += 1) {
		const difference = Math.abs(times[index] - timestamp);
		if (difference < nearestDifference) {
			nearestIndex = index;
			nearestDifference = difference;
		}
	}
	return nearestIndex;
}
