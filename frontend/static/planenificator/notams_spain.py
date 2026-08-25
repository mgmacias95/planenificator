import requests
import json
import logging
import re
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


def is_schedule_overlap(item_d: str, start_time: datetime, end_time: datetime) -> bool:
  """Checks if the flight time window overlaps with the schedule in Item D."""
  if not item_d:
    return True  # Safe default: if no schedule, assume overlap

  s = item_d.upper()

  # Map days to weekday index (0=Monday, 6=Sunday)
  day_map = {
      'MON': 0, 'LUN': 0,
      'TUE': 1, 'MAR': 1,
      'WED': 2, 'MIE': 2,
      'THU': 3, 'JUE': 3,
      'FRI': 4, 'VIE': 4,
      'SAT': 5, 'SAB': 5,
      'SUN': 6, 'DOM': 6
  }

  # Find all day headers in the schedule
  day_pattern = r'\b(MON|LUN|TUE|MAR|WED|MIE|THU|JUE|FRI|VIE|SAT|SAB|SUN|DOM|DAILY|DIARIO)\b'
  matches = list(re.finditer(day_pattern, s))

  flight_weekday = start_time.weekday()
  relevant_slots_text = ""

  if matches:
    # Segment schedule by days
    for idx, match in enumerate(matches):
      day_word = match.group(1)
      start_pos = match.start()
      end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(s)
      segment = s[start_pos:end_pos]

      is_relevant = False
      if day_word in ['DAILY', 'DIARIO']:
        is_relevant = True
      else:
        target_day_idx = day_map.get(day_word)
        if target_day_idx == flight_weekday:
          is_relevant = True

      if is_relevant:
        relevant_slots_text += " " + segment
  else:
    relevant_slots_text = s

  if not relevant_slots_text.strip():
    return False

  # Find all HHMM-HHMM time intervals
  time_pattern = r'\b(\d{2})(\d{2})-(\d{2})(\d{2})\b'
  slots = re.findall(time_pattern, relevant_slots_text)

  if not slots:
    return True

  # Convert flight window to minutes from midnight
  flight_start_min = start_time.hour * 60 + start_time.minute
  flight_end_min = end_time.hour * 60 + end_time.minute

  # Cap first day at midnight for overlap checking
  if end_time.date() > start_time.date():
    flight_end_min = 24 * 60

  # Check if any slot overlaps with the flight window
  for sh_str, sm_str, eh_str, em_str in slots:
    sh, sm = int(sh_str), int(sm_str)
    eh, em = int(eh_str), int(em_str)
    
    slot_start = sh * 60 + sm
    slot_end = eh * 60 + em

    if flight_start_min < slot_end and flight_end_min > slot_start:
      return True

  return False


def is_time_overlap(
    notam_start_epoch, notam_end_epoch, start_time: datetime, end_time: datetime, item_d: str = None
) -> bool:
  """
  Checks if the flight interval [start_time, end_time] overlaps with the NOTAM 
  validity and daily schedules.
  """
  if not notam_start_epoch:
    return True

  start_dt = datetime.fromtimestamp(notam_start_epoch / 1000)

  if start_dt > end_time:
    return False

  if notam_end_epoch:
    end_dt = datetime.fromtimestamp(notam_end_epoch / 1000)
    if end_dt < start_time:
      return False

  if item_d:
    return is_schedule_overlap(item_d, start_time, end_time)

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
    item_d = notam.get('itemD')
    if not item_d or not item_d.strip():
      item_d = notam.get('itemE')

    # 1. Check time overlap
    if not is_time_overlap(
        notam.get('itemB'), notam.get('itemC'), start_time, end_time, item_d
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


def print_notams(notam_data: dict):
  """Prints formatted NOTAM security warnings and detailed summaries."""
  route_conflicts = notam_data.get('route_conflicts', [])
  aerodrome_conflicts = notam_data.get('aerodrome_conflicts', [])

  if route_conflicts or aerodrome_conflicts:
    print('\n' + '\033[91m' + '=' * 20 + ' NOTAM SECURITY NOTICE ' + '=' * 20 + '\033[0m')
    for c in route_conflicts:
      print(
          f"\n\033[91m[WARNING] EN ROUTE CONFLICT WITH NOTAM {c.get('notamId')} ({c.get('areaSactaName') or 'AREA'})\033[0m"
      )
      print(f"  Limits: FL{c.get('LOWER_VAL')} - FL{c.get('UPPER_VAL')}\n  Text: {c.get('itemE')}")

    for item in aerodrome_conflicts:
      c = item[0] if isinstance(item, (list, tuple)) else item
      role = item[2] if isinstance(item, (list, tuple)) and len(item) > 2 else 'AERODROME'
      print(
          f"\n\033[91m[WARNING] {role} AERODROME ({c.get('itemA')}) CONFLICT WITH NOTAM {c.get('notamId')}\033[0m"
      )
      print(f"  Text: {c.get('itemE')}")
    print('\033[91m' + '=' * 76 + '\033[0m')

  ad_notams = notam_data.get('all_aerodrome_notams', [])
  route_notams = notam_data.get('all_route_notams', [])

  if ad_notams or route_notams:
    print('\n' + '=' * 20 + ' DETAILED NOTAMS FOUND ' + '=' * 20)
    if ad_notams:
      print(f'\n--- AERODROME NOTAMS ({len(ad_notams)}) ---')
      for n in ad_notams:
        print(f"- {n.get('notamId')} ({n.get('itemA')}): {n.get('itemE')[:180]}...")
    if route_notams:
      print(f'\n--- EN ROUTE NOTAMS ({len(route_notams)}) ---')
      for n in route_notams:
        print(f"- {n.get('notamId')} ({n.get('areaSactaName') or 'AREA'}): {n.get('itemE')[:180]}...")
    print('=' * 81)



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
    item_d = notam.get('itemD')
    if not item_d or not item_d.strip():
      item_d = notam.get('itemE')

    if not is_time_overlap(
        notam.get('itemB'), notam.get('itemC'), target_start, target_end, item_d
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
