"""Module to calculate multi-segment route navigation plans."""

import datetime
from typing import List, Tuple
from planenificator import planenificator


def generate_multi_segment_navigation_report(
    kmls: List[str],
    cruise_alts: List[int],
    initial_alt: int = 2500,
    arrival_alt: int = 2000,
    tas: int = 80,
    vy: int = 70,
    rate_of_climb: int = 700,
    rate_of_descent: int = 500,
    flight_start_date: datetime.datetime = None,
    dep_aerodrome: str = None,
    dest_aerodrome: str = None,
    alt_aerodromes: List[str] = None,
) -> Tuple[List[List], dict]:
  """Computes navigation reports across multiple KML segments.

  Args:
    kmls: List of KML file paths (one per segment)
    cruise_alts: List of cruise altitudes in feet (one per segment)
    initial_alt: Departure altitude in feet
    arrival_alt: Destination altitude in feet
    tas: True airspeed in knots
    vy: Best rate of climb speed in knots
    rate_of_climb: Rate of climb in feet per minute
    rate_of_descent: Rate of descent in feet per minute
    flight_start_date: Flight departure time
    dep_aerodrome: Departure aerodrome code
    dest_aerodrome: Destination aerodrome code
    alt_aerodromes: List of alternate aerodrome codes

  Returns:
    Tuple of (combined_navigation_table, merged_notam_data)
  """
  if len(kmls) != len(cruise_alts):
    raise ValueError('The number of KML files must match the number of cruise altitudes.')

  if flight_start_date is None:
    flight_start_date = datetime.datetime.now()

  next_alts = cruise_alts[1:] + [arrival_alt]

  total_dist = 0.0
  total_time = 0.0

  combined_table = [[
      'Waypoint', 'True course', 'Heading', 'Wind', 'Altitude',
      'TAS', 'GS', 'Leg', 'ETE', 'ETA'
  ]]

  merged_notam_data = {
      'route_conflicts': [],
      'aerodrome_conflicts': [],
      'all_aerodrome_notams': [],
      'all_route_notams': [],
  }

  current_alt = initial_alt
  current_date = flight_start_date

  for kml_file, cruise_alt, target_exit_alt in zip(kmls, cruise_alts, next_alts):
    table, notam_data, seg_dist, seg_time = planenificator.generate_navigation_report(
        input_kml=kml_file,
        initial_alt=current_alt,
        arrival_alt=target_exit_alt,
        cruise_alt=cruise_alt,
        tas=tas,
        vy=vy,
        rate_of_climb=rate_of_climb,
        rate_of_descent=rate_of_descent,
        flight_start_date=current_date,
        dep_aerodrome=dep_aerodrome,
        dest_aerodrome=dest_aerodrome,
        alt_aerodromes=alt_aerodromes,
    )

    combined_table.extend(table)
    total_dist += seg_dist
    total_time += seg_time
    current_date += datetime.timedelta(minutes=seg_time)
    current_alt = cruise_alt

    for key in merged_notam_data:
      for item in notam_data.get(key, []):
        if item not in merged_notam_data[key]:
          merged_notam_data[key].append(item)

  combined_table.append(
      ['Total', '', '', '', '', '', '', round(total_dist, 2), round(total_time, 2), '']
  )

  return combined_table, merged_notam_data
