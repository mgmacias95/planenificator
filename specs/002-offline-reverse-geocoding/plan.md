# Implementation Plan: Offline Client-Side Reverse Geocoding

**Branch**: `002-offline-reverse-geocoding` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-offline-reverse-geocoding/spec.md`

## Summary

Replace external HTTP calls to OpenStreetMap/Nominatim API with a fast, deterministic client-side reverse geocoding engine running in the browser. The engine consumes a pre-compiled offline gazetteer dataset for Spain combining **OurAirports** (public domain aerodromes and airstrips) and **GeoNames** (CC BY 4.0 populated settlements), indexed via an in-memory 2D spatial grid index for sub-millisecond query performance and 100% offline flight planning capability.

## Technical Context

**Language/Version**: TypeScript 5.x / JavaScript ES2022 / Svelte 5  
**Primary Dependencies**: SvelteKit 2, Leaflet 1.9, `fflate` (build-time dataset extraction)  
**Storage**: Static JSON asset (`static/data/gazetteer-es.json`) loaded into memory cache  
**Testing**: Vitest (`npm run test:unit`) and Playwright (`npm run test:e2e`)  
**Target Platform**: Modern Web Browsers (WASM/SPA, offline PWA / static hostable)  
**Project Type**: Web Application / Client-Side Library  
**Performance Goals**: < 1ms reverse geocode resolution per waypoint; < 10ms initial spatial index build  
**Constraints**: 100% offline capable; zero external network requests; license attribution in UI and documentation  
**Scale/Scope**: Spain (~1,200 landing sites, ~12,000 settlements; ~350 KB uncompressed JSON)  

## Constitution Check

*GATE: All core principles verified.*

| Principle | Status | Evaluation |
| :--- | :--- | :--- |
| **I. Aviation Calculation Integrity & Determinism** | **PASS** | Spatial distance uses deterministic Haversine calculations; aerodromes strictly prioritized within 5 NM standard aviation radius. |
| **II. Core Engine Independence & Dual-Interface Parity** | **PASS** | Client-side geocoding service is isolated in `src/lib/services/geocoding.ts` with clean interface contracts. |
| **III. Serverless, Client-Side & Privacy-First Architecture** | **PASS** | Zero external telemetry or geocoding API requests. All calculations occur locally in user's browser memory. |
| **IV. Test-Driven Verification for Aviation Domain Rules** | **PASS** | Comprehensive Vitest suites for aerodrome snapping, town fallbacks, and coordinate bounds. |
| **V. Modern Svelte 5 & TypeScript Standards** | **PASS** | Strict TypeScript interfaces, Svelte 5 runes in reactive components. |

## Project Structure

### Documentation (this feature)

```text
specs/002-offline-reverse-geocoding/
├── spec.md              # Feature specification
├── plan.md              # This implementation plan
├── research.md          # Phase 0 research & technology choices
├── data-model.md        # Phase 1 data entities and schemas
├── quickstart.md        # Phase 1 quickstart & verification guide
├── contracts/
│   └── geocoding-service.ts # Interface contracts
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code

```text
frontend/
├── scripts/
│   └── build-gazetteer.js          # Node.js script to download & compile OurAirports + GeoNames data
├── static/
│   └── data/
│       └── gazetteer-es.json       # Pre-compiled static gazetteer dataset for Spain
├── src/
│   └── lib/
│       ├── services/
│       │   └── geocoding.ts        # Client-side spatial index & reverse geocoder service
│       └── components/
│           ├── Map.svelte          # Integration with Leaflet map markers and drag interactions
│           └── Attribution.svelte  # License attribution modal/footer (CC BY 4.0 & Public Domain)
└── tests/
    └── unit/
        └── geocoding.test.ts       # Unit tests for spatial lookup, prioritization, and fallbacks
```

## Planned Implementation Steps

1. **Step 1: Dataset Generation Script (`build-gazetteer.js`)**
   - Download OurAirports CSV (`airports.csv`) and GeoNames Spain dump (`ES.zip`).
   - Filter, sanitize, and extract coordinates, ICAO identifiers, aerodrome names, and populated places.
   - Write optimized `frontend/static/data/gazetteer-es.json`.

2. **Step 2: Core Geocoding Engine (`src/lib/services/geocoding.ts`)**
   - Implement spatial grid bucketing index and Haversine distance calculator.
   - Implement hierarchical lookup: aerodromes within 5 NM -> settlements within 20 km -> coordinate fallback.

3. **Step 3: Map Integration (`Map.svelte`)**
   - Replace Nominatim HTTP fetch in `resolveWaypointName` with the in-memory geocoding service.

4. **Step 4: License Attribution & Documentation**
   - Add CC BY 4.0 and Public Domain attribution to map notices and `README.md`.

5. **Step 5: Automated Verification**
   - Write Vitest unit tests in `tests/unit/geocoding.test.ts` and verify with `npm run test:unit`.
