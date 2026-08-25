"""OpenStreetMap and landmark resolution functions."""

import logging


class OSMException(Exception):
  """Defines an exception getting the landmark name."""


def get_osm_landmark(lat: float, lon: float) -> str:
  """
  Provides a fallback waypoint name from coordinates without external network requests.
  """
  return f"Waypoint_{lat:.3f}_{lon:.3f}"

