# Quickstart & Validation Guide: Svelte 5 Frontend

## Prerequisites

- **Node.js**: `v20.x` or later
- **pnpm**: `v9.x` or later
- **Python**: `3.10+` with `pytest` (for core engine tests)
- **Modern Browser**: Chrome, Firefox, Safari, or Edge (with WebAssembly support)

---

## 1. Setup & Installation

From repository root:

```bash
# 1. Install frontend npm dependencies
cd frontend
pnpm install

# 2. Sync Python backend modules into static assets
pnpm run prepare
```

---

## 2. Running Automated Tests

### Unit Tests (Vitest)
Executes pure calculation math, Svelte 5 component unit tests, and formatters:

```bash
cd frontend
pnpm test:unit
```

### End-to-End Tests (Playwright)
Executes full browser user workflows using deterministic API mocks:

```bash
cd frontend
# Install Playwright browser binaries (one-time)
pnpm exec playwright install --with-deps chromium

# Run all E2E specs
pnpm test:e2e
```

### Backend Python Engine Tests (pytest)
Verifies core navigation math and NOTAM algorithms:

```bash
cd ../backend
pytest
```

---

## 3. Running Local Development Server

```bash
cd frontend
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 4. Manual End-to-End Verification Scenarios

### Scenario A: Interactive VFR Route Creation & Calculation
1. Double click on the map near Córdoba (`LEBA`) to create Waypoint 1.
2. Double click near Madrid/Cuatro Vientos (`LECU`) to create Waypoint 2.
3. Observe route polyline connecting the waypoints and auto-calculated leg distance.
4. Click **"+ Segment"** to add a second route segment with cruise altitude `7500 ft`.
5. Click **"Calculate Route"**:
   - Verify status indicators show Pyodide execution and weather fetching.
   - Verify the Navigation Log table displays populated True Course, WCA, True Heading, Wind Vectors, Ground Speed, and Leg ETE.

### Scenario B: ENAIRE Aeronautical Chart Overlay
1. In the sidebar chart section, select a chart from the **"Download Direct from ENAIRE"** dropdown (e.g. *VFR 1:500k Sevilla*).
2. Click **"Load"**.
3. Verify the raster chart layer renders accurately aligned over the base map coordinates.
4. Toggle chart visibility checkbox and adjust the opacity slider.

### Scenario C: Semicircular Rule Safety Check & NOTAM Briefing
1. Set an eastbound leg (heading 000°-179°) with an even altitude (e.g., 4000 ft).
2. Run flight calculation.
3. Verify an advisory alert warns that eastbound VFR cruising requires odd altitude + 500 ft (e.g., 3500 ft or 5500 ft).
4. Inspect the NOTAM Briefing tab to confirm active corridor NOTAMs are categorized with summaries.

### Scenario D: Multi-Language Toggle (i18n)
1. Click the language switcher in the header (toggle between **EN** and **ES**).
2. Verify all UI labels, form controls, table headers, and modal dialogs translate immediately without resetting map or route state.

### Scenario E: Flight Plan Persistence & Auto-Recovery
1. Create a 3-waypoint route and customize flight profile speeds/altitudes.
2. Refresh the browser page (`Ctrl+R` / `Cmd+R`).
3. Verify all waypoints, segments, and profile parameters are immediately restored.
4. Click **"Save Plan"**, provide the name *"Córdoba Cross-Country"*, and save.
5. Clear the map, open **"Saved Plans"** drawer, and load *"Córdoba Cross-Country"*. Verify instant state restoration.

### Scenario F: Print Briefing & PDF Layout
1. With a calculated flight plan, click **"Print PDF Briefing"**.
2. Verify the print preview displays a clean operational flight log, safety notices, and NOTAM table while hiding HUD sidebars and map controls.
