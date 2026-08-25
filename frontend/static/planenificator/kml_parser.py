"""Parses KML files.

KML files are polygon files expored from Google Earth.
"""

import xml.etree.ElementTree as ET


def parse_kml_polygon(file_path):
  tree = ET.parse(file_path)
  root = tree.getroot()
  namespace = {'ns': 'http://www.opengis.net/kml/2.2'}
  coords_list = []

  for coords in root.findall('.//ns:coordinates', namespace):
    points = coords.text.strip().split()
    for p in points:
      parts = p.split(',')
      if len(parts) >= 2:
        coords_list.append((float(parts[1]), float(parts[0])))
  return coords_list
