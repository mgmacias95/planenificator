# Feature Specification: Modern Svelte 5 Frontend Migration & Test Suite

**Feature Branch**: `001-migrate-svelte-frontend`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "I want to migrate backend/index.html and backend/app.js into the new Svelte frontend at frontend. I want the UI to use Tailscale CSS, clean and professional components, introduce unit tests and playwright for the core flows of the app and use paraglide for i18n"

## Clarifications

### Session 2026-08-25

- Q: Should pilot routes, custom waypoints, and flight profile settings be automatically persisted across browser refreshes? → A: Option C (Full local project management using IndexedDB supporting named saved flight plans and auto-recovery).
- Q: How should the Python engine files and Pyodide dependencies be bundled and served by the SvelteKit frontend? → A: Option A (Auto-sync Python modules from `backend/planenificator` into frontend static assets during build with client-side caching).
- Q: How should Playwright E2E tests handle external third-party API dependencies (Open-Meteo winds and ENAIRE NOTAMs/charts)? → A: Option A (Use Playwright network route interception with deterministic JSON fixtures for Open-Meteo & ENAIRE in CI, with live test opt-in mode).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive VFR Route Planning & Calculation (Priority: P1)

As a VFR pilot planning a flight, I want to create, inspect, and adjust a multi-waypoint flight path on an interactive map and obtain accurate navigation calculations (courses, headings, ground speeds, wind correction, climb/descent profiles, and leg timings) directly in my browser without server dependencies.

**Why this priority**: Core value proposition of Planenificator. The primary reason pilots use the application is to plot routes and compute operational flight data.

**Independent Test**: Can be fully tested by creating a 2-segment flight route on the map, setting aircraft performance parameters (cruise altitude, climb rate, TAS), running route calculation, and verifying the resulting navigation log entries match verified flight math.

**Acceptance Scenarios**:

1. **Given** an empty route on the interactive map, **When** the pilot double-clicks on multiple points or imports coordinates, **Then** waypoints are plotted, linked sequentially with visual route vectors, and populated in the waypoint list with auto-resolved aerodrome/geographic identifiers.
2. **Given** a multi-waypoint route, **When** the pilot creates distinct route segments with custom cruise altitudes, **Then** each segment renders with distinct visual coding, and TOC (Top of Climb) and TOD (Top of Descent) transitions are calculated accordingly.
3. **Given** defined route waypoints and flight profile parameters (departure time, cruise altitude, TAS, initial/arrival altitudes, climb/descent rates), **When** the pilot triggers flight calculation, **Then** atmospheric wind components are fetched for the route coordinates/time, and a complete Navigation Log table is generated displaying True Course, Wind Correction Angle, True Heading, Wind Speed/Direction, Ground Speed, Leg Distance, ETE, and ETA.
4. **Given** an existing route, **When** the pilot removes waypoints, reorders segments, or clears the route, **Then** the map vectors and waypoint lists immediately synchronize with the updated state.

---

### User Story 2 - VFR Chart Georeferencing & Visual Overlay Management (Priority: P1)

As a pilot flying VFR, I want to upload or select official raster aeronautical charts (e.g., ENAIRE VFR 1:500k charts in ZIP or TIFF/TFW formats) and see them georeferenced accurately on top of the interactive map, so that I can visually verify airspace, visual reporting points, and terrain obstacles along my route.

**Why this priority**: Critical for visual flight safety and airspace awareness. Pilots need to cross-reference routes directly over official aeronautical charts.

**Independent Test**: Can be fully tested by loading a sample ENAIRE VFR chart package (drag-and-drop ZIP or online catalog selection), confirming projected bounds overlay correctly on base map coordinates, and toggling visibility/opacity.

**Acceptance Scenarios**:

1. **Given** an official aeronautical chart package (ZIP or TIFF + TFW pair), **When** the pilot drops the files into the chart dropzone or selects them via file browser, **Then** the client unpacks and georeferences the chart in-browser, renders the raster layer accurately over geographical coordinates, and adds the chart to the active charts panel.
2. **Given** access to an online aeronautical chart catalog (e.g., ENAIRE open data), **When** the pilot selects a regional chart from the catalog dropdown and loads it, **Then** the chart is fetched, processed, and displayed on the map with controls to zoom to chart bounds.
3. **Given** one or more loaded aeronautical charts, **When** the pilot toggles chart visibility or removes a chart, **Then** the map display updates instantly, freeing associated raster memory.

