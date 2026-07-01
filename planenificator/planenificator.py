"""Prepares an operational plan for a plane route along a designated list
of coordinates defined in a KML file.
"""

import csv
import logging
import time
from geopy.distance import geodesic
import planenificator.osm as osm
import planenificator.kml_parser as kml
import planenificator.meteo as meteo
import planenificator.helpers as helpers


def generate_navigation_report(
    input_kml: str, 
    initial_alt: int,
    arrival_alt: int,
    cruise_alt: int,
    tas: int,
    vy: int,
    rate_of_climb: int,
    rate_of_descent: int,
    datetime: str
):
  """Generates operational plan.

  Args:
    input_kml: file path of the kml file containing the route coordinates in KML format.
    initial_alt: initial altitude in feet
    arrival_alt: arrival altitude in feet
    cruise_alt: cruise altitude in feet
    tas: true airspeed in knots
    vy: best rate of climb (v_y) speed in knots
    rate_of_climb: rate of climb in feet per minute.
    rate_of_descent: rate of descent in feet per minute.
    datetime: date of the flight in ISO 8601 format
  """
  coords = kml.parse_kml_polygon(input_kml)
  if not coords:
    logging.warning('No coordinates found.')
    return

  logging.info(
      'Processing %d points. This will take at least %d seconds...',
      len(coords), len(coords)
  )

  point_names = []
  for i, (lat, lon) in enumerate(coords):
    name = osm.get_osm_landmark(lat, lon)
    point_names.append(name)
    logging.debug('Point %d: %s', i+1, name)

    # CRITICAL: Nominatim policy requires 1 second between requests
    time.sleep(1)

  table = []
  table.append([
      'Waypoint',
      'True course',
      'Wind',
      # 'Altitude',
      # 'Magnetic Course',
      'TAS',
      'GS',
      'Leg',
      'ETE',
      'ETA',
      # 'Fuel',
      # 'Remaining fuel'
  ])

  total_traveled_distance, total_time = 0, 0
  # use a flag to control wether we are climbing or not
  is_climbing = True
  # compute top of climb
  climb_time = helpers.calculate_top_time(
      initial_alt=initial_alt,
      cruise_alt=cruise_alt,
      rate=rate_of_climb,
  )
  # compute top of descend
  descend_time = helpers.calculate_top_time(
      initial_alt=arrival_alt,
      cruise_alt=cruise_alt,
      rate=rate_of_descent,
  )

  for i in range(len(coords) - 1):
    p1, p2 = coords[i], coords[i+1]

    # compute distance between the current and the next waypoint
    dist_nm = geodesic(p1, p2).nautical
    total_traveled_distance += dist_nm

    met = meteo.fetch_meteo(*coords[i], datetime)

    # compute the true heading between the current and the next waypoint
    # TODO: also compute the heading taking the wind in account.
    heading = helpers.calculate_bearing(p1[0], p1[1], p2[0], p2[1])

    # decide the speed we will be flying: either rate of climb or true airspeed
    speed = vy if is_climbing else tas

    # compute ground speed
    gs = helpers.calculate_ground_speed(
        tas=speed,
        wind_speed=met.wind_speed_850hPa,
        wind_direction=met.wind_direction_850hPa,
        true_course=heading
    )

    # compute estimated time between the current and the next waypoint
    ete = helpers.calculate_leg_ete(dist_nm, gs)
    total_time += ete

    # check if we reached the TOC or not
    if is_climbing and total_time >= climb_time:
      logging.debug('Reached TOC')
      is_climbing = False
      point_names[i+1] += ' (TOC)'

    # TODO: use the wind direction at the correct hPa based on the current 
    # altitude, instead of using 850hPa.
    wind_str = f"{met.wind_direction_850hPa:.0f}° / {met.wind_speed_850hPa:.1f} kt"
    table.append([
        point_names[i],
        round(heading, 1),
        wind_str,
        speed,
        gs,
        round(dist_nm, 2),
        ete,
        total_time,
    ])

  # calculate top of descent, this needs to be done in the end because
  # we need to know the total travel time.
  logging.debug(f'{total_time=} {descend_time=}')
  time_to_start_descent = total_time - descend_time
  logging.debug('Time to start descent: %s', time_to_start_descent)
  for row in reversed(table):
    if row[-1] <= time_to_start_descent: 
      logging.debug('Reached TOD')
      row[0] += ' (TOD)'
      break 

  table.append(['Total', 0, '', 0, 0, total_traveled_distance, total_time])

  return table
