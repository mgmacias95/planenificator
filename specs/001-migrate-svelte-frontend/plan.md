# Implementation Plan: Modern Svelte 5 Frontend Migration & Test Suite

**Branch**: `001-migrate-svelte-frontend` | **Date**: 2026-08-25 | **Spec**: [specs/001-migrate-svelte-frontend/spec.md](spec.md)

**Input**: Feature specification from `/specs/001-migrate-svelte-frontend/spec.md`

## Summary

Migrate the legacy `backend/index.html` and `backend/app.js` single-page flight planning UI to a modern, production-grade SvelteKit 2 and Svelte 5 (Runes) frontend application located in `frontend/`. The new frontend integrates client-side Pyodide WebAssembly for serverless execution of the underlying Python flight planning engine, provides high-precision Leaflet map planning with multi-segment altitude support and ENAIRE VFR chart georeferencing, implements robust local persistence via IndexedDB, offers instantaneous English/Spanish internationalization using Paraglide-JS, and establishes a comprehensive test suite with Vitest and Playwright using deterministic API mock fixtures.

## Technical Context

**Language/Version**: TypeScript 5.8+ / ES2023, Python 3.10+ (Pyodide v0.26.2+ in WASM)

**Primary Dependencies**:
- SvelteKit 2 + Svelte 5 (Runes mode: `$state`, `$derived`, `$props`, `$effect`)
- Tailwind CSS v4 (`@tailwindcss/vite`, `@tailwindcss/forms`, `@tailwindcss/typography`)
- `@inlang/paraglide-js` for compile-time type-safe internationalization (`en`, `es`)
- Leaflet 1.9+ (`leaflet`, `@types/leaflet`) for interactive mapping
- `geotiff` (2.1+) & `proj4` (2.11+) for raster aeronautical chart georeferencing
- `fflate` (0.8+) for fast in-memory ZIP extraction
- `idb` / native IndexedDB for flight plan persistence and auto-recovery

**Storage**:
- IndexedDB (`planenificator_db`) with `active_session` (debounced auto-save) and `saved_plans` (named projects)
- `localStorage` for UI preferences (active locale: `en` / `es`)

**Testing**:
- Vitest (`vitest`, `vitest-browser-svelte`, `@vitest/browser-playwright`) for unit and component testing
- Playwright (`@playwright/test`) for browser end-to-end user workflows with network route interception fixtures
- `pytest` for backend Python calculation engine validation

**Target Platform**:
- Modern Web Browsers (Chrome, Firefox, Safari, Edge) supporting WebAssembly, Canvas 2D, and ES modules
- Serverless Static Deployment via `@sveltejs/adapter-static` (GitHub Pages compatible)

**Project Type**: Serverless Static Web Application with Embedded Python WASM Engine

**Performance Goals**:
- Route calculation (winds aloft, wind triangle, TOC/TOD, NOTAM filtering) < 5s
- Aeronautical chart georeferencing and map overlay rendering < 3s (< 25MB packages)
- Local flight plan saving and auto-recovery < 50ms
- Language switching < 100ms with zero layout shift

**Constraints**:
- 100% serverless client-side execution; zero external compute backend or proprietary telemetry
- Fails open on safety alerts (semicircular rule deviations, corridor NOTAMs) with prominent visual warnings
- Deterministic API mocking in CI for Open-Meteo winds and ENAIRE NOTAMs

**Scale/Scope**:
- Single-page responsive cockpit HUD UI with multi-segment flight planning, dynamic waypoint reordering, georeferenced raster chart layers, NOTAM briefing tabs, and print-optimized PDF flight logs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Principle I: Aviation Calculation Integrity & Determinism**: All navigation formulas (Wind Triangle, WCA, True Heading, Ground Speed, TOC/TOD, Great Circle, Magnetic Track) are deterministic and tested against verified test datasets. Safety checks (semicircular rules, NOTAM 2km corridor) fail open with explicit pilot warnings.
- [x] **Principle II: Core Engine Independence & Dual-Interface Parity**: Python calculation modules reside in `backend/planenificator/` and are synchronized to `frontend/static/planenificator/` during build. CLI `main.py` and Web Frontend share identical domain math.
- [x] **Principle III: Serverless, Client-Side & Privacy-First Architecture**: 100% serverless static deployment via `@sveltejs/adapter-static`. Pyodide WebAssembly executes calculations locally. Flight plans and waypoints are persisted locally in IndexedDB without external telemetry.
- [x] **Principle IV: Test-Driven Verification for Aviation Domain Rules**: Verified via Vitest unit tests for calculations/components and Playwright E2E with deterministic Open-Meteo & ENAIRE fixtures in CI.
- [x] **Principle V: Modern Svelte 5 & TypeScript Standards**: Built with Svelte 5 runes (`$state`, `$derived`, `$props`), strict TypeScript types, and Paraglide i18n (`en`, `es`). No legacy Svelte 3/4 stores.

