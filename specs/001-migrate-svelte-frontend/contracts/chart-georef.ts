/**
 * Aeronautical Chart Georeferencing & Parser Contract
 */

import type { ChartOverlay } from '../../../frontend/src/lib/types/flight';

export interface WorldFileMetrics {
  pixelScaleX: number;
  rotationY: number;
  rotationX: number;
  pixelScaleY: number;
  originX: number;
  originY: number;
}

export interface EnaireCatalogItem {
  id: string;
  name: string;
  downloadUrl: string;
  region: string;
  isCanaries?: boolean;
}

export interface IChartGeoreferencer {
  /**
   * Parses world file text content (.TFW / .tfw) into numeric transformation metrics.
   */
  parseWorldFile(tfwContent: string): WorldFileMetrics;

  /**
   * Projects Lambert Conformal Conic (LCC) or UTM coordinates into WGS84 (EPSG:4326) LatLng.
   */
  projectToWgs84(x: number, y: number, isCanaries: boolean): { lat: number; lng: number };

  /**
   * Unpacks a ZIP archive containing TIFF and TFW files in-memory.
   */
  unpackZipChart(zipBuffer: ArrayBuffer): Promise<{ tiffBuffer: ArrayBuffer; tfwText: string; filename: string }>;

  /**
   * Reads a GeoTIFF image buffer, parses dimensions, downsamples to max canvas size (8192px),
   * calculates geographic bounds, and generates a rendered HTMLCanvasElement or Blob URL.
   */
  processRasterChart(
    name: string,
    tiffBuffer: ArrayBuffer,
    tfwText: string
  ): Promise<ChartOverlay>;

  /**
   * Retrieves the catalog list of available regional charts from ENAIRE Open Data.
   */
  fetchEnaireCatalog(): Promise<EnaireCatalogItem[]>;

  /**
   * Fetches an online chart ZIP package by URL and converts it into a ChartOverlay.
   */
  loadOnlineChart(catalogItem: EnaireCatalogItem): Promise<ChartOverlay>;
}
