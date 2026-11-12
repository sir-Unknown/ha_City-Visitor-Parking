"""Data models for the City visitor parking integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import datetime


@dataclass(frozen=True)
class ProviderConfig:
    """Provider configuration for a municipality."""

    provider_id: str
    municipality_name: str
    base_url: str | None
    api_url: str | None
    gui_url: str | None = None


@dataclass(frozen=True)
class TimeRange:
    """Time range in UTC."""

    start: datetime
    end: datetime


@dataclass(frozen=True)
class Reservation:
    """Normalized reservation data for coordinator usage."""

    reservation_id: str
    start_time: datetime
    end_time: datetime
    license_plate: str | None = None
    zone_id: str | None = None


@dataclass(frozen=True)
class Favorite:
    """Normalized favorite data for coordinator usage."""

    favorite_id: str
    license_plate: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class ZoneAvailability:
    """Computed zone availability state."""

    is_chargeable_now: bool
    next_change_time: datetime | None
    windows_today: tuple[TimeRange, ...]


@dataclass(frozen=True)
class Zone:
    """Normalized zone of the permit with its own chargeable windows."""

    zone_id: str
    name: str
    zone_validity: tuple[TimeRange, ...]
    zone_availability: ZoneAvailability


@dataclass(frozen=True)
class CoordinatorData:
    """Coordinator data for entities and services."""

    permit_id: str
    permit_remaining_balance: float
    permit_balance_unit: str | None
    zone_validity: tuple[TimeRange, ...]
    reservations: tuple[Reservation, ...]
    favorites: tuple[Favorite, ...]
    zone_availability: ZoneAvailability
    active_reservations: tuple[Reservation, ...]
    # Zones a reservation can be started in; the first one is the provider default
    # and matches ``zone_validity``. Empty when the provider has no zone selection.
    zones: tuple[Zone, ...] = ()

    def zone(self, zone_id: str | None) -> Zone | None:
        """Return the zone with ``zone_id``, or None when it is unknown."""
        if zone_id is None:
            return None
        return next((zone for zone in self.zones if zone.zone_id == zone_id), None)


def _default_attempts() -> dict[str, datetime]:
    """Return an empty attempts mapping."""
    return {}


@dataclass
class AutoEndState:
    """Runtime tracking for auto-end attempts."""

    attempted_ids: dict[str, datetime] = field(default_factory=_default_attempts)


type OperatingTimeOverrides = dict[str, tuple[tuple[str, str], ...]]