---

### User Story 3 - Aviation Safety Checks, Semicircular Rule & NOTAM Corridor Briefings (Priority: P2)

As a pilot reviewing a pre-flight plan, I want automated safety audits for cruise flight levels according to magnetic track semicircular rules, and NOTAM alerts filtered within a safety corridor along my route and aerodromes, so that I am alerted to active airspace restrictions, hazards, and regulatory deviations.

**Why this priority**: Essential safety briefings required for operational flight planning. Prevents regulatory infractions and alerts pilots to temporary airspace closures.

**Independent Test**: Can be fully tested by planning a route crossing 000°-179° and 180°-359° magnetic tracks with non-standard VFR altitudes and inspecting the resulting semicircular warnings and NOTAM corridor alerts.

**Acceptance Scenarios**:

1. **Given** a planned flight segment with a calculated magnetic track and selected cruise altitude, **When** the altitude violates standard ICAO/European semicircular VFR rules (odd thousands + 500 ft for eastbound 000°-179°, even thousands + 500 ft for westbound 180°-359°), **Then** an explicit, non-blocking visual warning is displayed highlighting the deviation and suggesting the compliant VFR flight level.
2. **Given** a planned route with departure, destination, and alternates, **When** flight calculation runs, **Then** active NOTAM notices within the route corridor (2km lateral buffer) and terminal areas during the flight time window are extracted, classified by severity/status, and surfaced in the NOTAM alert summary.

---

### User Story 4 - Navigation Log Export & Printable Operational Flight Briefing (Priority: P2)

As a pilot preparing for flight deck operations, I want to export or print a standardized, clean, professional Navigation Log and Operational Flight Briefing containing all flight profile parameters, leg calculations, NOTAM summaries, and safety notes formatted specifically for cockpit use.

**Why this priority**: Pilots need physical or PDF copies of their operational flight plan in the cockpit in compliance with standard operating practices.

**Independent Test**: Can be fully tested by triggering the print/PDF briefing view for a calculated flight plan and verifying that all required flight metadata, full navigation log tables, safety warnings, and active NOTAM summaries render clearly with print-optimized stylesheets without screen HUD controls.

**Acceptance Scenarios**:

1. **Given** a completed route calculation, **When** the pilot clicks "Print PDF" or triggers print dialog, **Then** a dedicated print layout renders containing: Flight Profile Metadata (DEP, DEST, ALTN, TAS, departure time, climb/descent rates), complete Nav Log table, Semicircular rule notices, and active NOTAM briefs.
2. **Given** the print layout, **When** previewed or printed, **Then** sidebar interactive controls, file dropzones, and HUD overlays are hidden, and table pagination is formatted cleanly across standard page sizes (A4/Letter).

---

### User Story 5 - Multi-Language Accessibility (English & Spanish) (Priority: P3)

As a pilot or flight operations user, I want the complete user interface (navigation labels, tooltips, flight parameters, NOTAM statuses, and error messages) to be localized in English and Spanish, so that I can operate the software comfortably in my preferred aviation language.

**Why this priority**: Spanish VFR airspace is a primary operational region for Planenificator, while English is the international standard for aviation. Dual-language support ensures accessibility and compliance.

**Independent Test**: Can be fully tested by toggling between English and Spanish locales and verifying that all static text, form labels, tooltips, validation messages, and briefing headers update dynamically without reloading the route state.

**Acceptance Scenarios**:

1. **Given** the application loaded in the browser, **When** the user switches language from English to Spanish (or vice versa), **Then** all UI labels, form fields, table column headers, and status messages update immediately in place.
2. **Given** localized date/time, flight units, and aviation terms, **When** rendering calculations and logs, **Then** formatting matches standardized aviation conventions across selected languages.

---

### User Story 6 - Flight Plan Persistence & Project Auto-Recovery (Priority: P3)

As a pilot, I want my active flight planning progress auto-saved locally in the browser and the ability to save, name, and recall multiple flight plan projects via IndexedDB, so that I never lose work upon accidental tab closure or browser restart.

**Why this priority**: Enhances user reliability and productivity. Enables pilots to maintain a catalog of favorite routes and switch between them effortlessly.

**Independent Test**: Can be fully tested by creating a flight plan, saving it under a custom name, reloading the page, verifying auto-recovery, and loading another saved flight plan from the local project list.

**Acceptance Scenarios**:

