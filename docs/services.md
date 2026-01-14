# Services

Service fields can differ per municipality and permit.
Check **Developer Tools** > **Services** or `custom_components/city_visitor_parking/services.yaml` for the exact schema.

## Available services

- `city_visitor_parking.start_reservation`
- `city_visitor_parking.update_reservation`
- `city_visitor_parking.end_reservation`
- `city_visitor_parking.add_favorite`
- `city_visitor_parking.update_favorite`
- `city_visitor_parking.remove_favorite`
- `city_visitor_parking.list_active_reservations`
- `city_visitor_parking.list_favorites`

## Example script: start a reservation

```yaml
alias: Start visitor parking
sequence:
  - service: city_visitor_parking.start_reservation
    data:
      license_plate: YOUR_LICENSE_PLATE
mode: single
```

## Example script: end a reservation

```yaml
alias: End visitor parking
sequence:
  - service: city_visitor_parking.end_reservation
    data:
      license_plate: YOUR_LICENSE_PLATE
mode: single
```

## Service responses

- `list_favorites` returns raw license plates.
- `list_active_reservations` can return raw license plates and additional details when available.
