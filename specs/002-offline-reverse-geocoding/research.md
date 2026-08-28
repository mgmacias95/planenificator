# Research: Offline Client-Side Reverse Geocoding

## Topic 1: Data Sourcing & Licensing

### Decision
Combine **OurAirports** (aeronautical landing sites) and **GeoNames** (populated settlements) for Spain.

### Rationale
- **OurAirports** is dedicated to the **Public Domain (CC0)**. It contains comprehensive coverage of Spanish aerodromes, civil airports (with ICAO/IATA identifiers), military bases, ultralight strips (ULM), and hospital/civil heliports.
- **GeoNames** is licensed under **Creative Commons Attribution 4.0 (CC BY 4.0)**, which allows redistribution and bundling with AGPLv3 software provided attribution is included. It provides complete coverage of Spanish cities, towns, villages, and municipalities.
- This combination is cleaner and more permissive than OpenStreetMap (ODbL Share-Alike) or OpenAIP (custom non-commercial restrictions).

### Alternatives Considered
- **OpenStreetMap / Nominatim API (Previous state)**: Required external network requests, subject to strict 1 req/sec rate limits, CORS issues, and failed completely offline.
- **OpenAIP API**: Requires API keys, imposes rate limits, and has restrictive licensing for offline redistribution.
- **Natural Earth**: Lower resolution; lacks small Spanish villages and ultralight airfields.

---

## Topic 2: Client-Side Spatial Indexing Strategy

### Decision
Implement an in-memory 2D Spatial Grid Index (Spatial Bucket Hash) with Haversine distance calculations in pure TypeScript.

### Rationale
- For Spain (~1,200 aerodromes/heliports and ~12,000 populated places), a 0.25° x 0.25° spatial grid index has negligible construction overhead (< 5ms) and resolves nearest-neighbor queries in < 0.2ms with zero external runtime dependencies.
- Avoids heavy GIS or WASM dependencies while providing deterministic, microsecond-level query performance.

### Alternatives Considered
- **SQLite / SpatiaLite WASM**: Too heavy (~2-5 MB engine bundle) for a simple nearest-neighbor lookup.
- **KDBush / Flatbush**: Excellent binary KD-tree libraries, but a lightweight pure TypeScript spatial grid achieves identical performance for ~15k points without introducing third-party package dependencies.
- **Linear Scan (Brute force)**: Fast enough for 1,000 points (~1ms), but degrades with 15,000 points; spatial partitioning ensures consistent < 1ms performance.

---

## Topic 3: Aviation Snapping & Prioritization Rules

### Decision
Two-tier hierarchical search:
1. **Tier 1 (Aerodrome Proximity)**: Search aerodromes/airstrips within a **5 Nautical Mile (9.26 km)** radius. If found, format as `[ICAO] - [Name]` (or `[Name]` if no ICAO code).
2. **Tier 2 (Populated Place Proximity)**: If no aerodrome is within 5 NM, find the closest settlement (city/town/village) within a **20 km** radius.
3. **Tier 3 (Fallback)**: If no landmark is within 20 km (e.g. maritime waypoints in the Mediterranean/Atlantic), format as `WP (lat, lon)`.

### Rationale
- Pilots creating flight plans expect waypoints near an airfield to adopt the airfield name, while en-route navigation marks over land should name the nearest recognizable visual town.

---

## Topic 4: Data Packaging & Delivery

### Decision
Generate a pre-processed, compact JSON file at `frontend/static/data/gazetteer-es.json` loaded lazily by the browser on first waypoint creation or drag.

### Rationale
- Uncompressed size is ~350 KB; compressed over HTTP/Brotli it is ~65 KB.
- Placing it in `static/data/` allows Vite/SvelteKit to serve it as a static asset, cached aggressively in the browser ServiceWorker / CacheStorage for full offline readiness.
- A Node.js generation script (`frontend/scripts/build-gazetteer.js`) fetches upstream raw data and rebuilds the JSON artifact reproducibly.
