/**
 * Pyodide WebAssembly Engine Execution Contract
 */

import type { Waypoint, RouteSegment, FlightProfile, NavLogEntry, SemicircularNotice, NotamAlert } from '../../../frontend/src/lib/types/flight';

export interface PyodideEngineStatus {
  state: 'uninitialized' | 'loading_wasm' | 'installing_packages' | 'loading_modules' | 'ready' | 'error';
  progressMessage: string;
  error?: string;
}

export interface PyodideCalculationInput {
  waypoints: Waypoint[];
  segments: RouteSegment[];
  profile: FlightProfile;
}

export interface PyodideCalculationResult {
  success: boolean;
  navLog: NavLogEntry[];
  semicircularNotices: SemicircularNotice[];
  notams: NotamAlert[];
  totalDistanceNm: number;
  totalFlightTimeMinutes: number;
  warnings: string[];
  rawTextOutput?: string;
}

export interface IPyodideService {
  /**
   * Initializes the Pyodide WebAssembly runtime, installs micropip packages,
   * creates virtual directories, and fetches/mounts Python modules from static assets.
   */
  init(): Promise<void>;

  /**
   * Checks whether the engine is fully initialized and ready to execute calculations.
   */
  isReady(): boolean;

  /**
   * Current reactive status of the Pyodide runtime.
   */
  getStatus(): PyodideEngineStatus;

  /**
   * Executes the full flight calculation workflow via Python modules in WASM.
   */
  calculateRoute(input: PyodideCalculationInput): Promise<PyodideCalculationResult>;
}
