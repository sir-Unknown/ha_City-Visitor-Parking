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
- `city_visitor_parking.list_reservations`
- `city_visitor_parking.list_favorites`
- `city_visitor_parking.get_status`
- `city_visitor_parking.get_entry_info`

## Example script: start a reservation

```yaml
alias: Start visitor parking
sequence:
  - service: city_visitor_parking.start_reservation
    data:
      device_id: YOUR_DEVICE_ID
      license_plate: YOUR_LICENSE_PLATE
      start_time: "2026-03-26T10:00:00+00:00"
      end_time: "2026-03-26T12:00:00+00:00"
mode: single
```

## Example script: end a reservation

```yaml
alias: End visitor parking
sequence:
  - service: city_visitor_parking.end_reservation
    data:
      device_id: YOUR_DEVICE_ID
      reservation_id: YOUR_RESERVATION_ID
mode: single
```

## Service responses

- `list_favorites` returns raw license plates.
- `list_reservations` can return raw license plates and additional details when available.
- `get_status` returns the current chargeable/free state plus effective and provider windows.
- `get_entry_info` returns non-sensitive metadata about the configured permit.