1. **Given** an in-progress flight plan, **When** the page is reloaded or reopened, **Then** the active route, waypoints, segments, and flight parameters are automatically restored to their exact state before reload.
2. **Given** a finished flight plan, **When** the pilot saves it with a name, **Then** it is stored in IndexedDB and appears in the saved flight plans management drawer for instant reloading or deletion.

---

### User Story 7 - Automated Verification & Core Flow Testing (Priority: P3)

As a developer and maintainer, I want comprehensive unit tests and automated browser end-to-end (Playwright) tests covering core user flows (waypoint plotting, segment management, chart overlaying, flight calculation, persistence, and localization) with deterministic API fixtures, so that regressions are prevented and code reliability is guaranteed in CI.

**Why this priority**: Guarantees high stability, calculation integrity, and maintainability across browser environments as required by the Planenificator Constitution.

**Independent Test**: Can be fully tested by executing `pnpm test:unit` and `pnpm test:e2e` in CI/local environment and verifying that all component tests and browser flow tests pass cleanly.

**Acceptance Scenarios**:

1. **Given** component and calculation unit tests, **When** `pnpm test:unit` is executed, **Then** Vitest runs all unit tests for UI components, calculation formatters, and state handlers with zero failures.
2. **Given** end-to-end Playwright tests, **When** `pnpm test:e2e` is executed, **Then** automated browser sessions simulate user journeys using deterministic network intercept fixtures with assertions verifying UI feedback, storage recovery, and calculated table contents.

---

### Edge Cases

- **Zero or Extreme Winds**: Route calculation handles calm wind (0 kts) and crosswinds exceeding aircraft TAS gracefully with appropriate warning notices instead of arithmetic errors.
- **Heading Wrap-around**: True courses and headings correctly calculate across the 000°/360° north boundary without modulo/sign calculation bugs.
- **Pyodide Runtime Latency/Failure**: If WebAssembly initialization encounters network or resource constraints, the UI presents clear diagnostic loading indicators and retry capabilities.
- **Corrupt or Unmatched Chart Files**: Uploading corrupted ZIP files or TIFF files without matching georeferencing world files (TFW) provides clear, dismissible user feedback without crashing the application state.
- **Midnight UTC Date Rollover**: Flight departure times crossing midnight UTC correctly calculate subsequent waypoint ETAs across the day boundary.
- **Single Waypoint / Empty Route**: Flight calculation and print buttons remain disabled with intuitive helper messages until at least two valid waypoints are configured.
- **IndexedDB Storage Quota or Incognito Mode**: If IndexedDB is blocked or full, the system falls back gracefully to in-memory/LocalStorage session management without blocking navigation calculations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an interactive Leaflet map interface with panning, zooming, and double-click waypoint placement.
- **FR-002**: System MUST allow pilots to add, drag, reorder, and delete route waypoints, automatically calculating geodetic distances and bearing angles between consecutive points.
- **FR-003**: System MUST resolve waypoint names and elevation automatically where available via aerodrome and geographic lookup services.
- **FR-004**: System MUST support multi-segment route planning, allowing pilots to configure independent cruise altitudes per segment with custom climb and descent transition points (TOC/TOD).
- **FR-005**: System MUST allow users to upload local georeferenced raster charts (ZIP packages or TIFF + TFW files) and project them in real-time onto the base map.
- **FR-006**: System MUST integrate the official ENAIRE VFR chart catalog, allowing pilots to select, download, and render regional aeronautical charts directly.
- **FR-007**: System MUST provide chart management controls to toggle visibility, adjust opacity, zoom to chart bounds, and unload active charts.
- **FR-008**: System MUST execute the Python flight planning and NOTAM parsing engine locally in the browser via Pyodide WebAssembly without requiring an external compute backend.
- **FR-009**: System MUST retrieve weather forecast data (winds aloft, temperature) for planned route coordinates and flight timestamps to calculate accurate True Heading, Wind Correction Angle, and Ground Speed.
- **FR-010**: System MUST validate planned cruise altitudes against standard ICAO/European semicircular VFR rules and present actionable safety advisories for non-compliant tracks.
- **FR-011**: System MUST filter active NOTAMs against the 2km route corridor and terminal aerodromes within the flight temporal window, presenting grouped safety alerts.
- **FR-012**: System MUST generate an interactive Navigation Log table displaying waypoint identifiers, True Course, Heading, Wind Vector, Altitude, TAS, Ground Speed, Leg Distance, ETE, and cumulative ETA.
- **FR-013**: System MUST provide a dedicated, print-optimized Operational Flight Briefing layout suitable for paper printing or PDF export.
- **FR-014**: System MUST localize all interface elements, form controls, table headers, and status messages into English (`en`) and Spanish (`es`) using Paraglide-JS.
- **FR-015**: System MUST implement a clean, responsive, professional aviation HUD UI built with modern Tailwind CSS utility styling.
- **FR-016**: System MUST maintain comprehensive unit test coverage using Vitest and automated end-to-end test coverage for core flight planning workflows using Playwright.
- **FR-017**: System MUST provide an IndexedDB-backed flight plan manager allowing pilots to save named flight plans, load saved plans, and auto-recover active unsaved session edits across browser refreshes.
- **FR-018**: Build system MUST automatically synchronize the Python calculation modules from `backend/planenificator` into `frontend/static/planenificator` to ensure serverless self-contained client execution and offline caching.
- **FR-019**: Automated E2E test suite MUST utilize deterministic network route interception and JSON fixtures for Open-Meteo weather and ENAIRE NOTAM services to guarantee fast, resilient, and repeatable CI verification without live network fragility.

