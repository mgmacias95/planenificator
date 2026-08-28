# Planenificator Frontend

Modern, high-performance VFR flight planning web application built with **SvelteKit 2**, **Svelte 5 (Runes)**, **Tailwind CSS v4**, and **Pyodide WebAssembly**.

## Features

- 🗺️ **Interactive Route Planning**: Dynamic multi-segment flight planning with Leaflet map, draggable waypoints, and automatic OSM aerodrome reverse geocoding.
- 📐 **Client-Side WebAssembly Flight Math**: Executes the Python aviation engine in-browser via Pyodide WASM with zero backend server dependencies.
- 🇪🇸 **ENAIRE VFR Raster Charts**: Automatic Lambert Conformal Conic (LCC) georeferencing for official 1:500k charts from ENAIRE Open Data or local GeoTIFF/TFW uploads.
- 🛡️ **Aviation Safety Audits**: Semicircular rule compliance checking (odd/even + 500 ft) and 2km corridor NOTAM conflict filtering.
- 🌐 **Multi-Language Accessibility**: Instant zero-lag language switching between English (`en`) and Spanish (`es`) with Paraglide-JS.
- 💾 **Local Project Persistence**: Auto-save draft recovery and named flight plan project management via IndexedDB.
- 🖨️ **Cockpit Print Briefing**: Standardized PDF / printable Operational Flight Briefings formatted for cockpit flight decks.

## Development & Build

```bash
# Install dependencies
pnpm install

# Synchronize backend Python modules
pnpm run sync:python

# Start development server
pnpm run dev

# Type check
pnpm run check

# Format & Lint
pnpm run lint
pnpm run format

# Run Unit Tests
pnpm run test:unit

# Build for Production (Static serverless deployment)
pnpm run build

# Preview Production Build
pnpm run preview
```

## Testing

- **Unit Tests**: `pnpm run test:unit` (Vitest with domain math and storage verification)
- **E2E Tests**: `pnpm run test:e2e` (Playwright browser workflow test suite)
- **Backend Tests**: `pytest backend/` (Python engine validation)
