"""Prepares an operational plan for a plane route along a designated list
of coordinates defined in a KML file.
"""

import csv
import datetime
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
    flight_start_date: datetime.datetime
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
    flight_start_date: date of the flight
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
      'Heading',
      'Wind',
      'Altitude',
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

    current_altitude = initial_alt if is_climbing else cruise_alt
    met = meteo.fetch_meteo(
        *coords[i], flight_start_date.strftime('%Y-%m-%dT%H:00'), 
        target_altitude=current_altitude
    )

    # compute the true course between the current and the next waypoint
    true_course = helpers.calculate_bearing(p1[0], p1[1], p2[0], p2[1])

    # decide the speed we will be flying: either rate of climb or true airspeed
    speed = vy if is_climbing else tas

    # compute ground speed
    gs, heading = helpers.calculate_ground_speed_and_heading(
        tas=speed,
        wind_speed=met.wind_speed,
        wind_direction=met.wind_direction,
        true_course=true_course
    )

    if not helpers.check_semi_circular_rule(true_course, current_altitude):
      logging.warning(
          'Semi circular rule not followed for leg %s -> %s '
          '(true course: %f, alt: %d)', 
          point_names[i], point_names[i+1], true_course, current_altitude
      )

    # compute estimated time between the current and the next waypoint
    ete = helpers.calculate_leg_ete(dist_nm, gs)
    flight_start_date += datetime.timedelta(minutes=ete)
    total_time += ete

    # check if we reached the TOC or not
    if is_climbing and total_time >= climb_time:
      logging.debug('Reached TOC')
      is_climbing = False
      point_names[i+1] += ' (TOC)'

    wind_str = f"{met.wind_direction:.0f}° / {met.wind_speed:.1f} kt"
    table.append([
        point_names[i],
        round(true_course, 1),
        round(heading, 1),
        wind_str,
        current_altitude,
        speed,
        gs,
        round(dist_nm, 2),
        ete,
        flight_start_date,
    ])

  # calculate top of descent, this needs to be done in the end because
  # we need to know the total travel time.
  logging.debug(f'{total_time=} {descend_time=}')
  is_descending = True
  time_to_start_descent = flight_start_date - datetime.timedelta(minutes=descend_time)
  logging.debug('Time to start descent: %s', time_to_start_descent)

  for row in reversed(table[1:]):
    if is_descending and row[-1] <= time_to_start_descent: 
      logging.debug('Reached TOD')
      row[0] += ' (TOD)'
      is_descending = False
    # pretty print the ETA showing only the time and minutes (assuming the
    # flight does not take more than a day)
    row[-1] = row[-1].strftime('%H:%M')
  # update the altitude of the last row to display the altitude in which 
  # the route will be finished.
  table[-1][4] = arrival_alt

  table.append(
      ['Total', '', '', '', '', '', total_traveled_distance, total_time, '']
  )

  return table
