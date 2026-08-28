import type {
	AerodromeRecord,
	GazetteerDataset,
	GeocodingMatch,
	IGeocodingService,
	ReverseGeocodeOptions,
	SettlementRecord
} from '$lib/types/geocoding';
import { haversineDistanceKm, kmToNm, nmToKm } from '$lib/utils/geo';
import { base } from '$app/paths';

const GRID_CELL_SIZE_DEG = 0.25;
const DEFAULT_AERODROME_RADIUS_NM = 2.0;
const DEFAULT_SETTLEMENT_RADIUS_KM = 20.0;

function getGridKey(lat: number, lon: number): string {
	const latCell = Math.floor(lat / GRID_CELL_SIZE_DEG);
	const lonCell = Math.floor(lon / GRID_CELL_SIZE_DEG);
	return `${latCell},${lonCell}`;
}

interface SpatialItem<T> {
	item: T;
	lat: number;
	lon: number;
}

export class GeocodingService implements IGeocodingService {
	private ready = false;
	private loadingPromise: Promise<void> | null = null;
	private airportGrid = new Map<string, SpatialItem<AerodromeRecord>[]>();
	private placeGrid = new Map<string, SpatialItem<SettlementRecord>[]>();

	/**
	 * Checks whether the gazetteer dataset has been loaded into memory.
	 */
	isReady(): boolean {
		return this.ready;
	}

