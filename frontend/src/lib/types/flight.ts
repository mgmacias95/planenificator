/**
 * Domain TypeScript interfaces for Planenificator VFR Flight Planning
 */

export interface Waypoint {
	id: string; // Unique identifier (e.g. 'wp-1724601234-1')
	lat: number; // WGS84 Latitude (-90 to +90)
	lng: number; // WGS84 Longitude (-180 to +180)
	name: string; // Display identifier / resolved aerodrome name (e.g. 'LEBA (Córdoba)')
	elevationFt?: number; // Ground elevation in feet AMSL
	isManualName?: boolean; // Whether the user manually renamed this waypoint
}

export interface RouteSegment {
	id: string; // Unique identifier (e.g. 'seg_1')
	cruiseAlt: number; // Cruise Altitude in feet (e.g. 5500)
	waypointIds: string[]; // Ordered list of Waypoint IDs belonging to this segment
	collapsed?: boolean; // UI display state in waypoint drawer
	color?: string; // Distinct color code for map polyline rendering
}

export interface FlightProfile {
	depIcao: string; // Departure ICAO or identifier (e.g. 'LEBA')
	destIcao: string; // Destination ICAO or identifier (e.g. 'LEMD')
	altIcaos: string[]; // Alternate aerodromes list (e.g. ['LETO', 'LEVS'])
	departureTime: string; // ISO 8601 UTC timestamp or local datetime string
	cruiseTas: number; // True Airspeed in cruise (knots, e.g. 80)
	initialAlt: number; // Initial departure/takeoff altitude (feet AMSL, e.g. 300)
	arrivalAlt: number; // Destination pattern/circuit altitude (feet AMSL, e.g. 2000)
	climbVy: number; // Best rate of climb airspeed (knots, e.g. 70)
	climbRateFpm: number; // Climb vertical speed (feet per minute, e.g. 700)
	descentRateFpm: number; // Descent vertical speed (feet per minute, e.g. 500)
}

export interface AircraftPerformanceProfile {
	id: string; // e.g. 'c172' or 'prof_1724601234'
	name: string; // Display title (e.g. 'Cessna 172 Skyhawk')
	cruiseTas: number; // True Airspeed in cruise (knots)
	climbVy: number; // Best rate of climb airspeed (knots)
	climbRateFpm: number; // Climb rate (fpm)
	descentRateFpm: number; // Descent rate (fpm)
	isCustom?: boolean; // Whether this is a user-created profile
	createdAt?: number; // Epoch timestamp
	updatedAt?: number; // Epoch timestamp
}

export const DEFAULT_AIRCRAFT_PRESETS: AircraftPerformanceProfile[] = [
	{
		id: 'lsa',
		name: 'Ultralight / LSA (Default)',
		cruiseTas: 80,
		climbVy: 70,
		climbRateFpm: 700,
		descentRateFpm: 500,
		isCustom: false
	},
	{
		id: 'c172',
		name: 'Cessna 172 Skyhawk',
		cruiseTas: 110,
		climbVy: 74,
		climbRateFpm: 700,
		descentRateFpm: 500,
		isCustom: false
	},
	{
		id: 'pa28',
		name: 'Piper PA-28 Cherokee',
		cruiseTas: 115,
		climbVy: 76,
		climbRateFpm: 650,
		descentRateFpm: 500,
		isCustom: false
	},
	{
		id: 'c152',
		name: 'Cessna 152',
		cruiseTas: 90,
		climbVy: 67,
		climbRateFpm: 600,
		descentRateFpm: 500,
		isCustom: false
	}
];

export interface ChartOverlay {
	id: string; // Unique ID (e.g. 'chart_sevilla_vfr')
	name: string; // Display title (e.g. 'ENAIRE VFR Sevilla 1:500k')
	bounds: {
		// LatLng bounds in WGS84
		southWest: [number, number];
		northEast: [number, number];
	};
	canvasElement?: HTMLCanvasElement;
	sourceCanvas?: HTMLCanvasElement;
	tfwParams?: {
		originX: number;
		originY: number;
		pixelScaleX: number;
		pixelScaleY: number;
		rotationX?: number;
		rotationY?: number;
	};
	scale?: number;
	isCanaries?: boolean;
	imageBlobUrl?: string; // Renderable raster data URL or object URL
	opacity: number; // 0.0 to 1.0
	visible: boolean; // Active display toggle
	sourceType: 'online_catalog' | 'user_upload';
	sourceUrl?: string; // Remote download URL if from ENAIRE catalog
}

export interface NavLogEntry {
	legIndex: number;
	fromName: string;
	toName: string;
	fromLat: number;
	fromLng: number;
	toLat: number;
	toLng: number;
	phase: 'CLIMB' | 'CRUISE' | 'DESCENT' | 'LEVEL';
	altitudeFt: number;
	trueCourseDeg: number; // 0-359°
	windSpeedKt: number;
	windDirDeg: number; // 0-360°
	wcaDeg: number; // Wind correction angle (+/- degrees)
	trueHeadingDeg: number; // 0-359°
	tasKt: number;
	groundSpeedKt: number; // Knots
	distanceNm: number; // Nautical miles
	eteMinutes: number; // Estimated Time Enroute for leg
	etaUtc: string; // Estimated Time of Arrival (HH:MMZ)
	notes?: string; // Transition notes (e.g. 'TOC', 'TOD', 'Cruise level change')
}

export interface SemicircularNotice {
	segmentIndex: number;
	fromName: string;
	toName: string;
	magneticTrackDeg: number;
	assignedAltitudeFt: number;
	ruleDirection: 'EASTBOUND' | 'WESTBOUND'; // East: 000-179°, West: 180-359°
	isCompliant: boolean;
	recommendedAltitudes: number[]; // e.g. [3500, 5500, 7500] for East
	advisoryMessage: string;
}

export interface NotamAlert {
	id: string; // NOTAM ID (e.g. 'A1234/26')
	location: string; // ICAO code or region
	validFrom: string; // ISO datetime string
	validTo: string; // ISO datetime string
	qCode: string; // ICAO Q-code
	purpose: string; // Checklist / Scope
	lowerLimitFt?: number;
	upperLimitFt?: number;
	corridorDistanceKm?: number; // Distance to closest route leg
	text: string; // Raw NOTAM text
	summary: string; // Human-readable parsed briefing summary
	severity: 'WARNING' | 'CAUTION' | 'INFO';
}

export interface SavedFlightPlan {
	id: string; // UUID v4
	name: string; // User-provided plan title (e.g. 'Córdoba to Madrid VFR')
	createdAt: number; // Epoch timestamp
	updatedAt: number; // Epoch timestamp
	waypoints: Waypoint[];
	segments: RouteSegment[];
	profile: FlightProfile;
	summary?: {
		depIcao: string;
		destIcao: string;
		totalDistanceNm: number;
		totalEteMinutes: number;
	};
}
