# MIGRATION.md

## Goal

This document tracks the remaining migration work needed to move this custom integration closer to Home Assistant Core expectations.

The integration is intentionally developed in a Home Assistant-native style, but some parts still reflect custom-integration and HACS-specific tradeoffs.

## Remaining migration items

### 1. Service actions should move from explicit `device_id` fields to `target`

Current state:

- Service actions in `custom_components/city_visitor_parking/services.yaml` expose a required `device_id` field.
- This works well for strict routing, but it is less aligned with the standard Home Assistant service-action UX.

Core-oriented target state:

- Use `target:` in `services.yaml` with device targeting scoped to this integration.
- Keep the existing single-entry routing behavior internally.
- Update service validation, documentation, and tests accordingly.

Notes:

- This is tracked separately as a GitHub issue so the migration can be planned and implemented cleanly.

### 2. Frontend auto-registration is a custom-integration concession

Current state:

- The integration registers frontend assets and Lovelace resources at runtime from `custom_components/city_visitor_parking/__init__.py`.
- This provides a strong HACS user experience because the custom cards work with minimal manual setup.

Core-oriented target state:

- Re-evaluate whether the frontend should remain coupled to integration setup.
- For Home Assistant Core migration, expect the frontend packaging and registration approach to change.
- Keep backend integration behavior independent from custom frontend asset registration as much as possible.

Tradeoff:

- Keeping the current behavior is good for HACS convenience.
- Decoupling it would make the backend more Core-like, but likely at the cost of some plug-and-play UX.

### 3. Documentation will need to move away from GitHub wiki as the primary source

Current state:

- The integration documentation in `manifest.json` points to the GitHub wiki.
- README and wiki content are written for the custom-integration distribution model.

Core-oriented target state:

- Move user-facing setup and feature documentation into the Home Assistant documentation structure.
- Keep repository docs focused on development, release, and migration concerns.

### 4. Branding and quality-scale positioning should stay conservative until Core migration

Current state:

- As a custom integration, this project does not map cleanly onto the official Home Assistant brands and quality-scale approval process.

Current repository policy:

- Do not present the integration as officially holding a Home Assistant Core quality-scale tier.
- Continue tracking rule alignment in `custom_components/city_visitor_parking/quality_scale.yaml` for internal guidance only.

### 5. Keep provider-specific behavior in the Python library

Current state:

- The repository already aims to keep provider-specific logic in `pycityvisitorparking`.

Core-oriented target state:

- Continue preventing provider-specific API quirks, parsing branches, and municipality-specific hacks from leaking into the integration layer.
- Any missing abstraction needed by the integration should be added in `pycityvisitorparking`, then consumed here through a generic contract.
