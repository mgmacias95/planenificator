<!--
Sync Impact Report:
- Version change: 0.0.0 → 1.0.0 (Initial Ratification)
- Ratification Date: 2026-08-25
- Added Core Principles:
  - I. Aviation Calculation Integrity & Determinism (NON-NEGOTIABLE)
  - II. Core Engine Independence & Dual-Interface Parity
  - III. Serverless, Client-Side & Privacy-First Architecture
  - IV. Test-Driven Verification for Aviation Domain Rules
  - V. Modern Svelte 5 & TypeScript Standards
- Added Sections:
  - Architecture & Technology Constraints
  - Development & Quality Workflow
  - Governance
- Follow-up TODOs: None
-->

# Planenificator Constitution

## Core Principles

### I. Aviation Calculation Integrity & Determinism (NON-NEGOTIABLE)
- All navigation formulas (Wind Triangle, WCA, True Heading, Ground Speed, Climb/Descent TOC/TOD profiles, Great Circle distances, and Magnetic Variation) MUST be deterministic, well-documented, and backed by explicit mathematical test cases with verified aviation test datasets.
- Aviation safety checks (e.g., European semi-circular flight level rules, NOTAM 2km route corridor conflicts, and temporal activation windows) MUST fail open with explicit pilot warnings rather than silently suppressing discrepancies.

### II. Core Engine Independence & Dual-Interface Parity
- Core flight planning, parsing (KML, geodata), NOTAM filtering, and weather forecasting logic MUST reside in clean, modular Python libraries (`planenificator/`) independent of any presentation layer.
- Both the CLI (`main.py`) and the Web Application (`frontend/`) MUST consume the same underlying calculation rules and output compatible navigation logs and safety notices.

### III. Serverless, Client-Side & Privacy-First Architecture
- The web application MUST remain 100% serverless and static-hostable (e.g., GitHub Pages via `@sveltejs/adapter-static`).
- Heavy compute and Python modules execute client-side via Pyodide / WebAssembly.
- External catalogs (ENAIRE VFR charts, weather models, NOTAMs) MUST be fetched or processed in-memory or cached in the browser; pilot routes, personal waypoints, and operational briefings MUST NEVER require an external telemetry or persistence backend.

### IV. Test-Driven Verification for Aviation Domain Rules
- Any modification to geodetic math, wind triangle calculations, climb profiles, or NOTAM parsing MUST include unit tests covering standard cases, edge boundaries (e.g., 0°/360° heading wraps, zero wind speed, crosswind limits, midnight UTC date rollovers), and mock external APIs.
- Frontend components MUST maintain high test coverage using Vitest (unit/component) and Playwright (end-to-end user workflows).

### V. Modern Svelte 5 & TypeScript Standards
- All web frontend code in `frontend/` MUST follow modern Svelte 5 runes (`$state`, `$derived`, `$props`, etc.), strict TypeScript types, and Paraglide-based internationalization (English & Spanish).
- No legacy Svelte 3/4 stores or syntax when building new or refactoring existing frontend features.

## Architecture & Technology Constraints

- **Python Core**: Python 3.10+ compatible with standard Pyodide browser environments; minimal external runtime dependencies.
- **Frontend Stack**: SvelteKit 2 + Svelte 5, TypeScript, Vite, Tailwind CSS with typography/forms plugins, `@inlang/paraglide-js` for i18n (`en`, `es`).
- **External Data Adapters**:
  - Open-Meteo API for ECMWF high-resolution wind forecasts.
  - ENAIRE ArcGIS Open Data services for Spanish NOTAMs and VFR georeferenced charts.
  - OpenStreetMap / Overpass for aerodrome data and elevation lookups.
- **Resilience**: All external API integrations MUST provide clear error handling, timeouts, and graceful fallbacks for offline or intermittent network conditions.

## Development & Quality Workflow

1. **Specification & Plan**: New aviation features or calculation enhancements MUST specify domain inputs, units (kt, NM, ft, °), coordinate reference systems (WGS84 / EPSG:4326), and regulatory assumptions before implementation.
2. **Automated Verification**:
   - Python: `pytest` must pass with zero warnings across all calculation suites.
   - Frontend: `pnpm check`, `pnpm lint`, and `pnpm test` (Vitest & Playwright) must pass cleanly before release.
3. **Operational Briefing Fidelity**: Any layout changes to printable PDF briefing packages or navigation logs must maintain readability and standard VFR flight plan format conventions.

## Governance

- The Constitution is the authoritative standard for architectural, algorithmic, and UI decisions across Planenificator.
- Amendments require updating this file with version increments following semantic versioning:
  - **MAJOR**: Changes to aviation safety verification rules, removal of core principles, or architectural shifts.
  - **MINOR**: Adding new external data providers, new calculation models, or updating frontend standards.
  - **PATCH**: Clarifications, wording improvements, or typo fixes.

**Version**: 1.0.0 | **Ratified**: 2026-08-25 | **Last Amended**: 2026-08-25
