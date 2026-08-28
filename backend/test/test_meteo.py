from unittest import mock
import pytest

from planenificator.meteo import (
    get_pressure_altitude,
    fetch_meteo,
    Meteo,
    MeteoException,
)


def test_get_pressure_altitude_sea_level():
  """Test that standard sea level pressure gives 0 altitude."""
  assert get_pressure_altitude(1013.25) == pytest.approx(0.0)


def test_get_pressure_altitude_non_standard_qnh():
  """Test that when pressure equals QNH, altitude is 0."""
  assert get_pressure_altitude(1020, qnh=1020) == pytest.approx(0.0)


def test_get_pressure_altitude_850hpa():
  """Test altitude calculation for 850 hPa."""
  expected = (1 - (850 / 1013.25) ** 0.190284) * 145366.45
  assert get_pressure_altitude(850) == pytest.approx(expected)


@mock.patch('planenificator.meteo.requests.get')
def test_fetch_meteo_success(mock_get):
  """Test successful fetching and parsing of meteo data."""
  mock_response = mock.Mock()
  mock_response.status_code = 200
  mock_response.json.return_value = {
      'hourly': {
          'time': ['2026-07-19T20:00', '2026-07-19T21:00'],
          'pressure_msl': [1013.25, 1013.25],
          'wind_speed_1000hPa': [10.0, 12.0],
          'wind_direction_1000hPa': [180.0, 190.0],
          'wind_speed_925hPa': [15.0, 17.0],
          'wind_direction_925hPa': [200.0, 210.0],
          'wind_speed_850hPa': [20.0, 22.0],
          'wind_direction_850hPa': [220.0, 230.0],
          'wind_speed_700hPa': [25.0, 27.0],
          'wind_direction_700hPa': [240.0, 250.0],
          'wind_speed_600hPa': [30.0, 32.0],
          'wind_direction_600hPa': [260.0, 270.0],
      }
  }
  mock_get.return_value = mock_response

  # Request altitude 5000 ft, which is closest to 850 hPa (~4781 ft)
  # The selected level should be 850. Time index is 0.
  meteo = fetch_meteo(
      lat=37.0, lon=-5.0, time='2026-07-19T20:00', target_altitude=5000.0
  )

  assert isinstance(meteo, Meteo)
  assert meteo.wind_speed == 20.0
  assert meteo.wind_direction == 220.0


@mock.patch('planenificator.meteo.requests.get')
def test_fetch_meteo_http_error(mock_get):
  """Test behavior when the HTTP request fails."""
  mock_response = mock.Mock()
  mock_response.status_code = 404
  mock_response.content = b'Not Found'
  mock_get.return_value = mock_response

  with pytest.raises(MeteoException):
    fetch_meteo(lat=37.0, lon=-5.0, time='2026-07-19T20:00', target_altitude=5000.0)


@mock.patch('planenificator.meteo.requests.get')
def test_fetch_meteo_missing_data(mock_get):
  """Test behavior when the API returns None for the requested wind data."""
  mock_response = mock.Mock()
  mock_response.status_code = 200
  mock_response.json.return_value = {
      'hourly': {
          'time': ['2026-07-19T20:00'],
          'pressure_msl': [1013.25],
          'wind_speed_1000hPa': [None],
          'wind_direction_1000hPa': [None],
          'wind_speed_925hPa': [None],
          'wind_direction_925hPa': [None],
          'wind_speed_850hPa': [None],
          'wind_direction_850hPa': [None],
          'wind_speed_700hPa': [None],
          'wind_direction_700hPa': [None],
          'wind_speed_600hPa': [None],
          'wind_direction_600hPa': [None],
      }
  }
  mock_get.return_value = mock_response

  with pytest.raises(MeteoException, match='Wind speed or direction not available'):
    fetch_meteo(lat=37.0, lon=-5.0, time='2026-07-19T20:00', target_altitude=5000.0)
