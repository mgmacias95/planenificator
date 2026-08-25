import argparse
import datetime
import logging
from planenificator import (
    generate_multi_segment_navigation_report,
    print_notams,
)
from tabulate import tabulate


def main():
  logging.basicConfig(level=logging.INFO)
  logging.getLogger('urllib3').setLevel(logging.INFO)
  logging.getLogger('geopy').setLevel(logging.INFO)

  parser = argparse.ArgumentParser(description='Generate plane route navigation report.')
  parser.add_argument('--kmls', nargs='+', default=['test/test_data/route.kml'], help='KML route files')
  parser.add_argument('--initial-alt', type=int, default=2500, help='Initial altitude in feet')
  parser.add_argument('--arrival-alt', type=int, default=2000, help='Arrival altitude in feet')
  parser.add_argument('--cruise-alts', type=int, nargs='+', default=[5500], help='Cruise altitudes in feet')
  parser.add_argument('--tas', type=int, default=80, help='True airspeed in knots')
  parser.add_argument('--vy', type=int, default=70, help='Best rate of climb speed in knots')
  parser.add_argument('--rate-of-climb', type=int, default=700, help='Rate of climb in feet per minute')
  parser.add_argument('--rate-of-descent', type=int, default=500, help='Rate of descent in feet per minute')

  date_format = '%Y-%m-%d %H:%M'
  parser.add_argument(
      '--datetime', type=lambda s: datetime.datetime.strptime(s, date_format),
      default=datetime.datetime.now().strftime(date_format),
      help=f'Date of flight in format {date_format.replace("%", "%%")}'
  )
  parser.add_argument('--dep', type=str, default='LEBA', help='Departure aerodrome ICAO code')
  parser.add_argument('--dest', type=str, default='LEBA', help='Destination aerodrome ICAO code')
  parser.add_argument('--alt', type=str, default='LEDE', help='Comma-separated alternate aerodrome ICAO codes')

  args = parser.parse_args()
  alt_aerodromes = [a.strip() for a in args.alt.split(',')] if args.alt else []

  table, notams_data = generate_multi_segment_navigation_report(
      kmls=args.kmls,
      cruise_alts=args.cruise_alts,
      initial_alt=args.initial_alt,
      arrival_alt=args.arrival_alt,
      tas=args.tas,
      vy=args.vy,
      rate_of_climb=args.rate_of_climb,
      rate_of_descent=args.rate_of_descent,
      flight_start_date=args.datetime,
      dep_aerodrome=args.dep,
      dest_aerodrome=args.dest,
      alt_aerodromes=alt_aerodromes,
  )

  print(tabulate(table, headers='firstrow', tablefmt='grid'))
  print_notams(notams_data)


if __name__ == "__main__":
  main()
