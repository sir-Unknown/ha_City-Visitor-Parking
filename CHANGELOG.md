# Changelog

## Unreleased

## Released

### 0.1.11

#### Fixed

- Add hassfest pre-commit hook and keep manifest key order compliant.

**Full Changelog**: https://github.com/sir-Unknown/ha_City-Visitor-Parking/compare/v0.1.10...v0.1.11

### 0.1.10

#### Fixed

- Add `lovelace` as an `after_dependencies` entry to satisfy hassfest.

**Full Changelog**: https://github.com/sir-Unknown/ha_City-Visitor-Parking/compare/v0.1.9...v0.1.10

### 0.1.9

#### Fixed

- Ensure the release workflow builds and packages frontend `dist` assets for HACS installs.

**Full Changelog**: https://github.com/sir-Unknown/ha_City-Visitor-Parking/compare/v0.1.8...v0.1.9

### 0.1.8

#### Fixed

- Package the HACS release asset so the integration installs without a nested `custom_components` folder.

**Full Changelog**: https://github.com/sir-Unknown/ha_City-Visitor-Parking/compare/v0.1.7...v0.1.8

### 0.1.7

#### Changed

- Use localized titles for the Lovelace card stubs and labels.
- Update the active card name and description translations.
- Remove tracked frontend build outputs and the migration guide.
- Loosen the documentation requirement for migration steps in .

**Full Changelog**: https://github.com/sir-Unknown/ha_City-Visitor-Parking/compare/v0.1.6...v0.1.7

### v0.1.7

#### Changed

- Use localized titles for the Lovelace card stubs and labels.
- Update the active card name and description translations.
- Remove tracked frontend build outputs and the migration guide.
- Loosen the documentation requirement for migration steps in `AGENTS.md`.

**Full Changelog**: https://github.com/sir-Unknown/ha_City-Visitor-Parking/compare/v0.1.6...v0.1.7

### v0.1.6

**Full Changelog**: https://github.com/sir-Unknown/ha_City-Visitor-Parking/compare/0.1.5...v0.1.6

### 0.1.3

#### Fixed

- Remove unsupported card translations from Home Assistant translation files to satisfy hassfest.
- Accept `--!>` as a valid HTML comment terminator in the bundled Lit parser.

#### Changed

- Declare `lovelace` in `after_dependencies` for frontend resource registration.
- Update frontend tooling dependencies and migrate ESLint config to the flat format.
- Pin GitHub Actions workflow versions for validation and release.

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
