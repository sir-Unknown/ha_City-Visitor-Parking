# AGENTS.md — Development Guide (Home Assistant Custom Integration: City Visitor Parking)

## 1) Purpose

This repository contains a Home Assistant custom integration that wraps the async library `pycityvisitorparking` to manage Dutch municipal visitor parking in a consistent, Home Assistant–native way.

Key goals:

- HA-native UX: config flow, options flow, reauth, diagnostics, translations.
- Strict async behavior and reliable runtime operation.
- Generic HA surface: avoid provider-specific concepts/fields.
- HACS-installable, but architected and implemented as if it were an official Home Assistant integration to make future migration straightforward.

## 2) Official-compatibility requirements

Treat this repository as “official-ready”:

- Follow Home Assistant Core integration patterns and conventions.
- No HACS-specific runtime shortcuts; HACS is only a distribution channel.
- Use standard `manifest.json` requirements and hassfest-friendly translations and schemas.
- Avoid brittle assumptions about file paths, working directories, or runtime environment.
- Keep module naming and responsibilities aligned with official integrations:
  - `const.py`, `config_flow.py`, `coordinator.py`, `services.py`, `diagnostics.py`, `sensor.py`.

Document any migration steps in project docs when needed.

## 3) Quality scale target

- `manifest.json` MUST declare `quality_scale: "silver"`.
- Maintain:
  - `custom_components/city_visitor_parking/quality_scale.yaml` (rule-by-rule, implemented/exempt)
  - `docs/QUALITY_SCALE.md` (human checklist with file references)

If any rule is not implemented, document an explicit exemption and rationale.

## 4) Releases & versioning (GitHub Releases required)

- Versions MUST come from GitHub Releases.
- For every version bump:
  - update `manifest.json` `version` to the new release version,
  - publish a GitHub Release (not just a tag),
  - use a tag name matching the integration version (recommend: `v1.2.3`).
- Keep `CHANGELOG.md` in sync with releases.

## 5) CI requirements (must use these actions)

### HACS validation

- Add a workflow that runs HACS validation using `hacs/action`.
- Category MUST be `integration`.
- Trigger on push, pull_request, schedule (daily), workflow_dispatch.

### hassfest

- Add a workflow that runs hassfest using `home-assistant/actions/hassfest@master`.
- Must checkout the repository first.
- Trigger on push, pull_request, schedule (daily).

### Tests and lint/format

- Add pytest workflow using HA test helpers.
- Add lint/format workflow with one consistent toolchain.

## 6) Hard rules (no exceptions)

### Async & I/O

- Async-only. No blocking calls.
- Do not perform HTTP directly; only `pycityvisitorparking` uses aiohttp.
- Always inject HA’s shared aiohttp session into `pycityvisitorparking.Client`. Never close injected sessions.

### Privacy & security

- Never log credentials, tokens, raw license plates, or other PII.
- Mask plates if they ever appear outside the library boundary (e.g., AB\*\*\*12).
- Diagnostics MUST redact sensitive data.

### Code quality

- Docstrings required for all public modules/classes/functions.
- Add inline comments for non-obvious logic (flow branching, validation, time handling, fallback updates, routing).
- Prefer typing throughout; use a typed config entry alias for `entry.runtime_data`.

## 7) Provider mapping via providers.yaml

### Source of truth

- `custom_components/city_visitor_parking/providers.yaml` maps municipality → provider configuration.
- Load it via `importlib.resources` (no filesystem assumptions).

### Config flow dropdown

- Config flow MUST present a municipality dropdown built from `providers.yaml`, plus “Other”.
- If a known municipality is selected, the provider config must be applied automatically (no provider dropdown shown).
- If “Other” is selected, prompt for manual entry:
  - provider_id (dropdown from `pycityvisitorparking.Client.list_providers()`)
  - municipality_name
  - base_url
  - api_url
- Manual provider configs are stored in config entry data only and must not be persisted back to YAML.

## 8) Config entry lifecycle

### Config flow requirements

Recommended steps:

1. Select municipality (dropdown + “Other”)
2. If “Other”: enter manual municipality/provider config
3. Enter credentials
4. Validate connection/login with a safe test call
5. Fetch permits and select permit_id
6. Optional description

