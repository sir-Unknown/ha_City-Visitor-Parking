# Quality scale checklist

Target: **Silver**

## Bronze

- Config flow: `custom_components/city_visitor_parking/config_flow.py`
- Config flow tests: `tests/components/city_visitor_parking/test_config_flow.py`
- Entity unique IDs and has entity name: `custom_components/city_visitor_parking/entity.py`
- Runtime data storage: `custom_components/city_visitor_parking/__init__.py`
- Appropriate polling: `custom_components/city_visitor_parking/coordinator.py`
- Test before configure/setup: `custom_components/city_visitor_parking/config_flow.py`, `custom_components/city_visitor_parking/__init__.py`
- Docs (description, install, removal, actions): `README.md`, `custom_components/city_visitor_parking/services.yaml`
- Dependency transparency: `custom_components/city_visitor_parking/manifest.json`

## Silver

- Config entry unloading: `custom_components/city_visitor_parking/__init__.py`
- Reauthentication flow: `custom_components/city_visitor_parking/config_flow.py`
- Entity availability: `custom_components/city_visitor_parking/coordinator.py`, `custom_components/city_visitor_parking/sensor.py`
- Log when unavailable: `custom_components/city_visitor_parking/coordinator.py`
- Action exceptions: `custom_components/city_visitor_parking/services.py`, `custom_components/city_visitor_parking/strings.json`
- Parallel updates: `custom_components/city_visitor_parking/coordinator.py`
- Test coverage: `tests/components/city_visitor_parking/`
- Installation/configuration parameters: `README.md`
- Integration ownership: `custom_components/city_visitor_parking/manifest.json`

For detailed rule status, see `custom_components/city_visitor_parking/quality_scale.yaml`.
