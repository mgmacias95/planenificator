from planenificator import helpers
import pytest


@pytest.mark.parametrize(
    (
        'course', 
        'altitude', 
        'expected_valid'
    ),
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
    ]
)
def test_check_semi_circular_rule(course, altitude, expected_valid):
  assert helpers.check_semi_circular_rule(course, altitude) == expected_valid
