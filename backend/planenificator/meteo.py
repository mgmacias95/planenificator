"""Meteo fetching functions.

The data is extracted from the Open Meteo API or Windy API.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import math
import requests

class MeteoException(Exception):
  """Defines an exception fetching the Meteo info."""


@dataclass
class Meteo:
  """Defines interesting weather data.

  wind_speed: the wind speed in the target altitude
  wind_direction: the wind direction in the target altitude
  """

  wind_speed: float
  wind_direction: float


def _parse_forecast_time(value: str) -> datetime:
  """Parses an Open-Meteo timestamp and normalizes it to UTC."""
  parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=timezone.utc)
  return parsed.astimezone(timezone.utc)


def _find_forecast_time_index(available_times: list[str], requested_time: str) -> int:
  """Returns the exact or nearest hourly forecast within 90 minutes."""
  if not available_times:
    raise MeteoException('No hourly weather forecast is available')

  try:
    return available_times.index(requested_time)
  except ValueError:
    try:
      requested = _parse_forecast_time(requested_time)
      parsed_times = [_parse_forecast_time(value) for value in available_times]
    except ValueError as exc:
      raise MeteoException('The weather service returned an invalid forecast time') from exc

  index = min(
      range(len(parsed_times)),
      key=lambda candidate: abs((parsed_times[candidate] - requested).total_seconds()),
  )
  difference_seconds = abs((parsed_times[index] - requested).total_seconds())
  if difference_seconds > 90 * 60:
    raise MeteoException(
        'Weather forecast unavailable for the selected departure time. '
        'Choose a time within the available forecast window.'
    )
  return index


def get_pressure_altitude(pressure, qnh=1013.25):
  """Uses the std atmosphere model to convert pressure in hPa to altitude in ft.

  Based on the NOAA/NWS pressure altitude formula:
  https://www.weather.gov/media/epz/wxcalc/pressureAltitude.pdf

  The formula is:
    ft = (1 - (P / QNH) ** 0.190284) * 145366.45

  Where:
    P = pressure in hPa
    QNH = current pressure at sea level in hPa
    0.190284 = atmospheric exponent (R * L / g), where:
               - R = specific gas constant for dry air
               - L = standard temperature lapse rate (0.0065 K/m)
               - g = standard gravitational acceleration
    145366.45 = scale height factor (T0 / L) converted to feet, where:
                - T0 = standard temperature at sea level (288.15 K)
                - L = standard temperature lapse rate (0.0065 K/m)
  """
  return (1 - (pressure / qnh) ** 0.190284) * 145366.45


def fetch_meteo(
    lat: float,
    lon: float,
    time: str,
    target_altitude: float,
) -> Meteo:
  """Fetches the weather conditions at a specific altitude.

  Args:
    lat: latitude of the location
    lon: longitude of the location
    time: time of the weather conditions in ISO format
    target_altitude: altitude in feet of the weather conditions

  Returns:
    meteo object with the wind speed and direction at the target altitude
  """

  # These are the pressure levels supported by ECMWF:
  pressure_altitudes = [1000, 925, 850, 700, 600]

  variables = ','.join(
      ['pressure_msl'] + [
          f'wind_speed_{p}hPa,wind_direction_{p}hPa' for p in pressure_altitudes
      ]
  ) 

  # DISCLAIMER: this is using model ECMWF, which is better than the default GFS
  # for Europe. If you are in a different location you should research
  # which model is best for you:
  # https://open-meteo.com/en/docs/ecmwf-api
  url = (
      f'https://api.open-meteo.com/v1/ecmwf?latitude={lat}&longitude={lon}&'
      f'current={variables}&'
      f'hourly={variables}&'
      'wind_speed_unit=kn&'
  )

  response = requests.get(url)
  if response.status_code != 200:
    raise MeteoException(response.content)

  # the response from this API contains an array with all hours, and then subsequent arrays
  # for the values of the requested variables, for each hour. In order to retrieve the
  # correct values, first we need to know the index of the requested hour.
  response_json = response.json()
  index = _find_forecast_time_index(response_json['hourly']['time'], time)

  # compute the pressure altitude of all the pressure levels to select the
  # closest to the target altitude.
  selected_level = min(
      ((p, get_pressure_altitude(
          pressure=p,
          # The standard atmospheric pressure at sea level is 1013.25 hPa
          # use that as default.
          qnh=response_json['hourly']['pressure_msl'][index] or 1013.25,
      )) for p in pressure_altitudes), key=lambda x: abs(x[1] - target_altitude)
  )[0]

  wind_speed_key = f'wind_speed_{selected_level}hPa'
  wind_direction_key = f'wind_direction_{selected_level}hPa'
  if (
      response_json['hourly'][wind_speed_key][index] is None or 
      response_json['hourly'][wind_direction_key][index] is None
  ):
    raise MeteoException('Wind speed or direction not available')

  return Meteo(
      wind_speed=response_json['hourly'][wind_speed_key][index],
      wind_direction=response_json['hourly'][wind_direction_key][index],
  )