### Entry identity & title

- Set a stable `unique_id` and prevent duplicates.
- Preferred unique_id strategy: include provider_id + permit_id (non-PII) if stable.
- Entry title MUST be unique and follow:
  - `"{description} - {permit_id}"` if description provided
  - else `"{municipality_name} - {permit_id}"`

### Setup/unload

- `async_setup_entry` creates runtime objects and stores them in `entry.runtime_data`.
- `async_unload_entry` unloads platforms and releases only internal resources created by the integration (never HA’s aiohttp session).

### Reauthentication

- Auth failures during setup or coordinator updates must raise `ConfigEntryAuthFailed` to trigger reauth.
- Implement `async_step_reauth` linked to the existing entry to update credentials and revalidate.

## 9) Options flow (7-day operating time overrides + auto-end)

- Options flow MUST support per-weekday overrides for operating times (7 days).
- Store overrides in `entry.options`.
- Default is “no override” (use library/provider-derived chargeable windows).
- Validate day entries; if both start and end exist, enforce end > start.

### Auto-end reservation when free

- Add option: `auto_end_reservation_when_free` (boolean, default false).
- When enabled, automatically end an active reservation early if the permit zone is currently not chargeable (“free”) according to computed `permit.zone_availability`.
- Must be scoped to the single config entry.
- Must implement safeguards:
  - track reservation_ids already auto-ended/attempted
  - cooldown to avoid repeated attempts and log spam
  - never act when there is no active reservation

## 10) Runtime data & coordinator

- Use a `DataUpdateCoordinator` with a conservative interval to fetch:
  - selected permit (and its zone_validity)
  - reservations
  - favorites
- Error handling:
  - Temporary/network issues → raise `UpdateFailed` (preserve last-known-good; avoid log spam)
  - Auth issues → raise `ConfigEntryAuthFailed`

Runtime objects to keep in `entry.runtime_data` (typed):

- `pycityvisitorparking.Client`
- selected provider instance
- coordinator
- any derived state needed by entities/services

## 11) Entities (minimum required set)

Expose at least these sensors. All entities MUST:

- have a stable `unique_id`
- set `_attr_has_entity_name = True`
- use `translation_key` (no hardcoded names)
- avoid PII in state/attributes

### Required sensors

1. **Active reservations count**

- Entity key: `active_reservations`
- State: integer count of reservations active “now”
- Derived from coordinator reservations using UTC-aware comparisons.

2. **Remaining time (H:mm)**

- Entity key: `remaining_time`
- State: `H:mm` (hours no leading zero; minutes 2 digits)
- Remaining time until the earliest `end_time` among active reservations.
- If none active: state MUST be `0:00` and attribute `has_active_reservation=false`.
- Attributes (non-PII only):
  - `remaining_seconds` (int)
  - `active_reservations` (int)
  - `next_end_time` (UTC ISO8601) when available
- Never expose raw license plates.

3. **Permit zone validity (permit.zone_validity)**

- Entity key: `permit_zone_validity`
- State: integer = number of chargeable validity blocks currently known.
- Attributes:
  - `zone_validity`: list of `{start, end}` blocks in UTC ISO8601.
- Must be chargeable-only (no free windows). Do not add provider-specific fields.

4. **Permit zone availability (permit.zone_availability)**

- Entity key: `permit_zone_availability`
- State: `chargeable` / `free` (stable enum values).
- Computed from chargeable-only `zone_validity` plus 7-day overrides.
- Attributes (non-PII):
  - `is_chargeable_now` (bool)
  - `next_change_time` (UTC ISO8601) if available
  - `windows_today`: list of `{start, end}` UTC ISO8601
- Do not add provider-specific fields.

5. **Favorites count**

- Entity key: `favorites`
- State: integer count of favorites.

### Stability requirements

- Avoid frequent state churn; coordinator interval should be conservative.
- Use `always_update=False` where possible and only write state changes when values truly change.

### Multi-entry separation

