# Quickstart & Verification Guide: Offline Reverse Geocoding

## Prerequisites
- Node.js v20+
- Frontend dependencies installed (`cd frontend && npm install`)

## Build Gazetteer Dataset

Generate the static offline gazetteer JSON file from OurAirports & GeoNames:

```bash
cd frontend
node scripts/build-gazetteer.js
```

**Expected Output**:
- Generates `frontend/static/data/gazetteer-es.json`
- Contains ~1,200 Spanish aerodromes and ~12,000 settlements (~350 KB).

## Run Unit & Integration Tests

Execute unit tests covering reverse geocoding calculations and aviation prioritization:

```bash
cd frontend
npm run test:unit
```

**Validation Cases Tested**:
1. **Aerodrome snapping within 5 NM**:
   - `(40.370, -3.785)` resolves to `"LECU - Cuatro Vientos"`
   - `(40.485, -3.567)` resolves to `"LEMD - Adolfo Suárez Madrid-Barajas"` (or `"LEMD - Madrid-Barajas"`)
2. **Settlement lookup outside aerodrome radius**:
   - `(40.633, -3.167)` resolves to `"Guadalajara"`
3. **Maritime / Off-grid coordinate fallback**:
   - `(38.000, 2.000)` (open Mediterranean water) resolves to formatted coordinates `"WP (38.000, 2.000)"`
4. **Offline Resilience**:
   - Querying points with network disabled in browser runs in < 1ms with 0 HTTP errors.

## Interactive Verification

1. Start development server:
   ```bash
   cd frontend
   npm run dev
   ```
2. Open browser at `http://localhost:5173`.
3. Disconnect internet / toggle Airplane mode in DevTools Network tab.
4. Double-click on the map near Madrid, Cuatro Vientos, or Guadalajara.
5. Verify waypoints immediately display their correct landmark names without network errors.
