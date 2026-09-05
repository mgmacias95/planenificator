import type { PyodideInterface } from 'pyodide';
import { SvelteDate, SvelteSet } from 'svelte/reactivity';
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
	totalEte: string;
	finalEta: string;
	warnings: string[];
	rawTextOutput?: string;
}

export interface IPyodideService {
	init(): Promise<void>;
	isReady(): boolean;
	getStatus(): PyodideEngineStatus;
	calculateRoute(input: PyodideCalculationInput): Promise<PyodideCalculationResult>;
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export function parseAltitudeLimit(val: any): { fl: string; ft: number | null } {
	if (val === undefined || val === null || val === '') return { fl: 'SFC', ft: 0 };
	if (typeof val === 'string') {
		val = val.trim().toUpperCase();
		if (val === 'SFC' || val === 'GND') return { fl: 'SFC', ft: 0 };
		if (val === 'UNL' || val === 'UNLIMITED') return { fl: 'UNL', ft: null };
		if (val.startsWith('FL')) {
			const num = parseInt(val.replace('FL', ''), 10);
			if (!isNaN(num)) {
				return { fl: `FL${String(num).padStart(3, '0')}`, ft: num * 100 };
			}
		}
		const parsed = parseFloat(val);
		if (isNaN(parsed)) return { fl: val, ft: null };
		val = parsed;
	}

	if (val === 0) return { fl: 'SFC', ft: 0 };
	if (val === 999 || val >= 99900) return { fl: 'UNL', ft: null };

	if (val < 1000) {
		const flNum = Math.round(val);
		return {
			fl: `FL${String(flNum).padStart(3, '0')}`,
			ft: flNum * 100
		};
	}

	const ftNum = Math.round(val);
	const flNum = Math.round(val / 100);
	return {
		fl: `FL${String(flNum).padStart(3, '0')}`,
		ft: ftNum
	};
}

export function formatNotamAltitudeRange(lower: any, upper: any): string {
	const low = parseAltitudeLimit(lower);
	const up = parseAltitudeLimit(upper);

	if (low.fl === 'SFC' && up.fl === 'UNL') {
		return 'SFC – UNL';
	}

	const lowFtStr = low.ft !== null ? `${low.ft.toLocaleString('en-US')} ft` : '';
	const upFtStr = up.ft !== null ? `${up.ft.toLocaleString('en-US')} ft` : 'UNL';

	if (low.fl === 'SFC') {
		return `${low.fl} – ${up.fl} (0 – ${upFtStr})`;
	}
	if (up.fl === 'UNL') {
		return `${low.fl} – UNL (${lowFtStr} – UNL)`;
	}

	return `${low.fl} – ${up.fl} (${low.ft?.toLocaleString('en-US')} – ${up.ft?.toLocaleString('en-US')} ft)`;
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
					progressMessage: 'Initializing flight engine...'
				};

				if (typeof window === 'undefined' || typeof window.loadPyodide !== 'function') {
					throw new Error('Flight engine failed to load in browser');
				}

				// Load Pyodide WASM runtime from official CDN distribution
				this.pyodide = await window.loadPyodide({
					indexURL: PYODIDE_INDEX_URL
				});

				this.status = {
					state: 'installing_packages',
					progressMessage: 'Loading aviation calculation modules...'
				};

				await this.pyodide.loadPackage(['ssl', 'micropip', 'requests', 'pyodide-http']);
				const micropip = this.pyodide.pyimport('micropip');
				await micropip.install(['geopy', 'tabulate']);

