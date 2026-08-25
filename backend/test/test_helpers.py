from planenificator import helpers
import pytest


@pytest.mark.parametrize(
    ('course', 'altitude', 'expected_valid'),
    [
        # 0 degress must be Odd, so it must be 4500 not 3500
        (0, 3500, False),
        # 180 degress is Odd, so 3500 is correct
        (180, 3500, True),
        # Even though 90 degrees is Odd, 3200 is not a valid altitude
        # since it must IFR + 500.
        (90, 3200, False),
        # 269 degrees is Odd, 3000 is not valid altitude since it must be
        # IFR + 500.
        (269, 3000, False),
        (0, 4500, True),
        (90, 3500, True),
        (89, 4500, True),
        (270, 4500, True),
        # below 3000 the rule does not apply
        (180, 2500, True),
        (270, 2500, True),
        (0, 2500, True),
        (90, 2500, True),
    ],
)
def test_check_semi_circular_rule(course, altitude, expected_valid):
  assert helpers.check_semi_circular_rule(course, altitude) == expected_valid


@pytest.mark.parametrize(
    ('lat1', 'lon1', 'lat2', 'lon2', 'expected_bearing'),
    [
        (0, 0, 0, 1, 90.0),
        (0, 0, 1, 0, 0.0),
        (0, 0, -1, 0, 180.0),
        (0, 0, 0, -1, 270.0),
    ],
)
def test_calculate_bearing(lat1, lon1, lat2, lon2, expected_bearing):
  assert helpers.calculate_bearing(lat1, lon1, lat2, lon2) == pytest.approx(
      expected_bearing
  )


@pytest.mark.parametrize(
    (
        'tas',
        'wind_speed',
        'wind_direction',
        'true_course',
        'expected_gs',
        'expected_hdg',
    ),
    [
        (100.0, 0.0, 0.0, 90.0, 100.0, 90.0),
        (100.0, 20.0, 90.0, 90.0, 80.0, 90.0),
        (100.0, 20.0, 270.0, 90.0, 120.0, 90.0),
        (100.0, 20.0, 90.0, 0.0, 97.979589, 11.536959),
    ],
)
def test_calculate_ground_speed_and_heading(
    tas, wind_speed, wind_direction, true_course, expected_gs, expected_hdg
):
  gs, hdg = helpers.calculate_ground_speed_and_heading(
      tas=tas,
      wind_speed=wind_speed,
      wind_direction=wind_direction,
      true_course=true_course,
  )
  assert gs == pytest.approx(expected_gs, abs=1e-5)
  assert hdg == pytest.approx(expected_hdg, abs=1e-5)


@pytest.mark.parametrize(
    ('distance_nm', 'ground_speed', 'expected_ete'),
    [
        (60.0, 120.0, 30.0),
        (10.0, 100.0, 6.0),
    ],
)
def test_calculate_leg_ete(distance_nm, ground_speed, expected_ete):
  assert helpers.calculate_leg_ete(distance_nm, ground_speed) == pytest.approx(
      expected_ete
  )


@pytest.mark.parametrize(
    ('initial_alt', 'cruise_alt', 'rate', 'expected_time'),
    [
        (0, 5000, 500, 10.0),
        (5000, 2000, -500, 6.0),
    ],
)
def test_calculate_top_time(initial_alt, cruise_alt, rate, expected_time):
  assert helpers.calculate_top_time(initial_alt, cruise_alt, rate) == pytest.approx(
      expected_time
  )
