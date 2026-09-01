"""Prepares an operational plan for a plane route along a designated list
of coordinates defined in a KML file.
"""

import csv
import datetime
import logging
import time
from geopy.distance import geodesic
import planenificator.kml_parser as kml
import planenificator.meteo as meteo
import planenificator.helpers as helpers
import planenificator.notams_spain as notams


def generate_navigation_report(
    input_kml: str, 
    initial_alt: int,
    arrival_alt: int,
    cruise_alt: int,
    tas: int,
    vy: int,
    rate_of_climb: int,
    rate_of_descent: int,
    flight_start_date: datetime.datetime,
    dep_aerodrome: str = None,
    dest_aerodrome: str = None,
    alt_aerodromes: list[str] = None
):
  """Generates operational plan from a KML file.

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
  coords, point_names = kml.parse_kml_route(input_kml)
  if not coords:
    logging.warning('No coordinates found.')
    return None

  start_time = flight_start_date

  table = []

  total_traveled_distance, total_time = 0, 0
  # use a flag to control wether we are climbing or not
  is_climbing = initial_alt < cruise_alt
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

  semicircular_warnings = []
  limit = len(coords) - 1
  i = 0
  while i < limit:
    p1, p2 = coords[i], coords[i+1]

    # compute distance between the current and the next waypoint
    dist_nm = geodesic(p1, p2).nautical

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
      msg = (
          f"Semi circular rule not followed for leg {point_names[i]} -> "
          f"{point_names[i+1]} (true course: {true_course:.1f}°, alt: "
          f"{current_altitude} ft)"
      )
      logging.warning(msg)
      semicircular_warnings.append(msg)

    # compute estimated time between the current and the next waypoint
    ete = helpers.calculate_leg_ete(dist_nm, gs)
    wind_str = f"{met.wind_direction:.0f}° / {met.wind_speed:.1f} kt"

    # check if we reached the TOC or not
    if is_climbing and total_time + ete  >= climb_time:
      logging.debug('Reached TOC')
      is_climbing = False
      point_names.insert(i + 1, 'TOC')
      # recompute the distance because an intermediate TOC point will be added
      # between p1 and p2: p1 - TOC - p2
      dist_nm = (gs * abs(total_time - climb_time)) / 60
      ete = helpers.calculate_leg_ete(dist_nm, gs)
      # compute the exact coordinates where the TOC will be reached
      dest = geodesic(nautical=dist_nm).destination((p1[0], p1[1]), true_course)
      coords.insert(i + 1, (dest.latitude, dest.longitude))
      limit += 1
  
    flight_start_date += datetime.timedelta(minutes=ete)
    total_traveled_distance += dist_nm
    total_time += ete

    table.append([
        point_names[i],
        round(true_course),
        round(heading),
        wind_str,
        current_altitude,
        speed,
        round(gs),
        round(dist_nm),
        ete,
        flight_start_date,
    ])
    i += 1

  # calculate top of descent, this needs to be done in the end because
  # we need to know the total travel time.
  logging.debug(f'{total_time=} {descend_time=}')
  is_descending = True
  time_to_start_descent = flight_start_date - datetime.timedelta(minutes=descend_time)
  logging.debug('Time to start descent: %s', time_to_start_descent)

  for i, row in enumerate(reversed(table)):
    if is_descending and row[-1] <= time_to_start_descent: 
      logging.debug('Reached TOD')
      # TODO: compute TOD
      is_descending = False
    # pretty print the ETA showing only the time and minutes (assuming the
    # flight does not take more than a day)
    row[-1] = row[-1].strftime('%H:%M')
  # update the altitude of the last row to display the altitude in which 
  # the route will be finished.
  table[-1][4] = arrival_alt

  # NOTAM checks
  notam_data = {
      'route_conflicts': [],
      'aerodrome_conflicts': [],
      'all_aerodrome_notams': [],
      'all_route_notams': [],
      'semicircular_warnings': semicircular_warnings
  }
  
  # Fetch and check route NOTAMs
  logging.info('Checking available NOTAMs...')
  route_notams = notams.fetch_notams_by_route(coords)
  notam_data['all_route_notams'] = route_notams
  
  min_alt = min(initial_alt, arrival_alt, cruise_alt)
  max_alt = max(initial_alt, arrival_alt, cruise_alt)
  
  notam_data['route_conflicts'] = notams.check_route_conflicts(
      route_notams, start_time, flight_start_date, min_alt, max_alt
  )
  
  # Fetch and check aerodrome NOTAMs
  ad_list = []
  if dep_aerodrome: ad_list.append(dep_aerodrome)
  if dest_aerodrome: ad_list.append(dest_aerodrome)
  if alt_aerodromes: ad_list.extend(alt_aerodromes)
  
  if ad_list:
      logging.info(f"Checking NOTAMs for aerodromes: {ad_list}...")
      ad_notams = notams.fetch_notams_by_aerodromes(ad_list)
      notam_data['all_aerodrome_notams'] = ad_notams
      notam_data['aerodrome_conflicts'] = notams.check_aerodrome_conflicts(
          ad_notams, dep_aerodrome, dest_aerodrome, alt_aerodromes, start_time, flight_start_date
      )

  return table, notam_data, total_traveled_distance, total_time