- Create exactly one Device per config entry and attach all entities to it with `device_info`.
- Use device identifiers that include the entry identity, e.g. `(DOMAIN, entry.entry_id)` or `(DOMAIN, f"{provider_id}:{permit_id}")`.
- Derive each entity’s `unique_id` from `entry.unique_id` plus a fixed suffix:
  - `${entry.unique_id}:active_reservations`, `${entry.unique_id}:remaining_time`,
    `${entry.unique_id}:permit_zone_validity`, `${entry.unique_id}:permit_zone_availability`,
    `${entry.unique_id}:favorites`.
- Keep the config entry title unique so HA groups entities cleanly per configured municipality/permit.

## 12) Services — routing for multiple configured entries

Home Assistant services are domain-wide, so routing is mandatory when multiple config entries exist.

### Routing rule

- Every service MUST target exactly one entry.
- The service schema MUST require `device_id` (preferred) as the routing target.
- The handler MUST map `device_id` → config entry and then use that entry’s runtime objects (`entry.runtime_data`).

### Failure handling

- If `device_id` cannot be resolved to an entry, or the entry is not loaded:
  - raise `ServiceValidationError` using translation keys (generic message, no PII).
- Never broadcast a service call across all entries.

### Required services

All services are domain-scoped and require `device_id`:

- `start_reservation` (device_id + start_time + end_time + license_plate)
- `update_reservation` (device_id + reservation_id + at least one changed field)
- `end_reservation` (device_id + reservation_id)
- `add_favorite` (device_id + license_plate)
- `update_favorite` (device_id + favorite_id + changed fields)
- `remove_favorite` (device_id + favorite_id)

### Validation rules

- `start_reservation`: require start_time and end_time; enforce end_time > start_time; no defaults.
- `update_reservation`: require reservation_id and at least one changed field; validate times when both provided; enforce end_time > start_time.
- `end_reservation`: require reservation_id (maps to cancel).
- Favorites: validate required identifiers and plate rules as applicable.
- Invalid input must raise `ServiceValidationError` using translation keys.
- Operational failures must raise `HomeAssistantError` using translation keys.
- Never include PII in messages.

### Update fallback behavior

- If the library/provider does not support native reservation updates, implement a documented fallback (e.g., cancel + start) only when enough data is provided to do so safely.
- Never perform a partial destructive fallback without required information.

### Testing

- Add tests with two config entries to ensure each service call executes only against the targeted entry/provider/permit.

## 13) Translations & i18n

- English is canonical; Dutch is required.
- Provide:
  - `strings.json`
  - `translations/en.json`
  - `translations/nl.json`
- Adding another language is drop-in: `translations/<bcp47>.json`.
- Translate config flow steps/errors, options, services fields/errors, and entity names.

## 14) Diagnostics

- Implement `diagnostics.py` and redact sensitive fields (credentials/tokens/raw plates).
- Include helpful non-PII troubleshooting data: provider_id, municipality, permit_id, polling interval, last update status.

## 15) Testing policy (no live calls)

- Tests must not call real municipal services.
- Use pytest + HA test helpers; mock `pycityvisitorparking` and aiohttp.

Minimum required tests:

- Config flow: dropdown from providers.yaml (+ “Other”), known city auto-maps, Other manual fields, success + permit selection + title formatting, invalid_auth/cannot_connect/unknown, reauth success/failure.
- Multi-entry: two entries → two devices; entities attach correctly; unique_ids derived from entry.unique_id.
- Options: 7-day overrides save/load + validation; auto_end toggle save/load.
- Services: routing with 2 entries targets only the selected device/entry; validation rules; update fallback behavior.
- Coordinator/runtime: when auto_end enabled and zone becomes free while a reservation is active:
  - end is called once (guard + cooldown), not repeatedly.
- Entity: permit_zone_availability correctness from zone_validity + overrides.
- Coordinator: auth failures trigger ConfigEntryAuthFailed; network failures handled without log spam.
- Translations: en/nl exist and parse.

## 16) Documentation & changelog

- README: installation (HACS/manual), UI setup, options, services reference, troubleshooting, privacy notes.
- CHANGELOG: keep “Unreleased”; move entries on release.
- MIGRATION.md: concrete steps to migrate the integration into Home Assistant Core.
