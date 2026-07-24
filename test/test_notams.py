from unittest import mock
import pytest
from datetime import datetime

from planenificator.notams_spain import (
    fetch_notams_by_aerodromes,
    fetch_notams_by_route,
    is_time_overlap,
    check_route_conflicts,
    check_aerodrome_conflicts,
)


# Helper to get local epoch ms
def local_epoch(dt: datetime) -> int:
  return int(dt.timestamp() * 1000)


# Test fetch_notams_by_aerodromes
@mock.patch('planenificator.notams_spain.requests.get')
def test_fetch_notams_by_aerodromes_success(mock_get):
  mock_resp_layer0 = mock.Mock()
  mock_resp_layer0.status_code = 200
  mock_resp_layer0.json.return_value = {
      'features': [
          {
              'attributes': {
                  'notamId': 'V0001/26',
                  'itemA': 'LEMD',
                  'itemE': 'RWY 36R CLOSED',
              }
          }
      ]
  }

  mock_resp_layer1 = mock.Mock()
  mock_resp_layer1.status_code = 200
  mock_resp_layer1.json.return_value = {
      'features': [
          {
              'attributes': {
                  'notamId': 'V0002/26',
                  'itemA': 'LEMD',
                  'itemE': 'APRON WIP',
              }
          }
      ]
  }

  mock_get.side_effect = [mock_resp_layer0, mock_resp_layer1]

  res = fetch_notams_by_aerodromes(['LEMD'])
  assert len(res) == 2
  assert res[0]['notamId'] == 'V0001/26'
  assert res[0]['layer'] == 0
  assert res[1]['notamId'] == 'V0002/26'
  assert res[1]['layer'] == 1


def test_fetch_notams_by_aerodromes_empty():
  assert fetch_notams_by_aerodromes([]) == []
  assert fetch_notams_by_aerodromes(['', '   ']) == []


@mock.patch('planenificator.notams_spain.requests.get')
def test_fetch_notams_by_aerodromes_api_error(mock_get):
  mock_resp = mock.Mock()
  mock_resp.status_code = 200
  mock_resp.json.return_value = {'error': {'message': 'Invalid query'}}
  mock_get.return_value = mock_resp

  # Should handle error gracefully and return empty list
  assert fetch_notams_by_aerodromes(['LEMD']) == []


# Test fetch_notams_by_route
@mock.patch('planenificator.notams_spain.requests.get')
def test_fetch_notams_by_route_success(mock_get):
  mock_resp = mock.Mock()
  mock_resp.status_code = 200
  mock_resp.json.return_value = {
      'features': [
          {'attributes': {'notamId': 'V0003/26', 'areaSactaName': 'TRA 101'}}
      ]
  }
  mock_get.return_value = mock_resp

  coords = [(37.0, -5.0), (37.1, -5.1)]
  res = fetch_notams_by_route(coords)
  assert len(res) == 1
  assert res[0]['notamId'] == 'V0003/26'


def test_fetch_notams_by_route_invalid_coords():
  assert fetch_notams_by_route([]) == []
  assert fetch_notams_by_route([(37.0, -5.0)]) == []


# Test is_time_overlap
@pytest.mark.parametrize(
    'notam_start, notam_end, expected',
    [
        # NOTAM has no start/end date
        (None, None, True),
        # NOTAM is [10:00, 13:00] -> Overlaps flight [12:00, 14:00]
        (local_epoch(datetime(2026, 7, 22, 10, 0)), local_epoch(datetime(2026, 7, 22, 13, 0)), True),
        # NOTAM starts at 15:00 (starts after flight ends at 14:00)
        (local_epoch(datetime(2026, 7, 22, 15, 0)), None, False),
        # NOTAM ends at 10:00 (ends before flight starts at 12:00)
        (local_epoch(datetime(2026, 7, 22, 10, 0)), local_epoch(datetime(2026, 7, 22, 10, 0)), False),
    ]
)
def test_is_time_overlap(notam_start, notam_end, expected):
  start_time = datetime(2026, 7, 22, 12, 0)
  end_time = datetime(2026, 7, 22, 14, 0)
  assert is_time_overlap(notam_start, notam_end, start_time, end_time) is expected


