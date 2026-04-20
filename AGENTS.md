# AGENTS.md — Development Guide (Home Assistant Custom Integration: City Visitor Parking)

## 1) Purpose

This repository contains a Home Assistant custom integration that wraps the async library `pycityvisitorparking` to manage Dutch municipal visitor parking in a consistent, Home Assistant-native way.

Key goals:

- HA-native UX: config flow, options flow, reauth, diagnostics, translations, services, and frontend behavior.
- Strict async behavior and reliable runtime operation.
- Generic HA surface: avoid provider-specific concepts, fields, and user-facing terminology.
- Provider-specific API behavior, parsing logic, request quirks, and municipality-specific backend handling MUST live in `pycityvisitorparking`, not in this integration.
- HACS-installable, but architected and implemented as if it were an official Home Assistant integration to make future migration straightforward.

## 2) Current Repo Shape

Treat this repository as four connected surfaces that must stay aligned:

- Python Home Assistant integration code in `custom_components/city_visitor_parking/`
- A custom frontend bundle in `custom_components/city_visitor_parking/frontend/`
- A websocket API layer used by the frontend and tests
- GitHub automation for validation, labeling, release drafting, dependency review, and release packaging

Changes in one surface often require follow-up updates in the others.

## 3) Official-compatibility requirements

Treat this repository as "official-ready":

- Follow Home Assistant Core integration patterns and conventions.
- No HACS-specific runtime shortcuts; HACS is only a distribution channel.
- Use standard `manifest.json` requirements and hassfest-friendly translations and schemas.
- Avoid brittle assumptions about file paths, working directories, or runtime environment.
- Keep module naming and responsibilities aligned with official integrations:
  - `const.py`, `config_flow.py`, `coordinator.py`, `services.py`, `diagnostics.py`, `sensor.py`

Document any migration steps in project docs when needed.

## 3.1) HA Core and HA Frontend compatibility

Treat Home Assistant Core and Home Assistant Frontend as the compatibility baseline for implementation style, testing, copy, and review workflow.

### HA Core alignment

- Prefer patterns used by mature Gold/Platinum-quality Home Assistant integrations when choosing structure, naming, or error handling.
- Keep tests fully typed where practical; test function parameters SHOULD use concrete type annotations.
- Do not rewrite commit history after review has started; avoid amend, squash, or rebase once feedback is in progress unless explicitly requested.
- Pull request titles MUST follow the repository's standard conventional format, using a recognized prefix such as `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`, `ci:`, `deps:`, `test:`, or `tests:` so CI label automation can categorize the PR correctly.

### HA Frontend alignment

- User-facing text MUST be localization-friendly, concise, and consistent with Home Assistant terminology.
- Prefer Home Assistant wording conventions:
  - use "add" / "remove" for attaching or detaching existing items
  - use "create" / "delete" for creating or permanently removing items
- Frontend assets, cards, dialogs, editors, and configuration UX MUST follow Home Assistant frontend expectations for accessibility, responsive behavior, error states, and internationalization.
- Avoid hardcoded UI copy when translation keys or shared wording patterns are appropriate.

### Compatibility rule

- If a local repository convention conflicts with HA Core or HA Frontend conventions, resolve it in favor of the option that is most likely to remain acceptable in an eventual Home Assistant Core migration.

## 4) Quality scale target

- Maintain `custom_components/city_visitor_parking/quality_scale.yaml` rule-by-rule with implemented or exempt status.

If any rule is not implemented, document an explicit exemption and rationale.

The integration currently targets the quality level declared in `custom_components/city_visitor_parking/manifest.json`. Keep code, tests, docs, diagnostics, and CI aligned with that declared target.

## 5) Releases & versioning

- Versions MUST come from GitHub Releases.
- For every version bump:
  - update `custom_components/city_visitor_parking/manifest.json` `version` to the new release version
  - publish a GitHub Release, not just a tag
  - use a tag name matching the integration version, preferably `v1.2.3`

