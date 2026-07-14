"""Helpers to compute specific navigation parameters."""

import math


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
  """Calculate the true course between two coordinates.

  Args:
    lat1: latitude of the first coordinate
    lon1: longitude of the first coordinate
    lat2: latitude of the second coordinate
    lon2: longitude of the second coordinate

  Returns:
    True course in degrees
  """
  phi1, phi2 = math.radians(lat1), math.radians(lat2)
  delta_lambda = math.radians(lon2 - lon1)
  y = math.sin(delta_lambda) * math.cos(phi2)
  x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
  return (math.degrees(math.atan2(y, x)) + 360) % 360


def calculate_ground_speed_and_heading(
    tas: float,
    wind_speed: float,
    wind_direction: float,
    true_course: float
) -> tuple[float, float]:
  """Calculates the ground speed and heading of an aircraft.

  Uses the exact wind triangle resolution from:
  https://www.calctool.org/kinetics/ground-speed

  First computes the wind correction angle (alpha):
    alpha = arcsin((wind_speed / tas) * sin(wind_direction - true_course))
  Then computes the ground speed using the Law of Cosines:
    v_g = sqrt(tas^2 + wind_speed^2 - 2*tas*wind_speed*cos(true_course - wind_direction + alpha))
  And finally, the aircraft's heading:
    heading = true_course + alpha

  Args:
    tas: true airspeed in knots
    wind_speed: wind speed in knots
    wind_direction: wind direction in degrees
    true_course: true course in degrees

  Returns:
    Tuple(ground speed in knots, heading in degrees)
  """
  wd_rad = math.radians(wind_direction)
  tc_rad = math.radians(true_course)

  # Calculate wind correction angle (alpha)
  ratio = (wind_speed / tas) * math.sin(wd_rad - tc_rad)
  if ratio < -1.0:
    ratio = -1.0
  elif ratio > 1.0:
    ratio = 1.0
  alpha_rad = math.asin(ratio)

  # Calculate ground speed using the Law of Cosines formula from CalcTool
  term = tas**2 + wind_speed**2 - 2 * tas * wind_speed * math.cos(tc_rad - wd_rad + alpha_rad)
  if term < 0.0:
    return 0.0, 0.0
  return math.sqrt(term), math.degrees(tc_rad + alpha_rad) % 360


def calculate_leg_ete(distance_nm: float, ground_speed: float) -> float:
  """Calculates the estimated time en route for a leg.

  Args:
    distance_nm: distance in nautical miles
    ground_speed: ground speed in knots

  Returns:
    Estimated time en route in minutes
  """
  return (distance_nm / ground_speed) * 60


def calculate_top_time(
    initial_alt: int,
    cruise_alt: int,
    rate: int,
):
  """Calculates the time required to reach the top of climb/descent in minutes

  Args:
    initial_alt: initial altitude in feet
    cruise_alt: cruise altitude in feet
    rate: rate of climb/descent in feet per minute.
  """
  return (cruise_alt - initial_alt) / rate


def check_semi_circular_rule(course: float, altitude: int):
  """Check if the course is valid according to the semi circular rule.

  In Europe, when flying above 3,000 feet AGL, you must maintain a cruising
  altitude based on your magnetic track, adding 500 feet to standard IFR levels.
    * Track 090° to 269° (Eastbound): Odd thousands of feet + 500 ft.
    * Track 270° to 089° (Westbound): Even thousands of feet + 500 ft.

  Source:
  https://guiavfr.enaire.es/contenido_GuiaVFR/LE_guiaVFR_GEN.html
  https://guiavfr.enaire.es/contenido_GuiaVFR/LE_guiaVFR_GEN_img/FL.png

  Args:
    course: true course in degrees
    altitude: altitude in feet
  """
  thousands = altitude // 1000
  is_odd = thousands % 2 != 0
  is_even = thousands % 2 == 0
  ends_in_500 = altitude % 1000 == 500

  return altitude < 3000 or ends_in_500 and (
      (90 <= course < 270 and is_odd) or
      ((course >= 270 or course < 90) and is_even)
  )