# Test check_route_conflicts
def test_check_route_conflicts():
  start_time = datetime(2026, 7, 22, 12, 0)
  end_time = datetime(2026, 7, 22, 14, 0)

  t_10_00 = local_epoch(datetime(2026, 7, 22, 10, 0))
  t_13_00 = local_epoch(datetime(2026, 7, 22, 13, 0))
  t_15_00 = local_epoch(datetime(2026, 7, 22, 15, 0))
  t_16_00 = local_epoch(datetime(2026, 7, 22, 16, 0))

  notams = [
      # Inside time & altitude (SFC - 6000ft)
      {
          'notamId': 'V1',
          'itemB': t_10_00,
          'itemC': t_15_00,
          'LOWER_VAL': 0,
          'UPPER_VAL': 6000,
      },
      # Outside time
      {
          'notamId': 'V2',
          'itemB': t_15_00,
          'itemC': t_16_00,
          'LOWER_VAL': 0,
          'UPPER_VAL': 6000,
      },
      # Outside altitude (FL100 - FL150)
      {
          'notamId': 'V3',
          'itemB': t_10_00,
          'itemC': t_15_00,
          'LOWER_VAL': 10000,
          'UPPER_VAL': 15000,
      },
      # Undefined altitude (assumed overlap)
      {
          'notamId': 'V4',
          'itemB': t_10_00,
          'itemC': t_15_00,
          'LOWER_VAL': None,
          'UPPER_VAL': None,
      },
  ]

  conflicts = check_route_conflicts(
      notams, start_time, end_time, min_alt=2000, max_alt=5500
  )
  conflict_ids = [c['notamId'] for c in conflicts]

  assert 'V1' in conflict_ids
  assert 'V2' not in conflict_ids
  assert 'V3' not in conflict_ids
  assert 'V4' in conflict_ids


# Test check_aerodrome_conflicts
def test_check_aerodrome_conflicts():
  start_time = datetime(2026, 7, 22, 12, 0)
  end_time = datetime(2026, 7, 22, 14, 0)

  t_10_00 = local_epoch(datetime(2026, 7, 22, 10, 0))
  t_15_00 = local_epoch(datetime(2026, 7, 22, 15, 0))
  t_16_00 = local_epoch(datetime(2026, 7, 22, 16, 0))

  notams = [
      # Closed departure aerodrome during flight start
      {
          'notamId': 'V1',
          'itemA': 'LEBA',
          'itemB': t_10_00,
          'itemC': t_15_00,
          'itemE': 'AD CLOSED FOR VFR OPS',
      },
      # Limited destination aerodrome during flight end
      {
          'notamId': 'V2',
          'itemA': 'LEZL',
          'itemB': t_10_00,
          'itemC': t_15_00,
          'itemE': 'VOR U/S',
      },
      # NOTAM is outside time window for departure (flight starts at 12:00, NOTAM is after 15:00)
      {
          'notamId': 'V3',
          'itemA': 'LEBA',
          'itemB': t_15_00,
          'itemC': t_16_00,
          'itemE': 'AD CLOSED',
      },
  ]

  warnings = check_aerodrome_conflicts(
      notams,
      dep_ad='LEBA',
      dest_ad='LEZL',
      alts=['LEMO'],
      start_time=start_time,
      end_time=end_time,
  )

  assert len(warnings) == 2

  # Warning 1: V1, CLOSED, DEPARTURE
  assert warnings[0][0]['notamId'] == 'V1'
  assert warnings[0][1] == 'CLOSED'
  assert warnings[0][2] == 'DEPARTURE'

  # Warning 2: V2, LIMITED, ARRIVAL
  assert warnings[1][0]['notamId'] == 'V2'
  assert warnings[1][1] == 'LIMITED'
  assert warnings[1][2] == 'ARRIVAL'


