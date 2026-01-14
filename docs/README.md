# City Visitor Parking documentation

## Introduction

City Visitor Parking lets you manage visitor parking permits from Dutch municipalities in Home Assistant.

## Use cases

- Start a visitor parking session from a dashboard card or an automation.
- Update/extend a running session when plans change.
- End a session manually or automatically when parking becomes free.
- Monitor paid/free status and remaining balance.
- Use favorites to quickly select license plates.

## Supported devices and services

This integration connects to municipality visitor parking portals (service providers).

Supported providers are defined in:
- `custom_components/city_visitor_parking/providers.yaml`

## Supported functionality

- Authenticate with the provider portal.
- List and select permits.
- Start, update, and end sessions.
- Manage favorites (add, update, remove).
- List favorites and active reservations for automations.

## Known limitations

- Paid/free status is based on the configured paid time windows.
- Available service fields can differ per municipality/provider.
- Provider portals can change without notice.

## Data update

- Data is refreshed periodically to keep sensors and session state up to date.
- Home Assistant will refresh after service calls (start/update/end) so changes show quickly.

## Installation

See the repository root README for installation steps.

## Configuration

1. Go to **Settings** > **Devices & services**.
2. Select **Add integration**.
3. Search for **City Visitor Parking**.
4. Select your municipality, sign in, and select your permit.
5. Optional: Set a description to distinguish multiple entries.

To add multiple permits, add the integration multiple times.

## Next steps

- Lovelace cards: [cards.md](cards.md)
- Services: [services.md](services.md)
- Troubleshooting: [troubleshooting.md](troubleshooting.md)
- Privacy: [privacy.md](privacy.md)
- Examples: [examples/automations.md](examples/automations.md)
