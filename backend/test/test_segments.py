import datetime
import pytest
from unittest import mock
from planenificator import meteo
from planenificator import segments


@mock.patch('planenificator.meteo.fetch_meteo', return_value=meteo.Meteo(0, 0))
@mock.patch('planenificator.notams_spain.fetch_notams_by_route', return_value=[])
@mock.patch('planenificator.notams_spain.fetch_notams_by_aerodromes', return_value=[])
@mock.patch('time.sleep', return_value=None)
def test_segmented_route(*_):
  table, _ = segments.generate_multi_segment_navigation_report(
      kmls=['test/test_data/ruta_5500.kml', 'test/test_data/ruta_3500.kml'],
      cruise_alts=[5500, 3500],
      initial_alt=2500,
      arrival_alt=2000,
      tas=100,
      vy=80,
      rate_of_climb=500,
      rate_of_descent=500,
      flight_start_date=datetime.datetime.now(),
      dep_aerodrome='LEBA',
      dest_aerodrome='LEBA',
      alt_aerodromes=['LEDE']
  )

  # assert altitude is correctly set between the two segments
  # point 1 is the first point in the route
  assert table[1][4] == 2500
  # point 4 is the latest point in the first segment
  assert table[4][4] == 3500   
  # point 5 is the first point in the second segment
  assert table[5][4] == 3500
  # point 8 is the latest point in the route
  assert table[8][4] == 2000


def test_mismatched_lengths():
  with pytest.raises(ValueError, match="must match the number of cruise altitudes"):
    segments.generate_multi_segment_navigation_report(
        kmls=['seg1.kml'],
        cruise_alts=[5500, 7500],
    )
