import argparse
import datetime
import logging
from planenificator import planenificator
from tabulate import tabulate


if __name__ == "__main__":
  logging.basicConfig(level=logging.INFO)
  logging.getLogger('urllib3').setLevel(logging.INFO)
  logging.getLogger('geopy').setLevel(logging.INFO)

  parser = argparse.ArgumentParser(
      description='Generate plane route navigation report.'
  )
  parser.add_argument(
      '--kml', default='test/test_data/route.kml', help='KML route file'
  )
  parser.add_argument(
      '--initial-alt', type=int, default=2500, help='Initial altitude (usually departure altitude indicated on the VFR chart)'
  )
  parser.add_argument(
      '--arrival-alt', type=int, default=2000, help='Arrival altitude (usually indicated on the VFR chart)'
  )
  parser.add_argument(
      '--cruise-alt', type=int, default=5500, help='Cruise altitude in feet'
  )
  parser.add_argument(
      '--tas', type=int, default=80, help='True airspeed in knots'
  )
  parser.add_argument(
      '--vy', type=int, default=70, help='Best rate of climb (v_y) speed in knots'
  )
  parser.add_argument(
      '--rate-of-climb', type=int, default=700, help='Rate of climb in feet per minute (available in the aircraft\'s POH)'
  )
  parser.add_argument(
      '--rate-of-descent', type=int, default=500, help='Rate of descent in feet per minute.'
  )
  date_format = '%Y-%m-%d %H:%M'
  parser.add_argument(
      '--datetime', type=lambda s: datetime.datetime.strptime(s, date_format),
      default=datetime.datetime.now().strftime(date_format),
      help=f'Date of the flight in format {date_format}'
  )

  args = parser.parse_args()

  table = planenificator.generate_navigation_report(
      input_kml=args.kml,
      initial_alt=args.initial_alt,
      arrival_alt=args.arrival_alt,
      cruise_alt=args.cruise_alt,
      tas=args.tas,
      vy=args.vy,
      rate_of_climb=args.rate_of_climb,
      rate_of_descent=args.rate_of_descent,
      flight_start_date=args.datetime,
  )
  print(tabulate(table, headers="firstrow", tablefmt="grid"))
