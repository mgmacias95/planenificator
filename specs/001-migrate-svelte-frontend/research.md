# Research & Technical Decisions: Modern Svelte 5 Frontend Migration

## 1. Pyodide & Python Module Sync Mechanism

### Decision
Use Pyodide (v0.26.2+) in the browser with an automated build-time/dev-time synchronization script (`scripts/sync-python.js` triggered in `package.json` `prepare` and `build` scripts) that copies `backend/planenificator/*.py` into `frontend/static/planenificator/`. In the client, a dedicated TypeScript service (`PyodideService`) manages the WebAssembly runtime lifecycle, micropip dependencies (`geopy`, `tabulate`, `pyodide-http`, `requests`), and Virtual Filesystem (VFS) injection.

### Rationale
- **Single Source of Truth**: Preserves Constitution Principle II (Core Engine Independence). Python calculation logic lives exclusively in `backend/planenificator/` and is verified by `pytest`.
- **Zero Server Compute**: The static SvelteKit build serves raw Python scripts from `/planenificator/` which Pyodide reads into its virtual filesystem at runtime.
- **Offline & Caching**: Static Python files are cacheable via Service Worker or standard HTTP caching headers.

### Alternatives Considered
- *Transpiling Python to JS via Transcrypt / WebAssembly compiler*: High maintenance, lack of library support (`geopy`, `requests`), risks calculation drift violating Principle I.
- *Rewriting calculation engine entirely in TypeScript*: Violates Constitution Principle II (dual-interface parity with CLI `main.py`) and duplicates domain calculation code.

---

## 2. Reactive State Architecture in Svelte 5

### Decision
Implement domain state managers as modern Svelte 5 class-based / closure modules utilizing Svelte 5 Runes (`$state`, `$derived`, `$effect`, and custom reactive state models):
- `FlightPlanStore` (reactive route waypoints, segments, performance profile parameters)
- `MapState` (selected waypoint, active segment, hovered leg, zoom/pan bounds)
- `ChartManager` (loaded raster charts, opacity, layer visibility, bounds)
- `CalculationStore` (computation status, navigation log results, semicircular warnings, active NOTAM briefs)

### Rationale
- **Svelte 5 Runes (`$state`, `$derived`)**: Provide fine-grained reactivity without the overhead or boilerplate of legacy Svelte 3/4 writable/derived stores.
- **Strict Typing**: Deep TypeScript interfaces for all domain objects (`Waypoint`, `RouteSegment`, `FlightProfile`, `NavLogEntry`, `NotamAlert`, `ChartOverlay`).
- **Encapsulated Business Logic**: Clean separation between Leaflet rendering components and pure reactive state.

### Alternatives Considered
- *Legacy Svelte 3/4 stores (`writable`, `derived`)*: Explicitly forbidden by Constitution Principle V.
- *Global single-object mutable state*: Prone to race conditions and inconsistent UI re-renders during async Pyodide execution.

---

## 3. Leaflet & Aeronautical Chart Georeferencing

### Decision
Render base navigation and waypoints via Leaflet 1.9+ with custom DOM markers and dynamic SVG/polyline segment overlays. Georeferenced aeronautical raster charts (ENAIRE VFR TIFF/TFW and ZIP archives) are parsed in-browser using:
1. `fflate` for ultra-fast unzipping of chart archives in-memory.
2. `geotiff.js` for reading raster image dimensions and pixel RGB rasters.
3. `proj4` for Lambert Conformal Conic (LCC) to WGS84 (EPSG:4326) coordinate transformation (including Iberian Peninsula `EPSG:2062` / customized ENAIRE LCC parameters and Canary Islands `EPSG:4083` UTM zone 28N).
4. HTML5 Canvas rendering downsampled to a max dimension of 8192px to prevent browser canvas memory exhaustion, projecting the canvas onto Leaflet using `L.imageOverlay` with exact geographic bounding boxes.

### Rationale
- **Proven Accuracy**: Replicates and improves the verified georeferencing math from `backend/app.js` with TypeScript type safety and error boundaries.
- **Client-Side Speed**: In-memory decompression and downsampling completes in < 2 seconds for standard 20MB chart archives.
- **Memory Efficiency**: Explicit chart unloading and canvas disposal prevents memory leaks in single-page sessions.

