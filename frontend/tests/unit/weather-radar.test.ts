import { describe, expect, it } from 'vitest';
import { parseRadarTimeline, radarTileUrl } from '$lib/services/weather-radar';

describe('weather radar metadata', () => {
	it('keeps observed frames in chronological order and ignores unavailable forecasts', () => {
		const timeline = parseRadarTimeline({
			generated: 1_725_000_700,
			host: 'https://tilecache.rainviewer.com/',
			radar: {
				past: [
					{ time: 1_725_000_600, path: '/v2/radar/latest' },
					{ time: 1_725_000_000, path: '/v2/radar/earlier' }
				],
				nowcast: [{ time: 1_725_001_200, path: '/v2/radar/forecast' }]
			}
		});

		expect(timeline.frames.map((frame) => frame.path)).toEqual([
			'/v2/radar/earlier',
			'/v2/radar/latest'
		]);
		expect(timeline.host).toBe('https://tilecache.rainviewer.com');
	});

	it('builds a Universal Blue 512px tile URL', () => {
		const timeline = parseRadarTimeline({
			generated: 1,
			host: 'https://tiles.example.test',
			radar: { past: [{ time: 2, path: '/v2/radar/frame' }] }
		});

		expect(radarTileUrl(timeline, timeline.frames[0])).toBe(
			'https://tiles.example.test/v2/radar/frame/512/{z}/{x}/{y}/2/1_1.png'
		);
	});

	it('rejects empty or insecure metadata', () => {
		expect(() =>
			parseRadarTimeline({ host: 'https://tiles.example.test', radar: { past: [] } })
		).toThrow('Radar data is unavailable');
		expect(() =>
			parseRadarTimeline({
				host: 'http://tiles.example.test',
				radar: { past: [{ time: 2, path: '/v2/radar/frame' }] }
			})
		).toThrow('Radar data is unavailable');
	});
});
