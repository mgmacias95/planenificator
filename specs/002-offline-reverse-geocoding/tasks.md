# Tasks: Offline Client-Side Reverse Geocoding

**Input**: Design documents from `specs/002-offline-reverse-geocoding/` (`spec.md`, `plan.md`, `data-model.md`, `contracts/`, `research.md`)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dataset compilation tooling and build scripts

- [X] T001 Create Node.js gazetteer extraction script in `frontend/scripts/build-gazetteer.js`
- [X] T002 Update npm scripts in `frontend/package.json` to include `build:gazetteer`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data and types that MUST be complete before user stories can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Generate Spain gazetteer dataset in `frontend/static/data/gazetteer-es.json` by running `npm run build:gazetteer`
- [X] T004 [P] Define TypeScript geocoding interfaces and data models in `frontend/src/lib/types/geocoding.ts`
- [X] T005 [P] Implement Haversine distance calculations in `frontend/src/lib/utils/geo.ts`

**Checkpoint**: Foundation ready - dataset and shared utilities available for user story implementation.

---

## Phase 3: User Story 1 - Instant Offline Waypoint Identification (Priority: P1) 🎯 MVP

**Goal**: Instant local settlement lookup and coordinate fallback without external network requests.

**Independent Test**: Disconnect internet connection in browser, create or drag waypoints near Spanish towns (e.g., Guadalajara), and verify settlement names or `WP (lat, lon)` coordinates resolve instantly in < 50ms.

### Tests for User Story 1

- [X] T006 [P] [US1] Unit test suite for spatial grid indexing, settlement lookup, and coordinate fallback in `frontend/tests/unit/geocoding.test.ts`

### Implementation for User Story 1

- [X] T007 [US1] Implement `GeocodingService` with spatial grid index and settlement lookup in `frontend/src/lib/services/geocoding.ts`
- [X] T008 [US1] Integrate `GeocodingService` in `frontend/src/lib/components/Map.svelte` to replace Nominatim API fetch in `resolveWaypointName()`

**Checkpoint**: User Story 1 functional (MVP). Waypoint placement resolves settlement names offline.

---

## Phase 4: User Story 2 - Aviation Landmark & Aerodrome Priority (Priority: P2)

**Goal**: Prioritize aerodromes, airstrips, and heliports over general town names when within 5 NM.

**Independent Test**: Place waypoints within 5 NM of known aerodromes (e.g. LECU Cuatro Vientos, LERM Robledillo) and verify that the airfield name/ICAO is displayed instead of the municipal town name.

### Tests for User Story 2

- [X] T009 [P] [US2] Unit test suite for aviation snapping priority within 5 NM radius in `frontend/tests/unit/geocoding-aviation.test.ts`

### Implementation for User Story 2

- [X] T010 [US2] Implement Tier 1 aerodrome proximity snapping in `frontend/src/lib/services/geocoding.ts`

**Checkpoint**: User Story 2 functional. Airfields and airstrips take precedence within 5 NM.

---

## Phase 5: User Story 3 - Custom Name Preservation & License Compliance (Priority: P3)

**Goal**: Ensure manual waypoint names are not overwritten and display required legal attribution.

**Independent Test**: Manually edit a waypoint name, drag the marker, and verify the custom name persists; check that GeoNames (CC BY 4.0) and OurAirports (Public Domain) credits appear in the map footer/about notes.

### Tests for User Story 3

- [X] T011 [P] [US3] Unit test verifying manual waypoint name preservation across marker moves in `frontend/tests/unit/waypoint-name-preservation.test.ts`

### Implementation for User Story 3

- [X] T012 [P] [US3] Add open dataset licensing attribution notices in `README.md`
- [X] T013 [US3] Add dataset attribution link (GeoNames & OurAirports) to map footer in `frontend/src/lib/components/Map.svelte`

**Checkpoint**: User Story 3 functional. Full licensing compliance and custom name safety.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, static module alignment, and full regression verification

- [X] T014 [P] Update Python fallback in `frontend/static/planenificator/osm.py` and `backend/planenificator/osm.py`
- [X] T015 Run full verification suite (`npm run check` and `npm run test:unit`) in `frontend/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) - BLOCKS all user stories.
- **User Story 1 (Phase 3 - P1)**: Depends on Phase 2. MVP milestone.
- **User Story 2 (Phase 4 - P2)**: Extends `GeocodingService` from Phase 3 with aviation priority.
- **User Story 3 (Phase 5 - P3)**: Depends on Phase 3 Map integration.
- **Polish (Phase 6)**: Final regression checks across all stories.

### Parallel Opportunities

- `T004` (Types) and `T005` (Geo utils) can run in parallel in Phase 2.
- `T006` (US1 Tests), `T009` (US2 Tests), and `T011` (US3 Tests) can be authored in parallel.
- `T012` (README attribution) can run in parallel with code implementation.

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + Phase 3)
1. Build gazetteer dataset (`T001` - `T003`).
2. Implement types, distance utils, and `GeocodingService` (`T004` - `T007`).
3. Replace Nominatim fetch in `Map.svelte` (`T008`).
4. Validate offline settlement lookup.

### Incremental Enhancements
1. Add aerodrome prioritization (`T009` - `T010`).
2. Add manual name tests and licensing attributions (`T011` - `T013`).
3. Clean up static Python fallback and run end-to-end checks (`T014` - `T015`).
