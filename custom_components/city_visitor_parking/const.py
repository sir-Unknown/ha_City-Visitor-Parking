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
CONF_DEFAULT_PARKING_AREA: Final = "default_parking_area"

ATTR_LICENSE_PLATE: Final = "license_plate"
ATTR_NAME: Final = "name"
ATTR_RESERVATION_ID: Final = "reservation_id"
ATTR_FAVORITE_ID: Final = "favorite_id"
ATTR_START_TIME: Final = "start_time"
ATTR_END_TIME: Final = "end_time"
ATTR_PARKING_AREA_ID: Final = "parking_area_id"

STATE_PAID: Final = "paid"
STATE_FREE: Final = "free"

ERROR_CODE_PROVIDER_REJECTED: Final = "provider_rejected"
"""Library error code: the provider processed the request and refused it.

The session worked, so this never warrants a re-login.
"""

DEFAULT_UPDATE_INTERVAL: Final = timedelta(minutes=5)
"""Polling interval while a reservation is active or paid parking is changing soon.

This keeps HA responsive for the most time-sensitive situations: tracking an active
reservation, reacting to auto-end logic, and reflecting a paid parking change
promptly after it occurs.
"""

IDLE_UPDATE_INTERVAL: Final = timedelta(minutes=30)
"""Polling interval used when there is nothing urgent to track.

Applied when no reservation is active, parking is currently free, and no
transition is expected within TRANSITION_LOOKAHEAD. Reduces API calls by up to ~83 %
compared to polling at DEFAULT_UPDATE_INTERVAL continuously.
"""

TRANSITION_LOOKAHEAD: Final = timedelta(minutes=30)
"""How far ahead of a known paid parking change to poll at the default rate again.

When a transition is this close, the coordinator starts polling at the default (fast)
rate so that the paid parking change is reflected in HA shortly after it occurs.
"""

TRANSITION_BUFFER: Final = timedelta(minutes=2)
"""Lead time subtracted when scheduling an update before a paid parking change.

When the next paid parking change is known and further away than TRANSITION_LOOKAHEAD,
the coordinator schedules the next update to arrive this much *before* the transition
rather than landing exactly on it.  A small buffer compensates for scheduling jitter and
ensures the poll happens before — not after — the transition moment.
"""

RELOGIN_COOLDOWN: Final = timedelta(minutes=15)
"""Minimum time between automatic re-login attempts after a failed update.

The provider session obtained at setup does not live forever, so the coordinator
re-authenticates itself when an update fails in a way that a fresh session could
plausibly fix. This cooldown keeps a provider-side outage — which fails every
update for hours — from turning into one login attempt per poll.
"""

RELOGIN_REJECTIONS_BEFORE_REAUTH: Final = 2
"""Consecutive rejected re-logins before a generic provider error asks for reauth.

A login rejected once while the provider is already failing may be part of the
same outage. Rejected again in the next cooldown window, it is treated as a
credential problem so the reauth flow still starts.
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