## Project Structure

### Documentation (this feature)

```text
specs/001-migrate-svelte-frontend/
├── plan.md              # This implementation plan
├── research.md          # Phase 0: Technical decisions & research consolidation
├── data-model.md        # Phase 1: Domain entities, state models & lifecycle
├── quickstart.md        # Phase 1: Validation and test execution guide
└── contracts/           # Phase 1: Engine, georef, storage, and API contracts
    ├── pyodide-engine.ts
    ├── chart-georef.ts
    ├── storage-schema.ts
    └── weather-notam-api.ts
```

### Source Code Layout

```text
backend/
├── main.py                     # CLI entrypoint
├── planenificator/             # Core Python aviation & calculation engine
│   ├── helpers.py              # Geodesic, magnetic & wind math
│   ├── kml_parser.py           # KML route parser
│   ├── meteo.py                # Open-Meteo weather integration
│   ├── notams_spain.py         # ENAIRE NOTAM corridor filtering
│   ├── osm.py                  # Aerodrome & elevation lookup
│   ├── planenificator.py       # Core flight plan calculation orchestrator
│   └── segments.py             # Multi-segment TOC/TOD altitude profile engine
└── test/                       # pytest suite for Python modules

frontend/
├── scripts/
│   └── sync-python.js          # Syncs backend/planenificator -> static/planenificator
├── messages/
│   ├── en.json                 # Paraglide English localization catalog
│   └── es.json                 # Paraglide Spanish localization catalog
├── static/
│   └── planenificator/         # Synchronized Python modules served to Pyodide
├── src/
│   ├── app.d.ts
│   ├── app.html
│   ├── lib/
│   │   ├── components/         # Svelte 5 UI Components
│   │   │   ├── Map.svelte              # Leaflet map container & overlays
│   │   │   ├── Sidebar.svelte          # Main HUD sidebar
│   │   │   ├── WaypointList.svelte     # Reactive waypoint & segment manager
│   │   │   ├── FlightProfileForm.svelte# Aircraft performance input form
│   │   │   ├── ChartManager.svelte     # Dropzone & ENAIRE catalog selector
│   │   │   ├── NavLogTable.svelte      # Calculated flight log table
│   │   │   ├── SafetyAlerts.svelte     # Semicircular rule & NOTAM summaries
│   │   │   ├── SavedPlansDrawer.svelte # IndexedDB project manager drawer
│   │   │   ├── PrintBriefing.svelte    # Dedicated print/PDF briefing layout
│   │   │   ├── LanguageToggle.svelte   # EN/ES instant language switch
│   │   │   └── SegmentModal.svelte     # Modal dialog for altitude assignment
│   │   ├── services/           # Application Services & Business Logic
│   │   │   ├── pyodide.svelte.ts       # Pyodide WASM runtime manager
│   │   │   ├── georef.ts               # TIFF/TFW/Proj4 georeferencer
│   │   │   ├── storage.ts              # IndexedDB repository
│   │   │   └── weather-fixtures.ts     # Mock data helpers for tests
│   │   ├── state/              # Reactive Svelte 5 Domain State
│   │   │   ├── flight-plan.svelte.ts   # Waypoints, segments & profile state
│   │   │   ├── calculation.svelte.ts   # NavLog & safety alert state
│   │   │   └── charts.svelte.ts        # Active raster chart layers state
│   │   └── types/              # Domain TypeScript definitions
│   └── routes/
│       ├── +layout.svelte      # Root layout & Paraglide provider
│       └── +page.svelte        # Cockpit HUD cockpit page
└── tests/
    ├── unit/                   # Vitest unit tests (math, components, storage)
    │   ├── calculation.test.ts
    │   ├── georef.test.ts
    │   └── storage.test.ts
    ├── e2e/                    # Playwright E2E test specs
    │   ├── route-planning.spec.ts
    │   ├── chart-overlay.spec.ts
    │   ├── flight-calculation.spec.ts
    │   ├── persistence.spec.ts
    │   └── localization.spec.ts
    └── fixtures/               # Deterministic API intercept JSON fixtures
        ├── open-meteo-winds.json
        └── enaire-notams.json
```

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations detected. The architecture strictly adheres to all five constitutional principles.*
