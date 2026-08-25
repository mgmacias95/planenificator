/**
 * Domain TypeScript types and interfaces for Offline Client-Side Reverse Geocoding.
 */

export interface AerodromeRecord {
	name: string;
	lat: number;
	lon: number;
	type: 'aerodrome' | 'heliport' | 'seaplane';
	ident?: string;
}

export interface SettlementRecord {
	name: string;
	lat: number;
	lon: number;
	type: 'city' | 'town' | 'village';
	pop?: number;
}

export interface GazetteerDataset {
	version: string;
	region: string;
	generatedAt: string;
	airports: AerodromeRecord[];
	places: SettlementRecord[];
}

export interface GeocodingMatch {
	resolvedName: string;
	distanceKm: number;
	distanceNm: number;
	category: 'aerodrome' | 'heliport' | 'seaplane' | 'settlement' | 'coordinate_fallback';
	source?: 'OurAirports' | 'GeoNames' | 'Coordinates';
	record?: AerodromeRecord | SettlementRecord;
}

export interface SpatialGridBucket<T> {
	items: Array<{
		item: T;
		lat: number;
		lon: number;
	}>;
}

export type GridKey = `${number},${number}`;

export interface ReverseGeocodeOptions {
	/**
	 * Maximum search radius in Nautical Miles for aerodrome snapping (default: 2.0 NM)
	 */
	aerodromeRadiusNm?: number;

	/**
	 * Maximum search radius in kilometers for settlement search (default: 20.0 km)
	 */
	settlementRadiusKm?: number;
}

export interface IGeocodingService {
	loadGazetteer(customUrlOrData?: string | GazetteerDataset): Promise<void>;
	isReady(): boolean;
	reverseGeocode(lat: number, lon: number, options?: ReverseGeocodeOptions): string;
	reverseGeocodeDetailed(lat: number, lon: number, options?: ReverseGeocodeOptions): GeocodingMatch;
}
