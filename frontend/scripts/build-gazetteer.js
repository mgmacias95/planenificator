import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OURAIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const GEONAMES_ES_URL = 'https://download.geonames.org/export/dump/ES.zip';
const OUTPUT_FILE = path.resolve(__dirname, '../static/data/gazetteer-es.json');

function parseCSVLine(line) {
	const result = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			result.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	result.push(current);
	return result;
}

async function fetchOurAirports() {
	console.log(`[build-gazetteer] Fetching OurAirports from ${OURAIRPORTS_URL}...`);
	const response = await fetch(OURAIRPORTS_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch OurAirports: ${response.status} ${response.statusText}`);
	}
	const csvText = await response.text();
	const lines = csvText.split('\n');
	if (lines.length < 2) return [];

	const headers = parseCSVLine(lines[0]);
	const idxCountry = headers.indexOf('iso_country');
	const idxType = headers.indexOf('type');
	const idxName = headers.indexOf('name');
	const idxLat = headers.indexOf('latitude_deg');
	const idxLon = headers.indexOf('longitude_deg');
	const idxIdent = headers.indexOf('ident');
	const idxIcao = headers.indexOf('icao_code');
	const idxGps = headers.indexOf('gps_code');

	const airports = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const row = parseCSVLine(line);
		if (row[idxCountry] !== 'ES') continue;

		const rawType = row[idxType];
		if (rawType === 'closed') continue;

		const lat = parseFloat(row[idxLat]);
		const lon = parseFloat(row[idxLon]);
		if (isNaN(lat) || isNaN(lon)) continue;

		let type = 'aerodrome';
		if (rawType === 'heliport') {
			type = 'heliport';
		} else if (rawType === 'seaplane_base') {
			type = 'seaplane';
		}

		const ident = row[idxIcao] || row[idxGps] || row[idxIdent] || undefined;
		const name = row[idxName]?.trim() || '';

		airports.push({
			name,
			lat: Number(lat.toFixed(4)),
			lon: Number(lon.toFixed(4)),
			type,
			...(ident ? { ident: ident.trim() } : {})
		});
	}

	console.log(`[build-gazetteer] Loaded ${airports.length} landing sites for Spain.`);
	return airports;
}

async function fetchGeoNames() {
	console.log(`[build-gazetteer] Fetching GeoNames from ${GEONAMES_ES_URL}...`);
	const response = await fetch(GEONAMES_ES_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch GeoNames: ${response.status} ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	const unzipped = unzipSync(new Uint8Array(arrayBuffer));
	if (!unzipped['ES.txt']) {
		throw new Error('GeoNames zip does not contain ES.txt');
	}

	const text = new TextDecoder('utf-8').decode(unzipped['ES.txt']);
	const lines = text.split('\n');
	const places = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const parts = line.split('\t');
		if (parts.length < 15) continue;

		const featureClass = parts[6];
		const featureCode = parts[7];

		// Filter for populated places (Feature Class P), ignore sections (PPLX) and abandoned places (PPLQ/PPLF)
		if (
			featureClass === 'P' &&
			featureCode !== 'PPLX' &&
			featureCode !== 'PPLQ' &&
			featureCode !== 'PPLF'
		) {
			const name = parts[1]?.trim();
			const lat = parseFloat(parts[4]);
			const lon = parseFloat(parts[5]);
			const pop = parseInt(parts[14], 10) || 0;

			if (!name || isNaN(lat) || isNaN(lon)) continue;

			let type = 'village';
			if (featureCode === 'PPLC' || featureCode === 'PPLA' || pop >= 50000) {
				type = 'city';
			} else if (featureCode === 'PPLA2' || featureCode === 'PPLA3' || pop >= 1000) {
				type = 'town';
			}

			places.push({
				name,
				lat: Number(lat.toFixed(4)),
				lon: Number(lon.toFixed(4)),
				type,
				...(pop > 0 ? { pop } : {})
			});
		}
	}

	console.log(`[build-gazetteer] Loaded ${places.length} populated places for Spain.`);
	return places;
}

async function main() {
	try {
		const [airports, places] = await Promise.all([fetchOurAirports(), fetchGeoNames()]);

		const dataset = {
			version: '1.0',
			region: 'ES',
			generatedAt: new Date().toISOString(),
			airports,
			places
		};

		const outputDir = path.dirname(OUTPUT_FILE);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dataset, null, 2), 'utf-8');
		const sizeKb = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
		console.log(
			`[build-gazetteer] Successfully compiled gazetteer to ${OUTPUT_FILE} (${sizeKb} KB)`
		);
	} catch (err) {
		console.error('[build-gazetteer] Error building gazetteer:', err);
		process.exit(1);
	}
}

main();
