import datetime
import pytest
from unittest import mock
from planenificator import meteo
from planenificator import segments


@pytest.mark.parametrize('cruise_alts,initial,final', [
    ([5500, 3500], 2500, 2000),
    ([2500, 5500], 300, 1000),
])
@mock.patch('planenificator.meteo.fetch_meteo', return_value=meteo.Meteo(0, 0))
@mock.patch('planenificator.notams_spain.fetch_notams_by_route', return_value=[])
@mock.patch('planenificator.notams_spain.fetch_notams_by_aerodromes', return_value=[])
def test_segmented_route(m1, m2, m3, cruise_alts, initial, final):
  table, _ = segments.generate_multi_segment_navigation_report(
      kmls=['test/test_data/ruta_5500.kml', 'test/test_data/ruta_3500.kml'],
      cruise_alts=cruise_alts,
      initial_alt=initial,
      arrival_alt=final,
      ias=100,
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
  assert table[1][4] == initial

  # assert each row of the first segment contains the first altitude
  for row in table[2:6]:
    assert row[4] == cruise_alts[0], (
        f'row {row} does not have the expected altitude of {cruise_alts[0]}'
    )
  
  # assert each row of the second segment contains the second altitude
  for row in table[6:-2]:
    assert row[4] == cruise_alts[1], (
        f'row {row} does not have the expected altitude of {cruise_alts[1]}'
    )

  # last row in the table is is the latest point in the route
  assert table[-2][4] == final


def test_mismatched_lengths():
  with pytest.raises(ValueError, match="must match the number of cruise altitudes"):
    segments.generate_multi_segment_navigation_report(
        kmls=['seg1.kml'],
        cruise_alts=[5500, 7500],
    )
