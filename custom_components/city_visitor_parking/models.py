"""Data models for the City visitor parking integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class ProviderConfig:
    """Provider configuration for a municipality."""

    provider_id: str
    municipality_name: str
    base_url: str | None
    api_url: str | None


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
    windows_today: list[TimeRange]


@dataclass(frozen=True)
class CoordinatorData:
    """Coordinator data for entities and services."""

    permit_id: str
    permit_remaining_minutes: int
    zone_validity: list[TimeRange]
    reservations: list[Reservation]
    favorites: list[Favorite]
    zone_availability: ZoneAvailability
    active_reservations: list[Reservation]


def _default_attempts() -> dict[str, datetime]:
    """Return an empty attempts mapping."""

    return {}


@dataclass
class AutoEndState:
    """Runtime tracking for auto-end attempts."""

    attempted_ids: dict[str, datetime] = field(default_factory=_default_attempts)


type OperatingTimeOverrides = dict[str, tuple[tuple[str, str], ...]]