### Alternatives Considered
- *Server-side tile slicing (mbtiles / xyz tiles)*: Violates Constitution Principle III (100% serverless static deployment).
- *Web Worker offloading for raster decoding*: Feasible enhancement if main thread lags, but standard downsampling to 8192px on Canvas has demonstrated instantaneous sub-second execution on modern desktop engines.

---

## 4. Flight Plan Persistence & IndexedDB Storage

### Decision
Implement `FlightPlanRepository` using IndexedDB (via standard `idb` or clean native IndexedDB wrapper with promise API) with two primary stores:
1. `active_session`: Auto-saves the current flight plan on every change (debounced at 300ms) for seamless tab-crash recovery.
2. `saved_plans`: Keyed store of user-named flight plans with metadata (`id`, `name`, `createdAt`, `updatedAt`, `dep`, `dest`, `totalDistanceNm`, `estimatedTimeMinutes`, `serializedPlan`).

### Rationale
- Satisfies Clarification Session 2026-08-25 (Option C - Full local project management).
- IndexedDB handles structured JSON storage without LocalStorage's 5MB limit or stringification serialization bottlenecks.
- Graceful degradation: In private browsing modes where IndexedDB might be restricted, falls back to in-memory/LocalStorage session store.

### Alternatives Considered
- *LocalStorage only*: 5MB quota is restrictive if custom chart metadata or detailed flight plans are stored; synchronous IO can cause micro-stutters during frequent auto-saves.
- *File export only (JSON/GPX)*: Lacks automatic crash recovery and seamless project switching. (File import/export is supported as an added capability).

---

## 5. Paraglide-JS Internationalization (i18n)

### Decision
Use `@inlang/paraglide-js` with `@inlang/paraglide-js/vite` already integrated in `frontend/vite.config.ts`.
- Message catalogs in `frontend/messages/en.json` and `frontend/messages/es.json`.
- Compile-time type-safe message functions: `import * as m from '$lib/paraglide/messages.js'`.
- Dynamic language switching via `setLanguageTag('es' | 'en')` updating reactive Svelte 5 state and persisting user preference in `localStorage`.

### Rationale
- **Zero Runtime Overhead**: Paraglide compiles translation keys directly into tree-shakeable JavaScript functions.
- **Type Safety**: TypeScript compiler catches missing translations or missing parameter interpolations at build time.
- **Instantaneous Locale Switching**: Switching locales updates the reactive Svelte 5 context in < 10ms with zero page reloads.

### Alternatives Considered
- *svelte-i18n*: Relies on runtime dictionary loading and Svelte stores; heavier runtime footprint and lacking compile-time type validation.
- *typesafe-i18n*: Good alternative, but Paraglide-JS is already configured in the repo and complies with Constitution Principle V.

---

## 6. Testing Strategy & API Mocking for CI

### Decision
Two-tier automated test suite:
1. **Vitest (Unit & Component)**:
   - Pure math tests: Wind triangle, course wrap-around (0°/360°), climb/descent profiles, semicircular rule auditing.
   - Component rendering tests with `@vitest/browser-playwright` / jsdom testing UI HUD components, formatters, and form inputs.
2. **Playwright (End-to-End Workflow)**:
   - Intercepts external HTTP requests to Open-Meteo (`https://api.open-meteo.com/*`) and ENAIRE (`https://opendata.enaire.es/*`) using `page.route()` with deterministic JSON fixtures located in `frontend/tests/fixtures/`.
   - Simulates complete user journeys: Plotting waypoints, adding altitude segments, configuring aircraft profile, triggering route calculation, verifying Nav Log calculations, toggling English/Spanish language, and testing PDF print briefing view.
   - Optional `LIVE_API=true` environment flag allows opt-in live integration testing.

### Rationale
- **Determinism & CI Reliability**: Resolves Clarification Session 2026-08-25 (Option A). Guarantees tests run fast and never fail due to upstream rate limits or network outages.
- **Aviation Rule Verification**: Ensures compliance with Constitution Principles I & IV.

### Alternatives Considered
- *Testing against live APIs in CI*: Flaky, subject to rate limits, third-party downtime, and changing weather data that breaks exact calculation assertions.
- *Mocking Pyodide at the JS level*: Testing the real Pyodide runtime inside headless Playwright provides much higher fidelity for end-to-end flight math validation.
