import { describe, it, expect, beforeEach } from 'vitest';
import { GeocodingService } from '$lib/services/geocoding';
import type { GazetteerDataset } from '$lib/types/geocoding';

const mockDataset: GazetteerDataset = {
	version: '1.0',
	region: 'ES',
	generatedAt: '2026-08-25T12:00:00Z',
	airports: [
		{
			name: 'Madrid / Cuatro Vientos',
			ident: 'LECU',
			lat: 40.3706,
			lon: -3.7853,
			type: 'aerodrome'
		},
		{
			name: 'Robledillo de Mohernando Airfield',
			ident: 'LERM',
			lat: 40.8667,
			lon: -3.25,
			type: 'aerodrome'
		}
	],
	places: [
		{
			name: 'Guadalajara',
			lat: 40.6337,
			lon: -3.1674,
			type: 'city',
			pop: 85000
		},
		{
			name: 'Alcalá de Henares',
			lat: 40.4819,
			lon: -3.3635,
			type: 'city',
			pop: 195000
		},
		{
			name: 'Horche',
			lat: 40.5694,
			lon: -3.0631,
			type: 'village',
			pop: 2500
		}
	]
};

describe('GeocodingService - User Story 1 (Settlement Lookup & Fallback)', () => {
	let service: GeocodingService;

	beforeEach(async () => {
		service = new GeocodingService();
		await service.loadGazetteer(mockDataset);
	});

	it('indicates readiness after loading dataset', () => {
		expect(service.isReady()).toBe(true);
	});

	it('resolves exact coordinate of a known settlement', () => {
		// Exactly at Guadalajara (40.6337, -3.1674)
		const name = service.reverseGeocode(40.6337, -3.1674);
		expect(name).toBe('Guadalajara');
	});

	it('resolves nearby coordinates within 20 km to the closest settlement', () => {
		// 3 km from Horche (40.5694, -3.0631) -> (40.58, -3.07)
		const name = service.reverseGeocode(40.58, -3.07);
		expect(name).toBe('Horche');
	});

	it('falls back to WP (lat, lon) coordinates when no landmark is within 20 km', () => {
		// Remote Atlantic/Mediterranean location (36.0, 0.0)
		const name = service.reverseGeocode(36.0, 0.0);
		expect(name).toBe('WP (36.000, 0.000)');
	});

	it('returns detailed match object via reverseGeocodeDetailed', () => {
		const match = service.reverseGeocodeDetailed(40.6337, -3.1674);
		expect(match.resolvedName).toBe('Guadalajara');
		expect(match.category).toBe('settlement');
		expect(match.distanceKm).toBeCloseTo(0, 1);
		expect(match.source).toBe('GeoNames');
	});

	it('returns detailed coordinate fallback when outside settlement radius', () => {
		const match = service.reverseGeocodeDetailed(35.1234, -2.5678);
		expect(match.resolvedName).toBe('WP (35.123, -2.568)');
		expect(match.category).toBe('coordinate_fallback');
		expect(match.source).toBe('Coordinates');
	});

	it('executes reverse geocoding in sub-millisecond time (< 50ms constraint)', () => {
		const start = performance.now();
		for (let i = 0; i < 500; i++) {
			service.reverseGeocode(40.6 + (i % 10) * 0.01, -3.1 - (i % 10) * 0.01);
		}
		const duration = performance.now() - start;
		expect(duration).toBeLessThan(50); // 500 queries in < 50ms
	});
});
