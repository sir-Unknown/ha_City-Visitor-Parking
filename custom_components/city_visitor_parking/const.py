"""Constants for the City visitor parking integration."""

from __future__ import annotations

from datetime import timedelta
from typing import Final

from homeassistant.const import Platform

DOMAIN: Final = "city_visitor_parking"

PLATFORMS: Final[list[Platform]] = [Platform.SENSOR]

CONF_DEMO_MODE: Final = "demo"
CONF_PROVIDER_ID: Final = "provider_id"
CONF_MUNICIPALITY: Final = "municipality_name"
CONF_BASE_URL: Final = "base_url"
CONF_API_URL: Final = "api_url"
CONF_GUI_URL: Final = "gui_url"
CONF_PERMIT_ID: Final = "permit_id"
CONF_DESCRIPTION: Final = "description"

CONF_OPERATING_TIME_OVERRIDES: Final = "operating_time_overrides"
CONF_AUTO_END: Final = "auto_end_reservation_when_free"
CONF_FREE_DATES: Final = "free_dates"
CONF_FREE_WEEKDAYS: Final = "free_weekdays"

ATTR_LICENSE_PLATE: Final = "license_plate"
ATTR_NAME: Final = "name"
ATTR_RESERVATION_ID: Final = "reservation_id"
ATTR_FAVORITE_ID: Final = "favorite_id"
ATTR_START_TIME: Final = "start_time"
ATTR_END_TIME: Final = "end_time"

STATE_CHARGEABLE: Final = "chargeable"
STATE_FREE: Final = "free"

DEFAULT_UPDATE_INTERVAL: Final = timedelta(minutes=5)
"""Polling interval used when a reservation is active or a zone transition is imminent.

This keeps HA responsive for the most time-sensitive situations: tracking an active
reservation, reacting to auto-end logic, and reflecting a zone state change promptly
after it occurs.
"""

IDLE_UPDATE_INTERVAL: Final = timedelta(minutes=30)
"""Polling interval used when there is nothing urgent to track.

Applied when no reservation is active, the zone is currently free, and no transition
is expected within TRANSITION_LOOKAHEAD. Reduces API calls by up to ~83 % compared
to polling at DEFAULT_UPDATE_INTERVAL continuously.
"""

TRANSITION_LOOKAHEAD: Final = timedelta(minutes=30)
"""How far ahead of a known zone transition to switch back to DEFAULT_UPDATE_INTERVAL.

When a transition is this close, the coordinator starts polling at the default (fast)
rate so that the zone state change is reflected in HA shortly after it occurs.
"""

TRANSITION_BUFFER: Final = timedelta(minutes=2)
"""Lead time subtracted when scheduling a precise update before a zone transition.

When the next zone change is known and further away than TRANSITION_LOOKAHEAD, the
coordinator schedules the next update to arrive this much *before* the transition
rather than landing exactly on it.  A small buffer compensates for scheduling jitter
and ensures the poll happens before — not after — the transition moment.
"""

AUTO_END_COOLDOWN: Final = timedelta(minutes=10)

WEEKDAY_KEYS: Final[list[str]] = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
]
