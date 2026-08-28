import { describe, expect, it } from 'vitest';
import {
	buildForecastUrl,
	forecastGrid,
	nearestForecastFrameIndex,
	parsePrecipitationForecast
} from '$lib/services/weather-forecast';

const bounds = { south: 39, west: -5, north: 43, east: 1 };

describe('weather forecast data', () => {
	it('requests an eight-day hourly precipitation grid', () => {
		const points = forecastGrid(bounds);
		const url = new URL(buildForecastUrl(bounds));

		expect(points).toHaveLength(20);
		expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
		expect(url.searchParams.get('hourly')).toBe('precipitation,precipitation_probability');
		expect(url.searchParams.get('forecast_days')).toBe('8');
		expect(url.searchParams.get('timezone')).toBe('UTC');
		expect(url.searchParams.get('latitude')?.split(',')).toHaveLength(20);
		expect(url.searchParams.get('longitude')?.split(',')).toHaveLength(20);
	});

	it('parses aligned locations and finds the closest forecast hour', () => {
		const times = [1_800_000_000, 1_800_003_600, 1_800_007_200];
		const forecast = parsePrecipitationForecast(
			[
				{
					latitude: 40,
					longitude: -3,
					hourly: {
						time: times,
						precipitation: [0, 0.4, 1.2],
						precipitation_probability: [10, 50, 80]
					}
				},
				{
					latitude: 41,
					longitude: -2,
					hourly: {
						time: times,
						precipitation: [0, 0.1, 0.7],
						precipitation_probability: [5, 30, 60]
					}
				}
			],
			bounds,
			123
		);

		expect(forecast.points).toHaveLength(2);
		expect(forecast.times).toEqual(times);
		expect(forecast.fetchedAt).toBe(123);
		expect(nearestForecastFrameIndex(times, times[1] + 100)).toBe(1);
	});

	it('rejects malformed or misaligned location data', () => {
		expect(() => parsePrecipitationForecast([], bounds)).toThrow('Forecast data is unavailable');
		expect(() =>
			parsePrecipitationForecast(
				{
					latitude: 40,
					longitude: -3,
					hourly: {
						time: [1, 2],
						precipitation: [0],
						precipitation_probability: [10, 20]
					}
				},
				bounds
			)
		).toThrow('Forecast data is unavailable');
	});
});