				this.status = {
					state: 'loading_modules',
					progressMessage: 'Loading flight planning tools...'
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
						throw new Error(`Failed to load navigation module ${file} (HTTP ${response.status})`);
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
					progressMessage: 'Flight Engine Ready'
				};
			} catch (err: any) {
				console.error('Pyodide initialization failed:', err);
				this.status = {
					state: 'error',
					progressMessage: 'Failed to initialize flight engine',
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
				throw new Error('Flight planning engine is not ready');
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
				const placemarksXml = segWps
					.map(
						(wp: Waypoint) => `    <Placemark>
      <name>${escapeXml(wp.name || `Waypoint_${wp.lat.toFixed(3)}_${wp.lng.toFixed(3)}`)}</name>
      <Point>
        <coordinates>${wp.lng},${wp.lat},0</coordinates>
      </Point>
    </Placemark>`
					)
					.join('\n');

				const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Segment ${idx + 1}</name>
${placemarksXml}
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
		let totalEte = '';
		let finalEta = '';

		rows.forEach((row, idx) => {
			if (row[0] === 'Total') {
				totalDistanceNm = parseFloat(row[7]) || 0;
				totalEte = row[8] || '';
				finalEta = row[9] || '';
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
			const ias = parseInt(row[5], 10) || 0;
			const gs = parseInt(row[6], 10) || 0;
			const legDist = parseFloat(row[7]) || 0;
			const ete = row[8] || '';
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
				tasKt: ias,
				iasKt: ias,
				groundSpeedKt: gs,
				distanceNm: legDist,
				ete,
				eteMinutes: parseFloat(ete) || 0,
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
			const low = parseAltitudeLimit(c.LOWER_VAL);
			const up = parseAltitudeLimit(c.UPPER_VAL);
			const areaName = c.areaSactaName || c.itemA || 'En Route Corridor';

			notams.push({
				id: c.notamId || 'NOTAM',
				location: c.areaSactaName || c.itemA || 'EN ROUTE',
				validFrom: c.itemB ? new Date(c.itemB).toISOString() : '',
				validTo: c.itemC ? new Date(c.itemC).toISOString() : '',
				qCode: c.qcode || '',
				purpose: 'Route Conflict',
				lowerLimitFt: low.ft ?? undefined,
				upperLimitFt: up.ft ?? undefined,
				text: c.itemE || '',
				summary: `${areaName} Airspace Restriction`,
				severity: 'WARNING'
			});
		});

		// Aerodrome conflict NOTAMs
		(notamData.aerodrome_conflicts || []).forEach((item: any) => {
			const c = Array.isArray(item) ? item[0] : item;
			const warnType = Array.isArray(item) && item[1] ? item[1] : 'ALERT';
			const role = Array.isArray(item) && item[2] ? item[2] : 'AERODROME';
			const low = parseAltitudeLimit(c.LOWER_VAL);
			const up = parseAltitudeLimit(c.UPPER_VAL);

			const roleDesc =
				role === 'DEPARTURE'
					? 'Departure'
					: role === 'ARRIVAL'
						? 'Destination'
						: role === 'ALTERNATE'
							? 'Alternate'
							: role;
			const statusDesc =
				warnType === 'CLOSED'
					? 'Aerodrome Closed'
					: warnType === 'LIMITED'
						? 'Operational Limitations'
						: warnType;

			notams.push({
				id: c.notamId || 'AD NOTAM',
				location: c.itemA || role,
				validFrom: c.itemB ? new Date(c.itemB).toISOString() : '',
				validTo: c.itemC ? new Date(c.itemC).toISOString() : '',
				qCode: c.qcode || '',
				purpose: `${role} ${warnType}`,
				lowerLimitFt: low.ft !== null && low.ft > 0 ? low.ft : undefined,
				upperLimitFt: up.ft !== null && up.ft < 99900 ? up.ft : undefined,
				text: c.itemE || '',
				summary: `${c.itemA || 'AD'} (${roleDesc}): ${statusDesc}`,
				severity: warnType === 'CLOSED' ? 'WARNING' : 'CAUTION'
			});
		});

		const parseIsoDate = (val: any): string => {
			if (!val) return '';
			try {
				const d = typeof val === 'number' ? new SvelteDate(val) : new SvelteDate(String(val));
				return isNaN(d.getTime()) ? '' : d.toISOString();
			} catch {
				return '';
			}
		};

		const seenNotamIds = new SvelteSet<string>();
		notams.forEach((n) => {
			if (n.id) seenNotamIds.add(n.id);
		});

		// Informational route NOTAMs (no direct time/altitude conflict)
		(notamData.all_route_notams || []).forEach((c: any) => {
			const notamId = c.notamId || `NOTAM-R-${Math.random().toString(36).substring(2, 8)}`;
			if (seenNotamIds.has(notamId)) return;
			seenNotamIds.add(notamId);

			const low = parseAltitudeLimit(c.LOWER_VAL);
			const up = parseAltitudeLimit(c.UPPER_VAL);
			const areaName = c.areaSactaName || c.itemA || 'En Route Corridor';

			notams.push({
				id: notamId,
				location: c.areaSactaName || c.itemA || 'EN ROUTE',
				validFrom: parseIsoDate(c.itemB),
				validTo: parseIsoDate(c.itemC),
				qCode: c.qcode || '',
				purpose: 'En Route Information',
				lowerLimitFt: low.ft ?? undefined,
				upperLimitFt: up.ft ?? undefined,
				text: c.itemE || '',
				summary: `${areaName} (En Route Advisory)`,
				severity: 'INFO'
			});
		});

		// Informational aerodrome NOTAMs (general airport advisories)
		(notamData.all_aerodrome_notams || []).forEach((c: any) => {
			const notamId = c.notamId || `NOTAM-AD-${Math.random().toString(36).substring(2, 8)}`;
			if (seenNotamIds.has(notamId)) return;
			seenNotamIds.add(notamId);

			const low = parseAltitudeLimit(c.LOWER_VAL);
			const up = parseAltitudeLimit(c.UPPER_VAL);
			const adCode = (c.itemA || 'AERODROME').toUpperCase();

			const dep = (input.profile.depIcao || '').toUpperCase();
			const dest = (input.profile.destIcao || '').toUpperCase();
			const alts = (input.profile.altIcaos || []).map((a) => a.toUpperCase());

			const roleDesc =
				adCode === dep
					? 'Departure'
					: adCode === dest
						? 'Destination'
						: alts.includes(adCode)
							? 'Alternate'
							: 'Aerodrome';

			notams.push({
				id: notamId,
				location: adCode,
				validFrom: parseIsoDate(c.itemB),
				validTo: parseIsoDate(c.itemC),
				qCode: c.qcode || '',
				purpose: `${roleDesc} Information`,
				lowerLimitFt: low.ft !== null && low.ft > 0 ? low.ft : undefined,
				upperLimitFt: up.ft !== null && up.ft < 99900 ? up.ft : undefined,
				text: c.itemE || '',
				summary: `${adCode} (${roleDesc} Advisory)`,
				severity: 'INFO'
			});
		});

		const warnings = [...(notamData.semicircular_warnings || [])];

		if (!finalEta && navLog.length > 0) {
			finalEta = navLog[navLog.length - 1].etaUtc;
		}

		return {
			success: true,
			navLog,
			semicircularNotices,
			notams,
			totalDistanceNm,
			totalFlightTimeMinutes,
			totalEte,
			finalEta,
			warnings
		};
	}
}

export const pyodideService = new PyodideService();
