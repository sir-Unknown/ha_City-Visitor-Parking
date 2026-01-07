# Migration to Home Assistant Core

This custom integration is structured to match Home Assistant Core conventions. To migrate into Core later:

1. Move `custom_components/city_visitor_parking/` to `homeassistant/components/city_visitor_parking/`.
2. Remove `version` from `manifest.json` (Core integrations do not use it).
3. Replace repository documentation links in `manifest.json` with the official documentation URL.
4. Move tests from `tests/components/city_visitor_parking/` into the Core test suite and update any test imports to match Core paths.
5. Delete `hacs.json` and any HACS-specific docs from the repository.
6. Run `python -m script.hassfest` and `python -m script.translations develop --all` in the Core repository to validate and update translations.
7. Update `CODEOWNERS` in the Core repo to include the integration owners.
8. Confirm `quality_scale.yaml` and `docs/QUALITY_SCALE.md` match Core’s quality scale guidance.
