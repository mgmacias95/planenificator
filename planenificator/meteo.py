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
  
  wind_speed_10m: the wind speed in the surface. Useful for measuring conditions in the field.
  wind_direction_10m: the wind direction in the surface. Useful for measuring conditions in the field.
  wind_speed_975hPa: the wind speed at 975 hPa (around 1000 ft AGL). Useful for estimating ground speed.
  wind_direction_975hPa: the wind direction at 975 hPa. Useful for estimating drift.
  wind_speed_850hPa: the wind speed at 850 hPa (around 5000 ft AGL). Useful for estimating ground speed.
  wind_direction_850hPa: the wind direction at 850 hPa. Useful for estimating drift.
  """
  wind_speed_10m: float
  wind_direction_10m: float
  wind_speed_975hPa: float
  wind_direction_975hPa: float
  wind_speed_850hPa: float
  wind_direction_850hPa: float


def fetch_meteo(lat, lon, time):
  variables = ','.join([
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_speed_975hPa',
    'wind_direction_975hPa',
    'wind_speed_850hPa',
    'wind_direction_850hPa',
    'pressure_msl',
  ])

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
  # correct values, first we need to know the indes of the requested hour.
  response_json = response.json()
  index = response_json['hourly']['time'].index(time)

  return Meteo(
      wind_speed_10m=response_json['hourly']['wind_speed_10m'][index],
      wind_direction_10m=response_json['hourly']['wind_direction_10m'][index],
      wind_speed_975hPa=response_json['hourly']['wind_speed_975hPa'][index],
      wind_direction_975hPa=response_json['hourly']['wind_direction_975hPa'][index],
      wind_speed_850hPa=response_json['hourly']['wind_speed_850hPa'][index],
      wind_direction_850hPa=response_json['hourly']['wind_direction_850hPa'][index]
  )
