"""Constants for the City visitor parking integration."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Final

from homeassistant.const import Platform

DOMAIN: Final = "city_visitor_parking"
LOGGER = logging.getLogger(__name__)

PLATFORMS: Final[list[Platform]] = [Platform.SENSOR]

CONF_PROVIDER_ID: Final = "provider_id"
CONF_MUNICIPALITY: Final = "municipality_name"
CONF_BASE_URL: Final = "base_url"
CONF_API_URL: Final = "api_url"
CONF_PERMIT_ID: Final = "permit_id"
CONF_DESCRIPTION: Final = "description"

CONF_OPERATING_TIME_OVERRIDES: Final = "operating_time_overrides"
CONF_AUTO_END: Final = "auto_end_reservation_when_free"

ATTR_LICENSE_PLATE: Final = "license_plate"
ATTR_NAME: Final = "name"
ATTR_RESERVATION_ID: Final = "reservation_id"
ATTR_FAVORITE_ID: Final = "favorite_id"
ATTR_START_TIME: Final = "start_time"
ATTR_END_TIME: Final = "end_time"

STATE_CHARGEABLE: Final = "chargeable"
STATE_FREE: Final = "free"

DEFAULT_UPDATE_INTERVAL: Final = timedelta(minutes=5)
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
