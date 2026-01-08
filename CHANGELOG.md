# Changelog

## Unreleased

## 0.1.1

- Handle missing permit identifiers in the config flow and expand config flow tests.
- Add pre-commit hooks and align coordinator typing.
- Fix ruff style issues in `city_visitor_parking`.
- Replace legacy GitHub workflows with `validate.yml` and keep it updated.
- Add a release workflow that uploads the integration zip to GitHub Releases.

## 0.1.0

- Added a full config flow with municipality selection, manual provider entry, permit selection, and reauthentication.
- Added sensors and device-targeted services for reservations, availability, and favorites.
- Added options for auto-ending reservations when parking becomes free.
- Added the `city-visitor-parking-card` Lovelace card for reservation and favorite management.
- Updated the integration to use `pycityvisitorparking==0.5.6`.
