import { describe, expect, it } from 'vitest';
import {
	buildForecastUrl,
	forecastGrid,
	nearestForecastFrameIndex,
	parseWeatherForecast
} from '$lib/services/weather-forecast';
import { windComponents } from '$lib/services/weather-wind-flow';

const bounds = { south: 39, west: -5, north: 43, east: 1 };

function windVariables(speed: number[], direction: number[]) {
	return Object.fromEntries(
		['10m', '925hPa', '850hPa', '700hPa', '500hPa'].flatMap((level, index) => [
			[`wind_speed_${level}`, speed.map((value) => value + index * 5)],
			[`wind_direction_${level}`, direction.map((value) => (value + index * 10) % 360)]
		])
	);
}

describe('weather forecast data', () => {
	it('requests an eight-day hourly precipitation grid', () => {
		const points = forecastGrid(bounds);
		const url = new URL(buildForecastUrl(bounds));

		expect(points).toHaveLength(20);
		expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
		expect(url.searchParams.get('hourly')?.split(',')).toEqual(
			expect.arrayContaining([
				'precipitation',
				'wind_speed_10m',
				'wind_speed_925hPa',
				'wind_speed_850hPa',
				'wind_speed_700hPa',
				'wind_speed_500hPa'
			])
		);
		expect(url.searchParams.get('wind_speed_unit')).toBe('kn');
		expect(url.searchParams.get('forecast_days')).toBe('8');
		expect(url.searchParams.get('timezone')).toBe('UTC');
		expect(url.searchParams.get('latitude')?.split(',')).toHaveLength(20);
		expect(url.searchParams.get('longitude')?.split(',')).toHaveLength(20);
	});

	it('parses aligned locations and finds the closest forecast hour', () => {
		const times = [1_800_000_000, 1_800_003_600, 1_800_007_200];
		const forecast = parseWeatherForecast(
			[
				{
					latitude: 40,
					longitude: -3,
					hourly: {
						time: times,
						precipitation: [0, 0.4, 1.2],
						precipitation_probability: [10, 50, 80],
						...windVariables([5, 10, 15], [180, 200, 220])
					}
				},
				{
					latitude: 41,
					longitude: -2,
					hourly: {
						time: times,
						precipitation: [0, 0.1, 0.7],
						precipitation_probability: [5, 30, 60],
						...windVariables([8, 12, 18], [160, 190, 210])
					}
				}
			],
			bounds,
			123
		);

		expect(forecast.points).toHaveLength(2);
		expect(forecast.times).toEqual(times);
		expect(forecast.fetchedAt).toBe(123);
		expect(forecast.points[0].winds.surface.speed).toEqual([5, 10, 15]);
		expect(forecast.points[0].winds['850hPa'].speed).toEqual([15, 20, 25]);
		expect(nearestForecastFrameIndex(times, times[1] + 100)).toBe(1);
	});

	it('rejects malformed or misaligned location data', () => {
		expect(() => parseWeatherForecast([], bounds)).toThrow('Forecast data is unavailable');
		expect(() =>
			parseWeatherForecast(
				{
					latitude: 40,
					longitude: -3,
					hourly: {
						time: [1, 2],
						precipitation: [0],
						precipitation_probability: [10, 20],
						...windVariables([5, 6], [180, 190])
					}
				},
				bounds
			)
		).toThrow('Forecast data is unavailable');
	});

	it('converts meteorological wind direction into screen flow vectors', () => {
		const northWind = windComponents(20, 0);
		const westWind = windComponents(20, 270);

		expect(northWind.u).toBeCloseTo(0, 5);
		expect(northWind.v).toBeCloseTo(20, 5);
		expect(westWind.u).toBeCloseTo(20, 5);
		expect(westWind.v).toBeCloseTo(0, 5);
	});
});
