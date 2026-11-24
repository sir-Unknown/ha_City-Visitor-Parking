"""Data models for the City visitor parking integration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

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
    parking_area_id: str | None = None


@dataclass(frozen=True)
class Favorite:
    """Normalized favorite data for coordinator usage."""

    favorite_id: str
    license_plate: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class PaidParkingStatus:
    """Computed paid parking availability state."""

    is_paid_now: bool
    next_change_time: datetime | None
    windows_today: tuple[TimeRange, ...]


@dataclass(frozen=True)
class ParkingArea:
    """Normalized parking area of the permit with its own paid windows."""

    parking_area_id: str
    name: str
    paid_hours: tuple[TimeRange, ...]
    paid_parking_status: PaidParkingStatus


type BalanceKind = Literal["time", "money", "times"]
"""Kind of a permit balance, see the ``BALANCE_KIND_*`` constants."""


@dataclass(frozen=True)
class Balance:
    """Normalized permit balance of one kind."""

    kind: BalanceKind
    # Non-negative remaining amount: minutes for time, euros for money and uses
    # for times.
    amount: float
    # Library balance unit; None when the provider reports none (a time balance).
    unit: str | None


@dataclass(frozen=True)
class CoordinatorData:
    """Coordinator data for entities and services."""

    permit_id: str
    # Every balance of the permit, at most one per kind, the primary one first.
    # Empty when the provider reports none.
    balances: tuple[Balance, ...]
    paid_hours: tuple[TimeRange, ...]
    reservations: tuple[Reservation, ...]
    favorites: tuple[Favorite, ...]
    paid_parking_status: PaidParkingStatus
    active_reservations: tuple[Reservation, ...]
    # Parking areas a reservation can be started in; the first one is the provider
    # default and matches ``paid_hours``. Empty when the provider has no parking area
    # selection.
    parking_areas: tuple[ParkingArea, ...] = ()
    # Whether a parking area ID outside ``parking_areas`` may be requested, such as a
    # number read from a parking machine. Only set when ``parking_areas`` is not empty.
    parking_area_free_input: bool = False

    def parking_area(self, parking_area_id: str | None) -> ParkingArea | None:
        """Return the parking area with ``parking_area_id``, or None when unknown."""
        if parking_area_id is None:
            return None
        return next(
            (
                parking_area
                for parking_area in self.parking_areas
                if parking_area.parking_area_id == parking_area_id
            ),
            None,
        )

    def balance(self, kind: BalanceKind) -> Balance | None:
        """Return the balance of ``kind``, or None when the permit has none."""
        return next(
            (balance for balance in self.balances if balance.kind == kind), None
        )


def _default_attempts() -> dict[str, datetime]:
    """Return an empty attempts mapping."""
    return {}


@dataclass
class AutoEndState:
    """Runtime tracking for auto-end attempts."""

    attempted_ids: dict[str, datetime] = field(default_factory=_default_attempts)


type OperatingTimeOverrides = dict[str, tuple[tuple[str, str], ...]]
