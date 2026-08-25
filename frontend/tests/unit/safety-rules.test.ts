import { describe, it, expect } from 'vitest';

// Semicircular rule checker for VFR flights
function checkSemicircularRule(
	magneticTrackDeg: number,
	altitudeFt: number
): {
	isCompliant: boolean;
	direction: 'EASTBOUND' | 'WESTBOUND';
	recommendedAltitudes: number[];
} {
	const normTrack = ((magneticTrackDeg % 360) + 360) % 360;
	const isEastbound = normTrack >= 0 && normTrack < 180;
	const direction = isEastbound ? 'EASTBOUND' : 'WESTBOUND';

	// For VFR:
	// East (000-179): Odd thousands + 500 (3500, 5500, 7500, 9500...)
	// West (180-359): Even thousands + 500 (4500, 6500, 8500...)
	const thousands = Math.floor((altitudeFt - 500) / 1000);
	const isOddThousands = thousands % 2 !== 0;
	const isPlus500 = altitudeFt % 1000 === 500;

	const isCompliant = isPlus500 && (isEastbound ? isOddThousands : !isOddThousands);
	const recommendedAltitudes = isEastbound
		? [3500, 5500, 7500, 9500, 11500]
		: [4500, 6500, 8500, 10500, 12500];

	return { isCompliant, direction, recommendedAltitudes };
}

// NOTAM altitude conflict filter
function isNotamAltitudeConflict(
	lowerFl: number,
	upperFl: number,
	minAltFt: number,
	maxAltFt: number
): boolean {
	const notamLowerFt = lowerFl * 100;
	const notamUpperFt = upperFl * 100;
	return notamLowerFt <= maxAltFt && notamUpperFt >= minAltFt;
}

describe('Aviation Safety Rules & Corridor Checks', () => {
	it('should validate compliant Eastbound VFR altitudes (odd + 500)', () => {
		const r1 = checkSemicircularRule(45, 3500);
		expect(r1.isCompliant).toBe(true);
		expect(r1.direction).toBe('EASTBOUND');

		const r2 = checkSemicircularRule(120, 5500);
		expect(r2.isCompliant).toBe(true);
		expect(r2.direction).toBe('EASTBOUND');
	});

	it('should flag non-compliant Eastbound VFR altitudes', () => {
		const r1 = checkSemicircularRule(90, 4500); // 4500 is westbound
		expect(r1.isCompliant).toBe(false);

		const r2 = checkSemicircularRule(10, 5000); // 5000 is IFR
		expect(r2.isCompliant).toBe(false);
	});

	it('should validate compliant Westbound VFR altitudes (even + 500)', () => {
		const r1 = checkSemicircularRule(220, 4500);
		expect(r1.isCompliant).toBe(true);
		expect(r1.direction).toBe('WESTBOUND');

		const r2 = checkSemicircularRule(310, 6500);
		expect(r2.isCompliant).toBe(true);
		expect(r2.direction).toBe('WESTBOUND');
	});

	it('should detect NOTAM altitude conflicts within flight profile boundaries', () => {
		// Flight between 2500 ft (departure) and 5500 ft (cruise)
		const minAlt = 2500;
		const maxAlt = 5500;

		// NOTAM active FL20 to FL80 (2000 ft to 8000 ft) -> overlaps
		expect(isNotamAltitudeConflict(20, 80, minAlt, maxAlt)).toBe(true);

		// NOTAM active FL100 to FL150 (10000 ft to 15000 ft) -> no overlap
		expect(isNotamAltitudeConflict(100, 150, minAlt, maxAlt)).toBe(false);
	});
});
