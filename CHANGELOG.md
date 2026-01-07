# Changelog

## Unreleased

## 1.0.0

- Translated the card editor options to Dutch and removed the reservation form toggle.
- Added a full config flow with municipality selection, manual provider entry, permit selection, and reauthentication.
- Added sensors for active reservations, remaining balance (hours), permit zone validity, permit zone availability, and favorites.
- Added device-targeted services for reservations and favorites with validation and error handling.
- Added options for auto-ending reservations when parking becomes free.
- Added options support to edit the entry description and collapse the operating time overrides.
- Added diagnostics with redaction and integration-level tests covering flows, services, and coordinator behavior.
- Changed operating time overrides to accept multiple chargeable windows per weekday using comma-separated ranges (for example `09:00-13:00, 14:00-17:30`).
- Changed remaining balance to use `Permit.remaining_balance` and expose hours via a duration device class.
- Changed availability attributes to expose `windows_today` in UTC and drop local-only fields.
- Changed zone validity to be exposed under the availability sensor (removed the separate validity sensor).
- Added timestamp sensors for the current or next chargeable window start/end.
- Removed `zone_validity` and `windows_today` from availability attributes.
- Added the `city-visitor-parking-card` Lovelace card for starting reservations and managing favorites.
- Removed the `city-visitor-parking-new-reservation-card` and `city-visitor-parking-permit-card` Lovelace cards.
- Removed the standalone active reservations Lovelace card.
- Fixed config flow options schema to avoid blocking and serialization warnings in `voluptuous_serialize`.
- Updated login calls to use `username`/`password` per `pycityvisitorparking` 0.4.0.
- Updated dependency pin to `pycityvisitorparking==0.5.6`.
- Updated reservation operations to pass timezone-aware datetimes to `pycityvisitorparking`.
- Removed legacy field fallbacks; the integration now expects 0.4.0 data shapes.
