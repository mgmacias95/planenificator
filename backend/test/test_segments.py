import datetime
from unittest.mock import patch
import pytest
from planenificator.segments import generate_multi_segment_navigation_report


class DummyMeteo:
  def __init__(self, wind_speed=10.0, wind_direction=180.0):
    self.wind_speed = wind_speed
    self.wind_direction = wind_direction


@pytest.fixture
def mock_external_services():
  mock_coords_1 = [(40.0, -3.0), (40.0, -2.5), (40.0, -2.0)]
  mock_coords_2 = [(40.0, -2.0), (40.0, -1.5), (40.0, -1.0)]

  def fake_parse_kml(kml_path):
    if 'seg1' in kml_path or 'route1' in kml_path:
      return mock_coords_1
    elif 'seg2' in kml_path or 'route2' in kml_path:
      return mock_coords_2
    return mock_coords_1

  with patch('planenificator.meteo.fetch_meteo', return_value=DummyMeteo()), \
       patch('planenificator.notams_spain.fetch_notams_by_route', return_value=[]), \
       patch('planenificator.notams_spain.fetch_notams_by_aerodromes', return_value=[]), \
       patch('planenificator.osm.get_osm_landmark', side_effect=lambda lat, lon: f'WP_{lat}_{lon}'), \
       patch('planenificator.kml_parser.parse_kml_polygon', side_effect=fake_parse_kml):
    yield


def test_single_segment(mock_external_services):
  kmls = ['seg1.kml']
  cruise_alts = [5500]

  table, notam_data = generate_multi_segment_navigation_report(
      kmls=kmls,
      cruise_alts=cruise_alts,
      initial_alt=2500,
      arrival_alt=2000,
      tas=100,
      vy=80,
      rate_of_climb=500,
      rate_of_descent=500,
      flight_start_date=datetime.datetime(2026, 8, 2, 10, 0),
  )

  # Header + 2 legs + Total row = 4 rows
  assert len(table) == 4
  assert table[0][0] == 'Waypoint'
  assert table[-1][0] == 'Total'
  assert isinstance(table[-1][7], float)  # total dist
  assert isinstance(table[-1][8], float)  # total time


def test_multi_segment(mock_external_services):
  kmls = ['seg1.kml', 'seg2.kml']
  cruise_alts = [5500, 7500]

  table, notam_data = generate_multi_segment_navigation_report(
      kmls=kmls,
      cruise_alts=cruise_alts,
      initial_alt=2500,
      arrival_alt=2000,
      tas=100,
      vy=80,
      rate_of_climb=500,
      rate_of_descent=500,
      flight_start_date=datetime.datetime(2026, 8, 2, 10, 0),
  )

  # Header + 2 legs (seg1) + 2 legs (seg2) + Total row = 6 rows
  assert len(table) == 6
  assert table[0][0] == 'Waypoint'
  assert table[-1][0] == 'Total'
  # Check altitude transition for segment 2
  assert any(row[4] == 7500 for row in table[1:-1])


def test_mismatched_lengths():
  with pytest.raises(ValueError, match="must match the number of cruise altitudes"):
    generate_multi_segment_navigation_report(
        kmls=['seg1.kml'],
        cruise_alts=[5500, 7500],
    )