	/**
	 * Loads the gazetteer dataset into the in-memory spatial index.
	 * Can accept a dataset object directly (useful in unit tests/offline) or a URL string.
	 */
	async loadGazetteer(customUrlOrData?: string | GazetteerDataset): Promise<void> {
		if (this.ready && !customUrlOrData) return;

		if (this.loadingPromise && !customUrlOrData) {
			return this.loadingPromise;
		}

		this.loadingPromise = (async () => {
			let data: GazetteerDataset;

			if (typeof customUrlOrData === 'object' && customUrlOrData !== null) {
				data = customUrlOrData;
			} else {
				const url =
					typeof customUrlOrData === 'string' ? customUrlOrData : `${base}/data/gazetteer-es.json`;
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`Failed to load gazetteer from ${url}: ${response.statusText}`);
				}
				data = (await response.json()) as GazetteerDataset;
			}

			this.buildSpatialIndex(data);
			this.ready = true;
		})();

		return this.loadingPromise;
	}

	/**
	 * Builds 2D spatial grid buckets for rapid geographic neighbor searching.
	 */
	private buildSpatialIndex(data: GazetteerDataset): void {
		this.airportGrid.clear();
		this.placeGrid.clear();

		if (Array.isArray(data.airports)) {
			for (const airport of data.airports) {
				const key = getGridKey(airport.lat, airport.lon);
				let bucket = this.airportGrid.get(key);
				if (!bucket) {
					bucket = [];
					this.airportGrid.set(key, bucket);
				}
				bucket.push({ item: airport, lat: airport.lat, lon: airport.lon });
			}
		}

		if (Array.isArray(data.places)) {
			for (const place of data.places) {
				const key = getGridKey(place.lat, place.lon);
				let bucket = this.placeGrid.get(key);
				if (!bucket) {
					bucket = [];
					this.placeGrid.set(key, bucket);
				}
				bucket.push({ item: place, lat: place.lat, lon: place.lon });
			}
		}
	}

	/**
	 * Finds candidates within a geographic bounding box using grid buckets.
	 */
	private queryGrid<T>(
		grid: Map<string, SpatialItem<T>[]>,
		lat: number,
		lon: number,
		radiusKm: number
	): SpatialItem<T>[] {
		const degLat = radiusKm / 111.0;
		const cosLat = Math.cos((lat * Math.PI) / 180);
		const degLon = radiusKm / (111.0 * Math.max(0.1, Math.abs(cosLat)));

		const minLatCell = Math.floor((lat - degLat) / GRID_CELL_SIZE_DEG);
		const maxLatCell = Math.floor((lat + degLat) / GRID_CELL_SIZE_DEG);
		const minLonCell = Math.floor((lon - degLon) / GRID_CELL_SIZE_DEG);
		const maxLonCell = Math.floor((lon + degLon) / GRID_CELL_SIZE_DEG);

		const results: SpatialItem<T>[] = [];

		for (let latCell = minLatCell; latCell <= maxLatCell; latCell++) {
			for (let lonCell = minLonCell; lonCell <= maxLonCell; lonCell++) {
				const bucket = grid.get(`${latCell},${lonCell}`);
				if (bucket) {
					for (let i = 0; i < bucket.length; i++) {
						results.push(bucket[i]);
					}
				}
			}
		}

		return results;
	}

	/**
	 * Resolves coordinates to the nearest aerodrome, settlement, or coordinate fallback with detailed metadata.
	 */
	reverseGeocodeDetailed(
		lat: number,
		lon: number,
		options?: ReverseGeocodeOptions
	): GeocodingMatch {
		const aerodromeRadiusNm = options?.aerodromeRadiusNm ?? DEFAULT_AERODROME_RADIUS_NM;
		const aerodromeRadiusKm = nmToKm(aerodromeRadiusNm);
		const settlementRadiusKm = options?.settlementRadiusKm ?? DEFAULT_SETTLEMENT_RADIUS_KM;

		// Tier 1: Aerodrome Priority Search
		if (this.airportGrid.size > 0) {
			const airportCandidates = this.queryGrid(this.airportGrid, lat, lon, aerodromeRadiusKm);
			let closestAirport: SpatialItem<AerodromeRecord> | null = null;
			let minAirportDistKm = Infinity;

			for (const candidate of airportCandidates) {
				const distKm = haversineDistanceKm(lat, lon, candidate.lat, candidate.lon);
				if (distKm <= aerodromeRadiusKm && distKm < minAirportDistKm) {
					minAirportDistKm = distKm;
					closestAirport = candidate;
				}
			}

			if (closestAirport) {
				const record = closestAirport.item;
				const distNm = kmToNm(minAirportDistKm);
				let resolvedName = record.name;
				if (record.ident && !record.name.toUpperCase().startsWith(record.ident.toUpperCase())) {
					resolvedName = `${record.ident} - ${record.name}`;
				}

				return {
					resolvedName,
					distanceKm: minAirportDistKm,
					distanceNm: distNm,
					category: record.type,
					source: 'OurAirports',
					record
				};
			}
		}

		// Tier 2: Populated Place / Settlement Search
		if (this.placeGrid.size > 0) {
			const placeCandidates = this.queryGrid(this.placeGrid, lat, lon, settlementRadiusKm);
			let closestPlace: SpatialItem<SettlementRecord> | null = null;
			let minPlaceDistKm = Infinity;

			for (const candidate of placeCandidates) {
				const distKm = haversineDistanceKm(lat, lon, candidate.lat, candidate.lon);
				if (distKm <= settlementRadiusKm && distKm < minPlaceDistKm) {
					minPlaceDistKm = distKm;
					closestPlace = candidate;
				}
			}

			if (closestPlace) {
				const record = closestPlace.item;
				return {
					resolvedName: record.name,
					distanceKm: minPlaceDistKm,
					distanceNm: kmToNm(minPlaceDistKm),
					category: 'settlement',
					source: 'GeoNames',
					record
				};
			}
		}

		// Tier 3: Coordinate Fallback
		return {
			resolvedName: `WP (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
			distanceKm: 0,
			distanceNm: 0,
			category: 'coordinate_fallback',
			source: 'Coordinates'
		};
	}

	/**
	 * Resolves coordinates to the formatted place name string.
	 */
	reverseGeocode(lat: number, lon: number, options?: ReverseGeocodeOptions): string {
		return this.reverseGeocodeDetailed(lat, lon, options).resolvedName;
	}
}

export const geocodingService = new GeocodingService();
