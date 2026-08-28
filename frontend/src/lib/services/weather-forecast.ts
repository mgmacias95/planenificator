export interface ForecastBounds {
	south: number;
	west: number;
	north: number;
	east: number;
}

export const WIND_LEVELS = ['surface', '925hPa', '850hPa', '700hPa', '500hPa'] as const;
export type WindLevel = (typeof WIND_LEVELS)[number];

export interface WindSeries {
	speed: number[];
	direction: number[];
}

const WIND_VARIABLES: Record<WindLevel, { speed: string; direction: string }> = {
	surface: { speed: 'wind_speed_10m', direction: 'wind_direction_10m' },
	'925hPa': { speed: 'wind_speed_925hPa', direction: 'wind_direction_925hPa' },
	'850hPa': { speed: 'wind_speed_850hPa', direction: 'wind_direction_850hPa' },
	'700hPa': { speed: 'wind_speed_700hPa', direction: 'wind_direction_700hPa' },
	'500hPa': { speed: 'wind_speed_500hPa', direction: 'wind_direction_500hPa' }
};

export interface ForecastPoint {
	latitude: number;
	longitude: number;
	precipitation: number[];
	precipitationProbability: number[];
	winds: Record<WindLevel, WindSeries>;
}

export interface WeatherForecast {
	times: number[];
	points: ForecastPoint[];
	bounds: ForecastBounds;
	fetchedAt: number;
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_DURATION_MS = 30 * 60 * 1000;
const GRID_COLUMNS = 5;
const GRID_ROWS = 4;
const forecastCache = new Map<string, WeatherForecast>();
const inFlightRequests = new Map<string, Promise<WeatherForecast>>();

interface OpenMeteoLocation {
	latitude?: unknown;
	longitude?: unknown;
	hourly?: Record<string, unknown>;
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
		hourly: [
			'precipitation',
			'precipitation_probability',
			...WIND_LEVELS.flatMap((level) => [
				WIND_VARIABLES[level].speed,
				WIND_VARIABLES[level].direction
			])
		].join(','),
		wind_speed_unit: 'kn',
		timezone: 'UTC',
		timeformat: 'unixtime',
		forecast_days: '8',
		cell_selection: 'nearest'
	}).toString();
	return url.toString();
}

export function parseWeatherForecast(
	value: unknown,
	bounds: ForecastBounds,
	fetchedAt = Date.now()
): WeatherForecast {
	const locations = (Array.isArray(value) ? value : [value]) as OpenMeteoLocation[];
	if (locations.length === 0) throw new Error('Forecast data is unavailable');

	let times: number[] | null = null;
	const points: ForecastPoint[] = [];
	for (const location of locations) {
		const locationTimes = finiteNumbers(location?.hourly?.time);
		const precipitation = finiteNumbers(location?.hourly?.precipitation);
		const probability = finiteNumbers(location?.hourly?.precipitation_probability);
		const winds = Object.fromEntries(
			WIND_LEVELS.map((level) => {
				const variables = WIND_VARIABLES[level];
				return [
					level,
					{
						speed: finiteNumbers(location?.hourly?.[variables.speed]),
						direction: finiteNumbers(location?.hourly?.[variables.direction])
					}
				];
			})
		) as Record<WindLevel, { speed: number[] | null; direction: number[] | null }>;
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
			probability.length !== locationTimes.length ||
			WIND_LEVELS.some(
				(level) =>
					!winds[level].speed ||
					!winds[level].direction ||
					winds[level].speed.length !== locationTimes.length ||
					winds[level].direction.length !== locationTimes.length
			)
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
		points.push({
			latitude,
			longitude,
			precipitation,
			precipitationProbability: probability,
			winds: winds as Record<WindLevel, WindSeries>
		});
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

export async function fetchWeatherForecast(
	bounds: ForecastBounds,
	fetcher: typeof fetch = fetch,
	forceRefresh = false
): Promise<WeatherForecast> {
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
		const forecast = parseWeatherForecast(await response.json(), bounds);
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