Release automation and release notes MUST stay aligned with:

- `.github/release-drafter.yml`
- `.github/workflows/release-drafter.yml`
- `.github/workflows/release.yml`

## 6) CI requirements

The repository currently relies on GitHub Actions workflows for validation, labeling, release drafting, dependency review, and release packaging. Treat these workflows as part of the product surface, not as incidental tooling.

### Required validation areas

- HACS validation using `hacs/action`
- Hassfest validation using `home-assistant/actions/hassfest`
- Python quality checks
- Python tests
- Frontend quality checks
- Release policy validation
- Dependency review
- PR labeling and release categorization

### Current repo workflow expectations

- Python development and CI use `uv` with dependency groups from `pyproject.toml`.
- Frontend development and CI use the bundle under `custom_components/city_visitor_parking/frontend/`.
- Treat PR labeling, Release Drafter, dependency review, and release packaging workflows as part of the maintained repository surface.

## 7) Hard rules

### Async & I/O

- Async-only. No blocking calls in integration runtime code.
- Do not perform HTTP directly from integration modules; only `pycityvisitorparking` uses aiohttp for provider communication.
- Always inject Home Assistant's shared aiohttp session into `pycityvisitorparking.Client`.
- Never close injected HA-managed sessions.

### Provider abstraction

- Do not add hardcoded provider-specific logic, provider-specific API branching, municipality-specific hacks, or provider-specific field handling in the Home Assistant integration.
- If behavior is specific to one provider or municipality, it MUST be implemented in `pycityvisitorparking` and exposed through a generic integration-facing contract.
- The integration may select a configured provider, but it MUST NOT become the place where provider quirks are embedded.

### Privacy & security

- Never log credentials, tokens, raw license plates, or other PII.
- Mask plates if they ever appear outside the library boundary, for example `AB***12`.
- Diagnostics MUST redact sensitive data.
- Error messages, service exceptions, websocket errors, and logs MUST avoid leaking PII.

### Code quality

- Docstrings required for all public modules, classes, and functions.
- Add inline comments for non-obvious logic such as flow branching, validation, time handling, fallback updates, routing, frontend resource registration, or websocket contract handling.
- Prefer typing throughout.
- Use a typed config entry alias for `entry.runtime_data`.

## 8) Development workflow

### Python workflow

Use `uv` for local Python commands and dependency resolution.

Preferred commands:

- `uv run --only-group dev ruff check .`
- `uv run --only-group dev ruff format --check .`
- `uv sync --group test --no-install-project`
- `uv run pytest tests/components/city_visitor_parking`

### Frontend workflow

Frontend code lives in `custom_components/city_visitor_parking/frontend/`.

If frontend files change, run:

- `yarn install`
- `yarn build`
- `yarn lint`
- `yarn test`

If frontend output or frontend translation assets are expected by runtime code, confirm they remain compatible with the backend registration logic in `custom_components/city_visitor_parking/__init__.py`.

## 9) Dependency policy

### Version alignment

- Keep `pycityvisitorparking` pinned consistently in both:
  - `pyproject.toml`
  - `custom_components/city_visitor_parking/manifest.json`

### CI-sensitive dependency changes

- Be careful when bumping Home Assistant test dependencies.
- `pytest-homeassistant-custom-component` may pin compatible versions of `pytest`, `pytest-cov`, and related packages.
- Do not accept dependency bumps that make the `uv` dependency graph unsatisfiable in CI.
- If dependency review has temporary advisory exceptions, remove them as soon as upstream constraints allow.

### Dependency automation

- Keep `.github/dependabot.yml` aligned with real repository constraints.
- If a dependency must stay pinned for CI compatibility, document that in config comments and avoid allowing automated PRs to repeatedly propose broken combinations.

## 10) Provider mapping via providers.yaml

### Source of truth

