/**
 * Interface contract for client-side offline reverse geocoding service.
 */

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
  /**
   * Initializes or lazily loads the gazetteer dataset into the in-memory spatial index.
   */
  loadGazetteer(customUrl?: string): Promise<void>;

  /**
   * Checks whether the gazetteer has been loaded and indexed.
   */
  isReady(): boolean;

  /**
   * Resolves a latitude/longitude coordinate pair to the most relevant landmark or settlement.
   *
   * @param lat - Latitude in decimal degrees (WGS84)
   * @param lon - Longitude in decimal degrees (WGS84)
   * @param options - Optional radius thresholds
   * @returns Formatted place name
   */
  reverseGeocode(lat: number, lon: number, options?: ReverseGeocodeOptions): string;
}
