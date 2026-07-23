import requests
import json
import logging
from datetime import datetime, timedelta

# ENAIRE ArcGIS REST FeatureServer URL
BASE_URL = 'https://servais.enaire.es/insigniads/rest/services/DINAMIC/Aero_SRV_NOTAM_data_v3/FeatureServer'


def fetch_notams_by_aerodromes(aerodromes: list[str]) -> list[dict]:
  """
  Fetches the NOTAMs associated with the specified aerodromes.
  Queries both layer 0 (Points) and layer 1 (Areas).
  """
  if not aerodromes:
    return []

  # Normalize to uppercase
  aerodromes = [a.upper().strip() for a in aerodromes if a.strip()]
  if not aerodromes:
    return []

  # Format the SQL IN clause: "itemA IN ('LEMD', 'LECU')"
  ad_list_str = ', '.join([f"'{ad}'" for ad in aerodromes])
  where_clause = f'itemA IN ({ad_list_str})'

  notams = []

  # Layer 0 (Points) and Layer 1 (Areas)
  for layer in [0, 1]:
    url = f'{BASE_URL}/{layer}/query'
    params = {
        'where': where_clause,
        'outFields': (
            'notamId,notamSerie,notamNumber,notamYear,itemA,itemB,itemC,itemD,'
            'itemE,itemF,itemG,qcode,areaSactaName'
        ),
        'returnGeometry': 'false',
        'f': 'json',
    }
    try:
      response = requests.get(url, params=params)
      response.raise_for_status()
      data = response.json()
      if 'error' in data:
        logging.error(f'Error querying layer {layer}: {data['error']}')
        continue
      features = data.get('features', [])
      for f in features:
        attrs = f['attributes']
        attrs['layer'] = layer
        notams.append(attrs)
    except Exception as e:
      logging.error(f'Error connecting to ENAIRE for layer {layer}: {e}')

  return notams


def fetch_notams_by_route(coords: list[tuple[float, float]]) -> list[dict]:
  """
  Performs a spatial query to find area-type NOTAMs (layer 1)
  that intersect the route (list of lat, lon coordinates).
  """
  if not coords or len(coords) < 2:
    return []

  # ArcGIS format: [[lon1, lat1], [lon2, lat2], ...]
  paths = [[[lon, lat] for lat, lon in coords]]

  url = f'{BASE_URL}/1/query'
  params = {
      'geometry': json.dumps(
          {'paths': paths, 'spatialReference': {'wkid': 4326}}
      ),
      'geometryType': 'esriGeometryPolyline',
      'spatialRel': 'esriSpatialRelIntersects',
      'inSR': '4326',
      'where': '1=1',
      'outFields': (
          'notamId,notamSerie,notamNumber,notamYear,itemA,itemB,itemC,itemD,'
          'itemE,itemF,itemG,LOWER_VAL,UPPER_VAL,qcode,areaSactaName'
      ),
      'returnGeometry': 'false',
      'distance': '2000',  # 2km safety buffer
      'units': 'esriSRUnit_Meter',
      'f': 'json',
  }

  try:
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    if 'error' in data:
      logging.error(f'Error in spatial query for NOTAMs: {data['error']}')
      return []
    features = data.get('features', [])
    return [f['attributes'] for f in features]
  except Exception as e:
    logging.error(f'Error connecting to ENAIRE for spatial query: {e}')
    return []


def is_time_overlap(
    notam_start_epoch, notam_end_epoch, start_time: datetime, end_time: datetime
) -> bool:
  """
  Checks if the flight interval [start_time, end_time] overlaps with the NOTAM 
  validity.
  """
  if not notam_start_epoch:
    return True  # If there is no start date, we assume it can apply

  start_dt = datetime.fromtimestamp(notam_start_epoch / 1000)

  # If the NOTAM starts after the flight ends, there is no overlap
  if start_dt > end_time:
    return False

  if notam_end_epoch:
    end_dt = datetime.fromtimestamp(notam_end_epoch / 1000)
    # If the NOTAM ends before the flight starts, there is no overlap
    if end_dt < start_time:
      return False

  return True


def check_route_conflicts(
    notams: list[dict],
    start_time: datetime,
    end_time: datetime,
    min_alt: int,
    max_alt: int,
) -> list[dict]:
  """
  Filters the NOTAMs that intersect the route and also overlap in time and 
  altitude with the flight.
  """
  conflicts = []
  for notam in notams:
    # 1. Check time overlap
    if not is_time_overlap(
        notam.get('itemB'), notam.get('itemC'), start_time, end_time
    ):
      continue

    # 2. Check altitude overlap
    lower = notam.get('LOWER_VAL')
    upper = notam.get('UPPER_VAL')

    # If they are not defined, we assume a conflict for safety
    lower = 0 if lower is None else lower
    upper = 99900 if upper is None else upper

    if lower <= max_alt and upper >= min_alt:
      conflicts.append(notam)

  return conflicts


def check_aerodrome_conflicts(
    notams: list[dict],
    dep_ad: str,
    dest_ad: str,
    alts: list[str],
    start_time: datetime,
    end_time: datetime,
) -> list[tuple[dict, str, str]]:
  """
  Analyzes aerodrome NOTAMs to detect closures or other limitations.
  Returns tuples (notam, warning_type, aerodrome_role).
  """
  warnings = []

  # Keywords for closures
  closure_keywords = ['CLOSED', 'CLSD', 'NOT AVBL', 'CERRADO', 'NO DISPONIBLE']
  limit_keywords = [
      'LIMIT',
      'LTD',
      'UNSERVICEABLE',
      'U/S',
      'RESTRICT',
      'RESTRICCION',
      'WORK',
      'TRABAJOS',
  ]

  # Group aerodromes by role and their relevant time window
  # Departure: relevant at takeoff (start_time)
  # Destination: relevant at arrival (end_time)
  # Alternates: relevant at arrival (end_time)
  ad_roles = []
  if dep_ad:
    ad_roles.append(
        (dep_ad.upper(), 'DEPARTURE', start_time, start_time + timedelta(hours=1))
    )
  if dest_ad:
    ad_roles.append(
        (
            dest_ad.upper(),
            'ARRIVAL',
            end_time - timedelta(hours=1),
            end_time + timedelta(hours=1),
        )
    )
  if alts:
    for alt in alts:
      if alt:
        ad_roles.append(
            (
                alt.upper(),
                f'ALT({alt.upper()})',
                end_time - timedelta(hours=1),
                end_time + timedelta(hours=4),
            )
        )

  for notam in notams:
    item_a = (notam.get('itemA') or '').upper()

    # Find which aerodrome this NOTAM applies to
    target_role = None
    target_start = None
    target_end = None
    for ad, role, t_start, t_end in ad_roles:
      if ad in item_a:
        target_role = role
        target_start = t_start
        target_end = t_end
        break

    if not target_role:
      continue

    # Check if the NOTAM is valid during the time window of interest for that
    # aerodrome
    if not is_time_overlap(
        notam.get('itemB'), notam.get('itemC'), target_start, target_end
    ):
      continue

    text = (notam.get('itemE') or '').upper()

    # Search for closures or limitations
    is_closed = any(k in text for k in closure_keywords)
    is_limited = any(k in text for k in limit_keywords)

    if is_closed:
      warnings.append((notam, 'CLOSED', target_role))
    elif is_limited:
      warnings.append((notam, 'LIMITED', target_role))

  return warnings