- `custom_components/city_visitor_parking/providers.yaml` maps municipality to provider configuration.
- Load it via `importlib.resources`; do not depend on filesystem-relative assumptions.

### Config flow dropdown

- Config flow MUST present a municipality dropdown built from `providers.yaml`, plus `Other`.
- If a known municipality is selected, the provider config must be applied automatically.
- If `Other` is selected, prompt for manual entry:
  - `provider_id` from `pycityvisitorparking.Client.list_providers()`
  - `municipality_name`
  - `base_url`
  - `api_url`
- Manual provider configs are stored in config entry data only and must not be written back to YAML.

## 11) Config entry lifecycle

### Config flow requirements

Recommended steps:

1. Select municipality
2. If `Other`, enter manual municipality/provider config
3. Enter credentials
4. Validate connection/login with a safe test call
5. Fetch permits and select `permit_id`
6. Optional description

### Entry identity & title

- Set a stable `unique_id` and prevent duplicates.
- Preferred `unique_id` strategy: include `provider_id` and `permit_id` if stable and non-PII.
- Entry title MUST be unique and follow:
  - `"{description} - {permit_id}"` if description is provided
  - otherwise `"{municipality_name} - {permit_id}"`

### Setup/unload

- `async_setup_entry` creates runtime objects and stores them in `entry.runtime_data`.
- `async_unload_entry` unloads platforms and releases only resources owned by the integration.
- Never close Home Assistant-owned shared resources.

### Reauthentication

- Auth failures during setup or coordinator updates must raise `ConfigEntryAuthFailed`.
- Implement `async_step_reauth` linked to the existing entry to update credentials and revalidate.

## 12) Options flow

### Time overrides

- Options flow MUST support per-weekday overrides for operating times across all 7 days.
- Store overrides in `entry.options`.
- Default is no override, meaning provider or library-derived chargeable windows are used.
- Validate each day entry; if both start and end exist, enforce `end > start`.

### Auto-end reservation when free

- Add option `auto_end_reservation_when_free` as a boolean, default `false`.
- When enabled, automatically end an active reservation early if the permit zone is currently not chargeable according to computed `permit.zone_availability`.
- Scope this behavior to the single config entry only.
- Implement safeguards:
  - track reservation IDs already auto-ended or attempted
  - use cooldowns to avoid repeated attempts and log spam
  - never act when there is no active reservation

## 13) Runtime data & coordinator

Use a `DataUpdateCoordinator` with a conservative interval to fetch:

- selected permit and its `zone_validity`
- reservations
- favorites

Error handling:

- Temporary or network issues must raise `UpdateFailed`
- Auth issues must raise `ConfigEntryAuthFailed`

Runtime objects in `entry.runtime_data` should include:

- `pycityvisitorparking.Client`
- selected provider instance
- coordinator
- any derived state needed by entities, services, websocket handlers, or frontend support

### Frontend and websocket contract

- Treat `custom_components/city_visitor_parking/websocket_api.py`, `custom_components/city_visitor_parking/payloads.py`, and `custom_components/city_visitor_parking/frontend/src/types.ts` as one contract surface.
- When changing payload fields or semantics, update backend payload builders, websocket handlers, frontend TypeScript types, and related tests together.
- Frontend registration, generated assets, Lovelace resource synchronization, and websocket response shapes must remain compatible with runtime setup in `custom_components/city_visitor_parking/__init__.py`.

## 14) Entities

Expose at least these sensors. All entities MUST:

- have a stable `unique_id`
- set `_attr_has_entity_name = True`
- use `translation_key`
- avoid PII in state and attributes

### Required sensors

1. `active_reservations`

- State: integer count of reservations active now

2. `remaining_time`

- State: `H:mm`
- If none active: `0:00`
- Attribute `has_active_reservation=false`
- Non-PII attributes only

3. `permit_zone_validity`

- State: integer count of chargeable validity blocks
- Attribute `zone_validity` with UTC ISO8601 blocks

4. `permit_zone_availability`

