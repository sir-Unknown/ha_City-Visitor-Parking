# Examples

## End parking when it becomes free

Option 1:

- Enable the integration option that ends an active session when it becomes free.

Option 2:

- Create an automation that monitors the paid/free sensor and calls the end service when it changes to free.

## Example automation (skeleton)

```yaml
alias: End visitor parking when it becomes free
trigger:
  - platform: state
    entity_id: sensor.YOUR_PAID_FREE_SENSOR
    to: free
condition: []
action:
  - service: city_visitor_parking.end_reservation
    data:
      license_plate: YOUR_LICENSE_PLATE
mode: single
```
