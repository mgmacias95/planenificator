# Feature Specification: Offline Client-Side Reverse Geocoding

**Feature Branch**: `002-offline-reverse-geocoding`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "In-browser offline reverse geocoding using GeoNames + OurAirports for Spain instead of Nominatim API"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Offline Waypoint Identification (Priority: P1)

When a pilot adds or adjusts a waypoint on the navigation chart (by clicking, double-clicking, or dragging a marker), the system immediately identifies the geographic name of the location (town, village, or landmark) locally in the browser without relying on an external geocoding service or active internet connection.

**Why this priority**: Fast, offline-capable flight planning is essential for VFR pilots preparing flights at airfields with poor connectivity or operating completely offline. Eliminating external API calls avoids network latency, rate-limiting failures, and service unavailability.

**Independent Test**: Can be tested by disconnecting network access in the browser, double-clicking on points across Spain on the map, and confirming meaningful settlement and landmark names appear immediately on waypoint labels.

**Acceptance Scenarios**:

1. **Given** the pilot is working offline and places a new waypoint near a Spanish town (e.g., Guadalajara), **When** the waypoint is created, **Then** the waypoint name is automatically assigned the town's name within milliseconds.
2. **Given** an existing waypoint with an automatically resolved name, **When** the pilot drags the marker to a different municipality, **Then** the waypoint label updates immediately to the new nearest settlement name.
3. **Given** a waypoint placed in open water or remote area with no nearby settlements within search distance, **When** the waypoint is placed, **Then** the name falls back to a clear geographic coordinate notation (e.g., `WP (36.120, -5.350)`).

---

### User Story 2 - Aviation Landmark & Aerodrome Priority (Priority: P2)

When a pilot places a waypoint close to an airport, aerodrome, or ultralight airstrip, the system prioritizes the airfield name and identifier over generic municipal or street names.

**Why this priority**: In aviation flight planning, navigational waypoints frequently coincide with departure, arrival, or en-route diversion aerodromes. Showing the airfield name (e.g., "LECU - Cuatro Vientos" or "LERM - Robledillo") is significantly more useful and relevant to pilots than nearby municipal names.

**Independent Test**: Can be tested by placing a waypoint near known aerodromes and verifying that the resulting waypoint title displays the aerodrome identifier and name rather than a nearby district or town.

**Acceptance Scenarios**:

1. **Given** a waypoint placed within 5 nautical miles (~8 km) of an aerodrome, **When** the name is resolved, **Then** the aerodrome name and identifier take precedence over neighboring town names.
2. **Given** a waypoint placed far away (> 5 NM) from any aerodrome but close to a village, **When** the name is resolved, **Then** the village name is selected.

---

### User Story 3 - Custom Name Preservation & License Compliance (Priority: P3)

The pilot can manually edit any waypoint name, and manually renamed waypoints are never overwritten by automated geocoding. The application also provides proper attribution for the bundled open datasets in compliance with their licensing terms.

**Why this priority**: Pilots need full control over their flight logs and reporting point names, and project maintainers must adhere to open-data licensing obligations (CC BY 4.0 for GeoNames and Public Domain for OurAirports).

**Independent Test**: Can be tested by manually renaming a waypoint in the flight plan, dragging it on the map, and verifying that the custom name persists unchanged; also by verifying that attribution notices are clearly present in the application notices/footer.

**Acceptance Scenarios**:

1. **Given** a waypoint whose name has been manually edited by the pilot, **When** the waypoint is moved or the flight plan recalculated, **Then** the manual name is preserved without being overwritten.
2. **Given** the application is open, **When** the pilot views the legal/about notices or map attribution, **Then** required credits for GeoNames and OurAirports are visible with appropriate links.

---

### Edge Cases

- **Open Ocean / Off-grid Points**: When waypoints are placed far out at sea (e.g., transit to the Balearic or Canary Islands), the system gracefully displays formatted latitude/longitude coordinates without errors.
- **High-Density Aerodrome Clusters**: When multiple aviation landing sites exist in close proximity, the nearest facility to the coordinates is selected.
- **Rapid Marker Dragging**: If the user rapidly drags or repositions waypoints, the lookup does not cause UI stutter or race conditions.
- **Zero Internet Connectivity**: The entire naming flow must function identically whether connected to the internet or fully offline in airplane mode.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST perform reverse geocoding locally within the client browser without sending network requests to external geocoding endpoints.
- **FR-002**: The system MUST bundle or pre-load an offline geographic gazetteer covering populated settlements and aviation landing sites for Spain.
- **FR-003**: The system MUST prioritize aviation landing sites (airports, aerodromes, airstrips, heliports) over general populated places when a waypoint is located within a defined proximity threshold (5 nautical miles / ~8 km).
- **FR-004**: The system MUST fall back to formatted geographic coordinates when no matching settlement or airfield is found within the maximum search radius.
- **FR-005**: The system MUST preserve user-customized waypoint names and never overwrite names marked as manually entered.
- **FR-006**: The system MUST display attribution notices attributing the data sources in accordance with CC BY 4.0 and Public Domain terms.

### Key Entities

- **Gazetteer Place**: Represents a known geographic point of interest (name, geographic coordinates, category such as city, town, aerodrome, heliport, and optional aviation identifier).
- **Waypoint**: Represents a navigational point in a flight plan (identifier, geographic coordinates, display name, manual edit flag).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Waypoint reverse geocoding resolves in under 50 milliseconds from user interaction (drag release or map click).
- **SC-002**: 100% of waypoint naming operations succeed with zero external network requests to third-party geocoders.
- **SC-003**: In 100% of test cases within 5 NM of an active airfield, the airfield identity is selected as the primary waypoint name.
- **SC-004**: Offline flight planning workflows operate with 100% functionality when the device has zero internet connectivity.

## Assumptions

- The initial gazetteer dataset focuses on Spain (Iberian peninsula, Balearic Islands, and Canary Islands).
- The gazetteer data is packaged statically alongside application assets and loaded into memory on demand.
- The browser environment supports standard in-memory array or spatial indexing structures.
- Populated place data is derived from GeoNames (CC BY 4.0) and airfield data from OurAirports (Public Domain).