### Key Entities

- **Waypoint**: Represents a geographic navigation fix with latitude, longitude, altitude (ft), identifier/name, and sequence position.
- **Route Segment**: A discrete partition of the flight route consisting of an ordered set of waypoints, assigned cruise altitude, and calculated climb/cruise/descent sub-phases.
- **Flight Profile**: Aircraft performance parameters including Departure/Destination/Alternate aerodromes, departure datetime, initial/arrival altitudes, cruise TAS, climb speed (Vy), climb vertical rate (fpm), and descent vertical rate (fpm).
- **Chart Overlay**: A georeferenced raster aeronautical layer with image buffer, geographic bounding box (WGS84), projection transformation metadata, and display properties (opacity, visibility).
- **Navigation Log Entry**: Computed operational metrics for an individual flight leg, including True Course (°), Wind Correction Angle (°), True Heading (°), Wind Component, Planned Altitude (ft), TAS (kt), Ground Speed (kt), Leg Distance (NM), Leg ETE (minutes), and ETA (UTC timestamp).
- **NOTAM Alert**: Aviation notice record including NOTAM code, location identifier, validity time window, lower/upper altitude limits, corridor conflict status, and plain-language summary.
- **SavedFlightPlan**: A persisted flight plan record stored in IndexedDB containing a unique ID, user-defined name, creation/updated timestamps, route waypoints, segments, and flight profile parameters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Complete route flight planning calculation (winds aloft, wind triangle, TOC/TOD, NOTAM corridor filtering) completes in under 5 seconds on standard broadband connections.
- **SC-002**: VFR chart drag-and-drop unpacking and client-side georeferenced map overlay render in under 3 seconds for standard regional chart packages (< 25MB).
- **SC-003**: 100% of pilot user workflows (waypoint editing, chart selection, parameter configuration, calculation, language toggle, and print export) operate entirely client-side without proprietary backend server requirements.
- **SC-004**: Language switching between English and Spanish occurs instantaneously (< 100ms) with zero layout shift and 100% translated UI string coverage.
- **SC-005**: All core user flows pass automated end-to-end Playwright tests and unit test suites with 100% pass rate in CI pipelines.
- **SC-006**: Generated Navigation Log calculations match standard manual E6B flight computer calculation tolerances within ±1° track/heading and ±1 knot ground speed across all test legs.
- **SC-007**: Print/PDF briefing layout prints cleanly without clipping, preserving legibility across standard A4 and Letter page dimensions.
- **SC-008**: Local flight plan saving and auto-recovery roundtrip completes in under 50ms without UI freezing.

## Assumptions

- Target browser environment supports WebAssembly, modern ES modules, and Canvas/WebGL rendering (Chrome, Firefox, Safari, Edge modern versions).
- External meteorological and NOTAM data providers (Open-Meteo ECMWF models and ENAIRE open data services) provide standard CORS headers or accessible public endpoints.
- Base aeronautical coordinate system conforms to WGS84 (EPSG:4326) and ENAIRE VFR charts conform to Lambert Conformal Conic (LCC) projection specifications.
- Mobile and tablet viewports will provide a responsive stacked layout, though primary flight planning workflows target desktop/laptop displays.
