# Troubleshooting

## Sign-in failed

Reauthenticate via **Settings** > **Devices & services** > **City Visitor Parking**.

## Cannot connect

- Check your network connectivity.
- Check if the municipality/provider is available.

## No permits found

Confirm your account has an active visitor parking permit.

## Enable debug logging

```yaml
logger:
  default: info
  logs:
    custom_components.city_visitor_parking: debug
```

## When opening an issue

Include:
- Home Assistant version
- Integration version
- Municipality and permit type (no credentials)
- Steps to reproduce and expected result
- Relevant debug log excerpt
- Diagnostics (redacted)
