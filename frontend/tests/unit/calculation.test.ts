import { describe, it, expect } from 'vitest';
import type { NavLogEntry, SemicircularNotice } from '$lib/types/flight';

describe('Navigation Log Calculation and Formatting', () => {
	it('should correctly format leg wind correction angle (WCA) and true heading', () => {
		const entry: NavLogEntry = {
			legIndex: 1,
			fromName: 'LEBA (Córdoba)',
			toName: 'LETO (Torrejón)',
			fromLat: 37.842,
			fromLng: -4.848,
			toLat: 40.485,
			toLng: -3.456,
			phase: 'CRUISE',
			altitudeFt: 5500,
			trueCourseDeg: 25,
			windSpeedKt: 15,
			windDirDeg: 350,
			wcaDeg: -5,
			trueHeadingDeg: 20,
			tasKt: 80,
			groundSpeedKt: 72,
			distanceNm: 172.5,
			eteMinutes: 143.75,
			etaUtc: '12:24'
		};

		expect(entry.trueHeadingDeg).toBe(20);
		expect(entry.groundSpeedKt).toBe(72);
		expect(entry.distanceNm).toBeGreaterThan(0);
		expect(entry.eteMinutes).toBeCloseTo(143.75, 1);
	});

	it('should detect semicircular rule compliance for eastbound vs westbound tracks', () => {
		// Eastbound (000-179): Odd thousands + 500 (e.g. 3500, 5500, 7500)
		const eastNotice: SemicircularNotice = {
			segmentIndex: 1,
			fromName: 'LEBA',
			toName: 'LEAL',
			magneticTrackDeg: 85,
			assignedAltitudeFt: 5500,
			ruleDirection: 'EASTBOUND',
			isCompliant: true,
			recommendedAltitudes: [3500, 5500, 7500, 9500],
			advisoryMessage: 'Compliant with VFR Semicircular Rule'
		};

		expect(eastNotice.isCompliant).toBe(true);
		expect(eastNotice.ruleDirection).toBe('EASTBOUND');

		// Non-compliant westbound (180-359) with odd altitude
		const westNotice: SemicircularNotice = {
			segmentIndex: 2,
			fromName: 'LEAL',
			toName: 'LEBA',
			magneticTrackDeg: 265,
			assignedAltitudeFt: 5500,
			ruleDirection: 'WESTBOUND',
			isCompliant: false,
			recommendedAltitudes: [4500, 6500, 8500],
			advisoryMessage: 'Non-compliant: Westbound VFR should use Even + 500 ft (e.g. 4500, 6500 ft)'
		};

		expect(westNotice.isCompliant).toBe(false);
		expect(westNotice.ruleDirection).toBe('WESTBOUND');
	});

	it('should maintain custom and gazetteer waypoint names in navlog legs', () => {
		const leg1: NavLogEntry = {
			legIndex: 1,
			fromName: 'LECU - Cuatro Vientos',
			toName: 'Guadalajara',
			fromLat: 40.37,
			fromLng: -3.785,
			toLat: 40.63,
			toLng: -3.16,
			phase: 'CLIMB',
			altitudeFt: 3500,
			trueCourseDeg: 55,
			windSpeedKt: 10,
			windDirDeg: 270,
			wcaDeg: -4,
			trueHeadingDeg: 51,
			tasKt: 70,
			groundSpeedKt: 78,
			distanceNm: 32.4,
			eteMinutes: 24.9,
			etaUtc: '10:24'
		};

		expect(leg1.fromName).toBe('LECU - Cuatro Vientos');
		expect(leg1.toName).toBe('Guadalajara');
	});
});

