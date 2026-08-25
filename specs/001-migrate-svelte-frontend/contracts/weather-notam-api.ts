/**
 * External Weather & NOTAM Data Contracts
 */

export interface OpenMeteoHourlyResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  hourly: {
    time: string[];
    temperature_2m?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wind_speed_80m?: number[];
    wind_direction_80m?: number[];
    wind_speed_120m?: number[];
    wind_direction_120m?: number[];
    wind_speed_180m?: number[];
    wind_direction_180m?: number[];
  };
}

export interface EnaireNotamFeature {
  attributes: {
    OBJECTID: number;
    ID_NOTAM: string;
    CODIGO_OACI: string;
    FECHA_INICIO: number;
    FECHA_FIN: number;
    ITEM_Q: string;
    ITEM_E: string;
    ITEM_F?: string;
    ITEM_G?: string;
    NIVEL_INF?: number;
    NIVEL_SUP?: number;
    [key: string]: unknown;
  };
  geometry?: {
    x?: number;
    y?: number;
    rings?: number[][][];
    paths?: number[][][];
  };
}

export interface EnaireNotamResponse {
  features: EnaireNotamFeature[];
  exceededTransferLimit?: boolean;
}
