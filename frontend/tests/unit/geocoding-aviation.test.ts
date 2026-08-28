import { describe, it, expect, beforeEach } from 'vitest';
import { GeocodingService } from '$lib/services/geocoding';
import type { GazetteerDataset } from '$lib/types/geocoding';

const mockAviationDataset: GazetteerDataset = {
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
		},
		{
			name: 'Algeciras Heliport',
			ident: 'LEAG',
			lat: 36.1288,
			lon: -5.4411,
			type: 'heliport'
		}
	],
	places: [
		{
			name: 'Alcorcón',
			lat: 40.3458,
			lon: -3.8249,
			type: 'city',
			pop: 170000
		},
		{
			name: 'Robledillo de Mohernando',
			lat: 40.864,
			lon: -3.24,
			type: 'village',
			pop: 150
		},
		{
			name: 'Algeciras',
			lat: 36.1333,
			lon: -5.45,
			type: 'city',
			pop: 120000
		},
		{
			name: 'Humanes de Madrid',
			lat: 40.2528,
			lon: -3.8294,
			type: 'town',
			pop: 20000
		}
	]
};

describe('GeocodingService - User Story 2 (Aviation Snapping & Priority)', () => {
	let service: GeocodingService;

	beforeEach(async () => {
		service = new GeocodingService();
		await service.loadGazetteer(mockAviationDataset);
	});

	it('prioritizes aerodrome when within 2.0 NM over closer or neighboring town', () => {
		// Point placed ~0.8 NM from LECU (40.3706, -3.7853)
		const match = service.reverseGeocodeDetailed(40.365, -3.77);
		expect(match.resolvedName).toBe('LECU - Madrid / Cuatro Vientos');
		expect(match.category).toBe('aerodrome');
		expect(match.distanceNm).toBeLessThanOrEqual(2.0);
		expect(match.source).toBe('OurAirports');
	});

	it('prioritizes airfield with ident (e.g. LERM) when within 2.0 NM of Robledillo', () => {
		// Point placed near LERM (< 0.5 NM)
		const match = service.reverseGeocodeDetailed(40.865, -3.248);
		expect(match.resolvedName).toBe('LERM - Robledillo de Mohernando Airfield');
		expect(match.category).toBe('aerodrome');
		expect(match.distanceNm).toBeLessThanOrEqual(2.0);
	});

	it('selects settlement when point is outside 2.0 NM radius from aerodrome', () => {
		// Point in Alcorcón (~3.2 NM from LECU, well outside 2.0 NM aerodrome radius)
		const match = service.reverseGeocodeDetailed(40.33, -3.82);
		expect(match.resolvedName).toBe('Alcorcón');
		expect(match.category).toBe('settlement');
		expect(match.source).toBe('GeoNames');
	});

	it('handles heliports with proper category and ident formatting within 2.0 NM', () => {
		const match = service.reverseGeocodeDetailed(36.128, -5.441);
		expect(match.resolvedName).toBe('LEAG - Algeciras Heliport');
		expect(match.category).toBe('heliport');
		expect(match.distanceNm).toBeLessThanOrEqual(2.0);
	});
});
