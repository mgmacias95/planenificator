import tempfile
from planenificator import kml_parser


def test_parse_kml():
  points, names = kml_parser.parse_kml_route('test/test_data/ruta_placemarks.kml')

  assert points == [
      (37.8059735691895, -5.023993575001656),
      (37.80374568471285, -5.107951841782366),
      (37.83360752314795, -5.251437880961358),
      (38.07614041834963, -5.015239144843968),
      (38.06486881587754, -4.684806059526866),
      (38.0177981718432, -4.378900661674635),
      (37.8956975101375, -4.376691442040385),
      (37.68114335051913, -4.5549261132205),
      (37.94762103723209, -4.568426312129827),
  ]
  assert names == [
      'Castillo Almodovar',
      'Posadas',
      'Hornachuelos',
      'Villaviciosa de Cordoba',
      'Embalse del Guadalmellato',
      'Montoro',
      'Bujalance',
      'Espejo',
      'Villafranca de Cordoba',
  ]
