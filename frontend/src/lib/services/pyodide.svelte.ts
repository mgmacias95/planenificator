import type { PyodideInterface } from 'pyodide';
import { base } from '$app/paths';
import type {
	Waypoint,
	RouteSegment,
	FlightProfile,
	NavLogEntry,
	SemicircularNotice,
	NotamAlert
} from '$lib/types/flight';

declare global {
	interface Window {
		loadPyodide: (options?: { indexURL?: string }) => Promise<PyodideInterface>;
	}
}

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';

export interface PyodideEngineStatus {
	state:
		| 'uninitialized'
		| 'loading_wasm'
		| 'installing_packages'
		| 'loading_modules'
		| 'ready'
		| 'error';
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
	init(): Promise<void>;
	isReady(): boolean;
	getStatus(): PyodideEngineStatus;
	calculateRoute(input: PyodideCalculationInput): Promise<PyodideCalculationResult>;
}

export class PyodideService implements IPyodideService {
	private pyodide: PyodideInterface | null = null;

	status = $state<PyodideEngineStatus>({
		state: 'uninitialized',
		progressMessage: 'Engine not started'
	});

	private initPromise: Promise<void> | null = null;

	async init(): Promise<void> {
		if (this.status.state === 'ready') return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				this.status = {
					state: 'loading_wasm',
					progressMessage: 'Loading WebAssembly Python runtime...'
				};

				if (typeof window === 'undefined' || typeof window.loadPyodide !== 'function') {
					throw new Error('Pyodide script is not loaded in window');
				}

				// Load Pyodide WASM runtime from official CDN distribution
				this.pyodide = await window.loadPyodide({
					indexURL: PYODIDE_INDEX_URL
				});

				this.status = {
					state: 'installing_packages',
					progressMessage: 'Installing aviation & math packages...'
				};

				await this.pyodide.loadPackage(['ssl', 'micropip', 'requests', 'pyodide-http']);
				const micropip = this.pyodide.pyimport('micropip');
				await micropip.install(['geopy', 'tabulate']);

				this.status = {
					state: 'loading_modules',
					progressMessage: 'Mounting Planenificator modules...'
				};

				try {
					this.pyodide.FS.mkdir('planenificator');
				} catch {
					// Directory may already exist
				}

				const files = [
					'__init__.py',
					'helpers.py',
					'kml_parser.py',
					'meteo.py',
					'notams_spain.py',
					'osm.py',
					'planenificator.py',
					'segments.py'
				];

				for (const file of files) {
					const response = await fetch(`${base}/planenificator/${file}?v=${Date.now()}`, {
						cache: 'no-store'
					});
					if (!response.ok) {
						throw new Error(`Failed to load static module ${file} (HTTP ${response.status})`);
					}
					const code = await response.text();
					this.pyodide.FS.writeFile(`planenificator/${file}`, code);
				}

				// Patch Python requests to use browser fetch
				this.pyodide.runPython(`
          import pyodide_http
          pyodide_http.patch_all()
        `);

				this.status = {
					state: 'ready',
					progressMessage: 'Engine Ready (Client-Side WASM)'
				};
			} catch (err: any) {
				console.error('Pyodide initialization failed:', err);
				this.status = {
					state: 'error',
					progressMessage: 'Failed to load Python WASM runtime',
					error: err?.message || String(err)
				};
				throw err;
			}
		})();

		return this.initPromise;
	}

	isReady(): boolean {
		return this.status.state === 'ready' && this.pyodide !== null;
	}

	getStatus(): PyodideEngineStatus {
		return this.status;
	}

	async calculateRoute(input: PyodideCalculationInput): Promise<PyodideCalculationResult> {
		if (!this.isReady() || !this.pyodide) {
			await this.init();
			if (!this.pyodide) {
				throw new Error('Pyodide engine is not initialized');
			}
		}

		const { waypoints, segments, profile } = input;
		const waypointMap = new Map(waypoints.map((w: Waypoint) => [w.id, w]));

		const kmlPaths: string[] = [];
		const cruiseAlts: number[] = [];

		// Generate KML files for each segment
		segments.forEach((seg: RouteSegment, idx: number) => {
			const segWps = seg.waypointIds
				.map((id: string) => waypointMap.get(id))
				.filter((w): w is Waypoint => Boolean(w));

			if (segWps.length >= 2) {
				const kmlFileName = `segment_${idx + 1}.kml`;
				const coordsStr = segWps.map((wp: Waypoint) => `${wp.lng},${wp.lat},0`).join(' ');
				const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Segment ${idx + 1}</name>
      <LineString>
        <coordinates>
          ${coordsStr}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
				this.pyodide!.FS.writeFile(kmlFileName, kmlContent);
				kmlPaths.push(kmlFileName);
				cruiseAlts.push(seg.cruiseAlt);
			}
		});

		if (kmlPaths.length === 0) {
			throw new Error('At least one segment must have 2 or more waypoints');
		}

		const depDate = profile.departureTime ? new Date(profile.departureTime) : new Date();
		const depTimeEpoch = depDate.getTime() / 1000;

		this.pyodide.globals.set('py_kmls', this.pyodide.toPy(kmlPaths));
		this.pyodide.globals.set('py_cruise_alts', this.pyodide.toPy(cruiseAlts));
		this.pyodide.globals.set('py_tas', profile.cruiseTas);
		this.pyodide.globals.set('py_initial_alt', profile.initialAlt);
		this.pyodide.globals.set('py_arrival_alt', profile.arrivalAlt);
		this.pyodide.globals.set('py_vy', profile.climbVy);
		this.pyodide.globals.set('py_climb_rate', profile.climbRateFpm);
		this.pyodide.globals.set('py_descent_rate', profile.descentRateFpm);
		this.pyodide.globals.set('py_dep_time_epoch', depTimeEpoch);
		this.pyodide.globals.set('py_dep', profile.depIcao || null);
		this.pyodide.globals.set('py_dest', profile.destIcao || null);
		this.pyodide.globals.set('py_alts', this.pyodide.toPy(profile.altIcaos || []));

		const pythonCode = `
      import json
      import datetime
      import math
      import planenificator.segments

      table, notam_data = planenificator.segments.generate_multi_segment_navigation_report(
          kmls=list(py_kmls),
          cruise_alts=list(py_cruise_alts),
          initial_alt=py_initial_alt,
          arrival_alt=py_arrival_alt,
          tas=py_tas,
          vy=py_vy,
          rate_of_climb=py_climb_rate,
          rate_of_descent=py_descent_rate,
          flight_start_date=datetime.datetime.fromtimestamp(py_dep_time_epoch),
          dep_aerodrome=py_dep or None,
          dest_aerodrome=py_dest or None,
          alt_aerodromes=list(py_alts) if py_alts else None
      )

      serialized_table = []
      for row in table:
          str_row = [str(cell) for cell in row]
          serialized_table.append(str_row)

      json.dumps({
          "table": serialized_table,
          "notam_data": notam_data
      })
    `;

		const rawJson = this.pyodide.runPython(pythonCode);
		const parsed = JSON.parse(rawJson);

		return this.transformPythonResults(parsed, input);
	}

	private transformPythonResults(
		raw: { table: string[][]; notam_data: any },
		input: PyodideCalculationInput
	): PyodideCalculationResult {
		const rawTable = raw.table || [];
		const notamData = raw.notam_data || {};
		const rows = rawTable.slice(1); // skip header row

		const navLog: NavLogEntry[] = [];
		let totalDistanceNm = 0;
		let totalFlightTimeMinutes = 0;

		rows.forEach((row, idx) => {
			if (row[0] === 'Total') {
				totalDistanceNm = parseFloat(row[7]) || 0;
				totalFlightTimeMinutes = parseFloat(row[8]) || 0;
				return;
			}

			const fromTo = row[0].split(' -> ');
			const fromName = fromTo[0] || row[0];
			const toName = fromTo[1] || (rows[idx + 1] ? rows[idx + 1][0] : '');

			const trueCourse = parseFloat(row[1]) || 0;
			const trueHeading = parseFloat(row[2]) || 0;
			const windParts = (row[3] || '').split('/');
			const windDir = parseFloat(windParts[0]) || 0;
			const windSpeed = parseFloat(windParts[1]) || 0;
			const altitude = parseInt(row[4], 10) || 0;
			const tas = parseInt(row[5], 10) || 0;
			const gs = parseInt(row[6], 10) || 0;
			const legDist = parseFloat(row[7]) || 0;
			const ete = parseFloat(row[8]) || 0;
			const eta = row[9] || '';

			const wca = Math.round(trueHeading - trueCourse);

			navLog.push({
				legIndex: idx + 1,
				fromName,
				toName,
				fromLat: 0,
				fromLng: 0,
				toLat: 0,
				toLng: 0,
				phase: fromName.includes('TOC')
					? 'CRUISE'
					: fromName.includes('TOD')
						? 'DESCENT'
						: idx === 0
							? 'CLIMB'
							: 'CRUISE',
				altitudeFt: altitude,
				trueCourseDeg: trueCourse,
				windSpeedKt: windSpeed,
				windDirDeg: windDir,
				wcaDeg: wca,
				trueHeadingDeg: trueHeading,
				tasKt: tas,
				groundSpeedKt: gs,
				distanceNm: legDist,
				eteMinutes: ete,
				etaUtc: eta,
				notes: fromName.includes('TOC')
					? 'Top of Climb'
					: fromName.includes('TOD')
						? 'Top of Descent'
						: undefined
			});
		});

		const semicircularNotices: SemicircularNotice[] = (notamData.semicircular_warnings || []).map(
			(w: string, i: number) => ({
				segmentIndex: i + 1,
				fromName: 'En Route',
				toName: '',
				magneticTrackDeg: 0,
				assignedAltitudeFt: 0,
				ruleDirection: 'EASTBOUND',
				isCompliant: false,
				recommendedAltitudes: [],
				advisoryMessage: w
			})
		);

		const notams: NotamAlert[] = [];

		// Route conflict NOTAMs
		(notamData.route_conflicts || []).forEach((c: any) => {
			notams.push({
				id: c.notamId || 'NOTAM',
				location: c.areaSactaName || 'EN ROUTE',
				validFrom: c.itemB ? new Date(c.itemB).toISOString() : '',
				validTo: c.itemC ? new Date(c.itemC).toISOString() : '',
				qCode: c.qcode || '',
				purpose: 'Route Conflict',
				lowerLimitFt: c.LOWER_VAL ? c.LOWER_VAL * 100 : undefined,
				upperLimitFt: c.UPPER_VAL ? c.UPPER_VAL * 100 : undefined,
				text: c.itemE || '',
				summary: `En Route Conflict FL${c.LOWER_VAL || 0} - FL${c.UPPER_VAL || 'UNL'}`,
				severity: 'WARNING'
			});
		});

		// Aerodrome conflict NOTAMs
		(notamData.aerodrome_conflicts || []).forEach((item: any) => {
			const c = Array.isArray(item) ? item[0] : item;
			const warnType = Array.isArray(item) && item[1] ? item[1] : 'ALERT';
			const role = Array.isArray(item) && item[2] ? item[2] : 'AERODROME';

			notams.push({
				id: c.notamId || 'AD NOTAM',
				location: c.itemA || role,
				validFrom: c.itemB ? new Date(c.itemB).toISOString() : '',
				validTo: c.itemC ? new Date(c.itemC).toISOString() : '',
				qCode: c.qcode || '',
				purpose: `${role} ${warnType}`,
				text: c.itemE || '',
				summary: `AD ${c.itemA || ''} [${role}] ${warnType}`,
				severity: warnType === 'CLOSED' ? 'WARNING' : 'CAUTION'
			});
		});

		const warnings = [...(notamData.semicircular_warnings || [])];

		return {
			success: true,
			navLog,
			semicircularNotices,
			notams,
			totalDistanceNm,
			totalFlightTimeMinutes,
			warnings
		};
	}
}

export const pyodideService = new PyodideService();
