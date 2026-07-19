from unittest import mock
import pytest
from planenificator import osm


def test_get_osm_landmark_airport():
  mock_location = mock.Mock()
  mock_location.raw = {'address': {'airport': 'Jerez Airport'}}
  with mock.patch.object(osm.geolocator, 'reverse', return_value=mock_location):
    result = osm.get_osm_landmark(36.744, -6.060)
    assert result == 'Jerez Airport'


@pytest.mark.parametrize(
    ('key', 'value'),
    [
        ('village', 'Albaida del Aljarafe'),
        ('town', 'Sanlucar la Mayor'),
        ('hamlet', 'El Rocío'),
        ('suburb', 'Triana'),
        ('city', 'Seville'),
        ('tourism', 'Castillo de Almodóvar del Río')
    ],
)
def test_get_osm_landmark_settlement(key, value):
  mock_location = mock.Mock()
  mock_location.raw = {'address': {key: value}}
  with mock.patch.object(osm.geolocator, 'reverse', return_value=mock_location):
    result = osm.get_osm_landmark(37.0, -5.0)
    assert result == value


def test_get_osm_landmark_settlement_priority():
  # village is checked before town, etc.
  # Order is: village, town, hamlet, suburb, city
  mock_location = mock.Mock()
  mock_location.raw = {
      'address': {
          'city': 'Seville',
          'town': 'Sanlucar',
          'village': 'Albaida',
      }
  }
  with mock.patch.object(osm.geolocator, 'reverse', return_value=mock_location):
    result = osm.get_osm_landmark(37.0, -5.0)
    assert result == 'Albaida'


def test_get_osm_landmark_fallback_road():
  mock_location = mock.Mock()
  mock_location.raw = {'address': {'road': 'Autovía del Sur'}}
  with mock.patch.object(osm.geolocator, 'reverse', return_value=mock_location):
    result = osm.get_osm_landmark(37.0, -5.0)
    assert result == 'Autovía del Sur'


def test_get_osm_landmark_fallback_coords():
  mock_location = mock.Mock()
  mock_location.raw = {'address': {}}
  with mock.patch.object(osm.geolocator, 'reverse', return_value=mock_location):
    result = osm.get_osm_landmark(37.1234, -5.5678)
    assert result == 'Point_37.123_-5.568'


def test_get_osm_landmark_no_location():
  with mock.patch.object(osm.geolocator, 'reverse', return_value=None):
    result = osm.get_osm_landmark(37.1234, -5.5678)
    assert result == 'Waypoint_37.123_-5.568'


def test_get_osm_landmark_exception():
  with mock.patch.object(
      osm.geolocator, 'reverse', side_effect=Exception('Nominatim timeout')
  ):
    with pytest.raises(osm.OSMException) as excinfo:
      osm.get_osm_landmark(37.0, -5.0)
    assert str(excinfo.value) == 'Unknown location'
