# Data Model: Offline Client-Side Reverse Geocoding

## Entities & Schemas

### 1. Gazetteer Dataset (`gazetteer-es.json`)
The static serialized catalog containing all reference points for Spain.

```typescript
export interface GazetteerDataset {
  version: string;             // e.g., "1.0"
  region: string;              // e.g., "ES"
  generatedAt: string;         // ISO 8601 timestamp
  airports: AerodromeRecord[]; // Aviation landing sites from OurAirports
  places: SettlementRecord[];  // Populated places from GeoNames
}

export interface AerodromeRecord {
  name: string;                // Display name, e.g. "LECU - Cuatro Vientos"
  lat: number;                 // Latitude in decimal degrees (WGS84, rounded to 4 decimals)
  lon: number;                 // Longitude in decimal degrees (WGS84, rounded to 4 decimals)
  type: 'aerodrome' | 'heliport' | 'seaplane';
  ident?: string;              // ICAO / local identifier, e.g. "LEMD", "LERM", "LECU"
}

export interface SettlementRecord {
  name: string;                // Settlement name, e.g. "Guadalajara", "Alcalá de Henares"
  lat: number;                 // Latitude in decimal degrees (WGS84, rounded to 4 decimals)
  lon: number;                 // Longitude in decimal degrees (WGS84, rounded to 4 decimals)
  type: 'city' | 'town' | 'village';
  pop?: number;                // Population count (if available from GeoNames)
}
```

---

### 2. Geocoding Result (`GeocodingMatch`)
The structured output returned when querying a coordinate.

```typescript
export interface GeocodingMatch {
  resolvedName: string;        // Final formatted name, e.g. "LECU - Cuatro Vientos" or "Guadalajara"
  distanceKm: number;          // Distance in kilometers from query coordinate
  distanceNm: number;          // Distance in nautical miles
  category: 'aerodrome' | 'heliport' | 'settlement' | 'coordinate_fallback';
  source?: 'OurAirports' | 'GeoNames' | 'Coordinates';
}
```

---

### 3. Spatial Grid Bucket Index (`SpatialGridIndex`)
In-memory spatial index structure used for fast radius queries.

```typescript
export interface SpatialGridBucket<T> {
  items: Array<{
    item: T;
    lat: number;
    lon: number;
  }>;
}

export type GridKey = `${number},${number}`; // Grid cell key "latBucket,lonBucket" (step: 0.25°)
```

## Validation & Business Rules

1. **Aviation Priority**:
   - If an `AerodromeRecord` is found with `distanceNm <= 5.0 NM` (9.26 km), it MUST be chosen over any `SettlementRecord`.
2. **Settlement Closeness**:
   - If no aerodrome is within 5.0 NM, the closest `SettlementRecord` with `distanceKm <= 20.0 km` is chosen.
3. **Coordinate Fallback**:
   - If no record is found within 20 km, the returned name MUST format as `WP (lat.toFixed(3), lon.toFixed(3))`.
4. **Manual Name Preservation**:
   - When a `Waypoint.isManualName` flag is `true`, the resolved name MUST NOT overwrite `Waypoint.name`.
