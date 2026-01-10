# Changelog

## Unreleased

## Released

### 0.1.2

#### Changed

- Updated the integration to use `pycityvisitorparking==0.5.14`.
- Automatically register Lovelace resources for the dashboard cards to avoid manual setup and timing issues.
- Ensure card editor translations are loaded before rendering configuration forms.
- Reduce duplicated frontend card logic and backend helper utilities.

### 0.1.1

#### Fixed

- Handle missing permit identifiers in the config flow and expand config flow tests.
- Fix ruff style issues in `city_visitor_parking`.

#### Changed

- Add pre-commit hooks and align coordinator typing.
- Replace legacy GitHub workflows with `validate.yml` and keep it updated.
- Add a release workflow that uploads the integration zip to GitHub Releases.

### 0.1.0

#### Added

- Added a full config flow with municipality selection, manual provider entry, permit selection, and reauthentication.
- Added sensors and device-targeted services for reservations, availability, and favorites.
- Added options for auto-ending reservations when parking becomes free.
- Added the `city-visitor-parking-card` Lovelace card for reservation and favorite management.
