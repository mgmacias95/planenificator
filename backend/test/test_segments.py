import datetime
import pytest
from unittest import mock
from planenificator import meteo
from planenificator import segments


@mock.patch('planenificator.osm.get_osm_landmark', side_effect=[
    'Almodóvar del Río', 'Hornachuelos', 'Villaviciosa de Córdoba',
    'Adamuz', 'Adamuz', 'Montoro', 'Bujalance', 'Espejo', 'Villafranca de Córdoba'
])
@mock.patch('planenificator.meteo.fetch_meteo', return_value=meteo.Meteo(0, 0))
@mock.patch('planenificator.notams_spain.fetch_notams_by_route', return_value=[])
@mock.patch('planenificator.notams_spain.fetch_notams_by_aerodromes', return_value=[])
def test_segmented_route(*_):
  table, _, distance, time = segments.generate_multi_segment_navigation_report(
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

  assert table == []


def test_mismatched_lengths():
  with pytest.raises(ValueError, match="must match the number of cruise altitudes"):
    segments.generate_multi_segment_navigation_report(
        kmls=['seg1.kml'],
        cruise_alts=[5500, 7500],
    )