- State: `chargeable` or `free`
- Derived from chargeable-only validity plus overrides
- Attributes:
  - `is_chargeable_now`
  - `next_change_time`
  - `windows_today`

5. `favorites`

- State: integer count of favorites

### Stability requirements

- Avoid frequent state churn.
- Use `always_update=False` where possible.
- Only write state changes when values truly change.

### Multi-entry separation

- Create exactly one device per config entry.
- Attach all entities to that device using `device_info`.
- Use identifiers based on the entry identity.
- Derive each entity `unique_id` from `entry.unique_id` plus a fixed suffix.

## 15) Services

Home Assistant services are domain-wide, so routing is mandatory when multiple config entries exist.

### Routing rule

- Every service MUST target exactly one entry.
- The service schema MUST require `device_id` as the routing target.
- The handler MUST map `device_id` to the config entry and use that entry's runtime objects.

### Failure handling

- If `device_id` cannot be resolved, or the entry is not loaded:
  - raise `ServiceValidationError` using translation keys
- Never broadcast a service call across all entries.

### Required services

All services are domain-scoped and require `device_id`:

- `start_reservation`
- `update_reservation`
- `end_reservation`
- `add_favorite`
- `update_favorite`
- `remove_favorite`

### Validation rules

- `start_reservation` requires `start_time`, `end_time`, and `license_plate`
- `update_reservation` requires `reservation_id` and at least one changed field
- `end_reservation` requires `reservation_id`
- Validate time ordering when both times are present
- Invalid input must raise `ServiceValidationError`
- Operational failures must raise `HomeAssistantError`
- Never include PII in messages

### Fallback behavior

- If the library or provider does not support native reservation updates, only use a destructive fallback when enough information is present to do so safely.
- Never perform partial destructive fallback behavior without the required data.

## 16) Translations & i18n

- English is canonical.
- Dutch is required.
- Maintain:
  - `strings.json`
  - `translations/en.json`
  - `translations/nl.json`

Also keep frontend translation assets aligned where applicable.

Translate:

- config flow steps and errors
- options
- services fields and errors
- entity names
- frontend strings and editors where applicable

## 17) Diagnostics

- Implement diagnostics in `diagnostics.py`.
- Redact credentials, tokens, raw plates, and other sensitive fields.
- Include helpful non-PII troubleshooting data such as:
  - `provider_id`
  - municipality
  - `permit_id`
  - polling interval
  - last update status

## 18) Testing policy

- Tests must not call real municipal services.
- Use pytest plus Home Assistant test helpers.
- Mock `pycityvisitorparking` and aiohttp.

Minimum expected coverage includes:

- config flow
- reauth flow
- options flow
- multi-entry behavior
- services routing and validation
- coordinator behavior
- entity behavior
- websocket API behavior
- diagnostics redaction
- translations parsing
- frontend contract behavior where backend payload shape matters

### Frontend-aware testing rule

If a backend change affects frontend payloads, websocket responses, config entry exposure, or translations used by the frontend, add or update the corresponding tests.

## 19) PR, labeling, and release-drafter conventions

- Pull request titles MUST use a recognized conventional prefix.
- PRs are expected to end up with exactly one release category label used by PR labeling and Release Drafter.
- Keep `.github/workflows/pr-labeling.yml`, `.github/release-drafter.yml`, and `.github/workflows/release-drafter.yml` aligned with real title and label conventions.
- If a workflow change alters categorization behavior, update the documentation and PR expectations with it.

## 20) Documentation

Maintain these docs as part of the integration surface:

- `README.md`
- `MIGRATION.md`
- wiki pages when they are part of the maintained user or developer workflow
- release-drafter and release-policy documentation when behavior changes

README should cover:

- installation
- UI setup
- options
- services reference
- frontend expectations if relevant
- troubleshooting
- privacy notes

MIGRATION.md should describe concrete steps to move the integration into Home Assistant Core.