@pytest.mark.parametrize(
    'flight_start, flight_end, expected',
    [
        # SAT 10:15 to 11:15 (overlaps SAT: 1030-1050)
        (datetime(2026, 7, 25, 10, 15), datetime(2026, 7, 25, 11, 15), True),
        # SAT 16:15 to 17:15 (no overlap on Saturday)
        (datetime(2026, 7, 25, 16, 15), datetime(2026, 7, 25, 17, 15), False),
        # SUN 15:50 to 16:20 (overlaps SUN: 1545-1605)
        (datetime(2026, 7, 26, 15, 50), datetime(2026, 7, 26, 16, 20), True),
        # MON 12:00 to 13:00 (no schedule for Monday)
        (datetime(2026, 7, 27, 12, 0), datetime(2026, 7, 27, 13, 0), False),
    ]
)
def test_is_time_overlap_with_schedule(flight_start, flight_end, expected):
  item_d = "TUE: 0940-1010/ 1035-1055 THU: 1200-1230/ 1250-1310 SAT: 0935-1005/ 1030-1050 SUN: 1455-1525/ 1545-1605"
  
  # Overall NOTAM date range: July 20 to July 30 (enclosing our flights)
  notam_start = local_epoch(datetime(2026, 7, 20, 0, 0))
  notam_end = local_epoch(datetime(2026, 7, 30, 23, 59))

  assert is_time_overlap(
      notam_start, notam_end, flight_start, flight_end, item_d
  ) is expected


@pytest.mark.parametrize(
    'flight_start, flight_end, expected_warnings_count',
    [
        # Saturday 15:00 (no Saturday closures in the afternoon) -> 0 warnings
        (datetime(2026, 7, 25, 15, 0), datetime(2026, 7, 25, 16, 0), 0),
        # Saturday 10:15 (overlaps SAT: 1030-1050 because of 1-hr departure buffer) -> 1 warning
        (datetime(2026, 7, 25, 10, 15), datetime(2026, 7, 25, 11, 15), 1),
        # Sunday 10:00 (no Sunday morning closures) -> 0 warnings
        (datetime(2026, 7, 26, 10, 0), datetime(2026, 7, 26, 11, 0), 0),
        # Sunday 15:00 (overlaps SUN: 1455-1525 and 1545-1605) -> 1 warning
        (datetime(2026, 7, 26, 15, 0), datetime(2026, 7, 26, 16, 0), 1),
        # Monday 12:00 (no Monday closures scheduled) -> 0 warnings
        (datetime(2026, 7, 27, 12, 0), datetime(2026, 7, 27, 13, 0), 0),
    ]
)
def test_check_aerodrome_conflicts_fallback_schedule(flight_start, flight_end, expected_warnings_count):
  t_20_jul = local_epoch(datetime(2026, 7, 20, 0, 0))
  t_30_jul = local_epoch(datetime(2026, 7, 30, 23, 59))

  notams = [
      {
          'notamId': 'V31704/26',
          'itemA': 'LEBA',
          'itemB': t_20_jul,
          'itemC': t_30_jul,
          'itemD': None,  # Empty schedule field!
          # Description contains the schedule text:
          'itemE': 'AERODROME CLOSED VFR OPS, EXC OPERATIONAL TFC: TUE: 0940-1010/ 1035-1055 SAT: 0935-1005/ 1030-1050 SUN: 1455-1525/ 1545-1605',
      }
  ]

  warnings = check_aerodrome_conflicts(
      notams, dep_ad='LEBA', dest_ad='LEBA', alts=[], start_time=flight_start, end_time=flight_end
  )
  assert len(warnings) == expected_warnings_count
  if expected_warnings_count > 0:
    assert warnings[0][0]['notamId'] == 'V31704/26'
    assert warnings[0][1] == 'CLOSED'
