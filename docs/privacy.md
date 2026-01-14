# Privacy

## Logging

The integration should not log credentials or raw license plates.

## Diagnostics

Diagnostics should redact sensitive values.

## Service responses

`list_favorites` and `list_active_reservations` return raw license plates in the service response.
Use that output carefully in logs and screenshots.
