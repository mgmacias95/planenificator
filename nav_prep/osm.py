"""OpenStreet map functions."""

from geopy.geocoders import Nominatim

# OSM requires a unique user_agent string.
geolocator = Nominatim(user_agent="martas_navigation_prep")

class OSMException(Exception):
  """Defines an exception getting the landmark name."""


def get_osm_landmark(lat, lon):
  """
  Uses OpenStreetMap (Nominatim) to find the nearest airport or village name.
  """
  try:
    # Nominatim.reverse returns a location object with a raw dictionary
    location = geolocator.reverse((lat, lon), language='en', timeout=10)
    if not location:
      return f"Waypoint_{lat:.3f}_{lon:.3f}"

    address = location.raw.get('address', {})

    # Priority 1: Check for Airport tags
    if 'aeroway' in address:
      return address['aeroway']
    if 'airport' in address:
      return address['airport']

    # Priority 2: Check for Village/Town/Hamlet names
    # OSM uses various keys for small settlements
    for key in ['village', 'town', 'hamlet', 'suburb', 'city']:
      if key in address:
        return address[key]

    # Fallback: General address or coordinates
    return address.get('road', f"Point_{lat:.3f}_{lon:.3f}")

  except Exception as e:
    raise OSMException('Unknown location') from e
