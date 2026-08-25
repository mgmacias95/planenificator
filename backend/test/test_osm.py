from planenificator import osm


def test_get_osm_landmark_offline():
  result = osm.get_osm_landmark(37.1234, -5.5678)
  assert result == 'Waypoint_37.123_-5.568'

