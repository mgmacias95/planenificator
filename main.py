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
      '--initial-alt', type=int, default=2500, 
      help='Initial altitude (usually departure altitude indicated on the VFR chart)'
  )
  parser.add_argument(
      '--arrival-alt', type=int, default=2000, 
      help='Arrival altitude (usually indicated on the VFR chart)'
  )
  parser.add_argument(
      '--cruise-alt', type=int, default=5500, help='Cruise altitude in feet'
  )
  parser.add_argument(
      '--tas', type=int, default=80, help='True airspeed in knots'
  )
  parser.add_argument(
      '--vy', type=int, default=70, 
      help='Best rate of climb (v_y) speed in knots'
  )
  parser.add_argument(
      '--rate-of-climb', type=int, default=700, 
      help='Rate of climb in feet per minute (available in the aircraft\'s POH)'
  )
  parser.add_argument(
      '--rate-of-descent', type=int, default=500, 
      help='Rate of descent in feet per minute.'
  )
  date_format = '%Y-%m-%d %H:%M'
  parser.add_argument(
      '--datetime', type=lambda s: datetime.datetime.strptime(s, date_format),
      default=datetime.datetime.now().strftime(date_format),
      help=f'Date of the flight in format {date_format.replace("%", "%%")}'
  )
  parser.add_argument(
      '--dep', type=str, default='LEBA', 
      help='Departure aerodrome ICAO code (e.g. LECU)'
  )
  parser.add_argument(
      '--dest', type=str, default='LEBA', 
      help='Destination aerodrome ICAO code (e.g. LEMD)'
  )
  parser.add_argument(
      '--alt', type=str, default='LEDE', 
      help='Comma-separated alternate aerodrome ICAO codes (e.g. LETO,LEVS)'
  )

  args = parser.parse_args()
  alt_aerodromes = [a.strip() for a in args.alt.split(',')] if args.alt else []

  table, notam_data = planenificator.generate_navigation_report(
      input_kml=args.kml,
      initial_alt=args.initial_alt,
      arrival_alt=args.arrival_alt,
      cruise_alt=args.cruise_alt,
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

  # Print NOTAM Warnings
  route_conflicts = notam_data['route_conflicts']
  aerodrome_conflicts = notam_data['aerodrome_conflicts']
  
  if route_conflicts or aerodrome_conflicts:
      print('\n' + '\033[91m' + '='*20 + ' NOTAM SECURITY NOTICE ' + '='*20 + '\033[0m')
      
      for conflict in route_conflicts:
          print(f'\n\033[91m[WARNING] EN ROUTE CONFLICT WITH NOTAM {conflict.get('notamId')} ({conflict.get('areaSactaName') or 'AREA'})\033[0m')
          print(f'  Limits: FL{conflict.get('LOWER_VAL')} - FL{conflict.get('UPPER_VAL')}')
          print(f'  Text: {conflict.get('itemE')}')
          
      for conflict, warn_type, role in aerodrome_conflicts:
          print(f'\n\033[91m[WARNING] {role} AERODROME ({conflict.get('itemA')}) CONFLICT WITH NOTAM {conflict.get('notamId')}\033[0m')
          print(f'  Text: {conflict.get('itemE')}')
          
      print('\033[91m' + '=' * 76 + '\033[0m')
      
  # Print all fetched NOTAMs for reference
  all_ad_notams = notam_data['all_aerodrome_notams']
  all_route_notams = notam_data['all_route_notams']
  
  if all_ad_notams or all_route_notams:
      print("\n" + "="*20 + " DETAILED NOTAMS FOUND " + "="*20)
      
      if all_ad_notams:
          print(f"\n--- AERODROME NOTAMS ({len(all_ad_notams)}) ---")
          for notam in all_ad_notams:
              print(f"- {notam.get('notamId')} ({notam.get('itemA')}): {notam.get('itemE')[:180]}...")
              
      if all_route_notams:
          print(f"\n--- EN ROUTE NOTAMS ({len(all_route_notams)}) ---")
          for notam in all_route_notams:
              print(f"- {notam.get('notamId')} ({notam.get('areaSactaName') or 'AREA'}): {notam.get('itemE')[:180]}...")
      print("=" * 81)

