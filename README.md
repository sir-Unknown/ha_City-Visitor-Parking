# City Visitor Parking

City Visitor Parking is a Home Assistant custom integration for managing Dutch municipal visitor parking permits using the async-only `pycityvisitorparking` library. The integration is designed to feel and behave like an official Home Assistant integration so that moving it into Core later is straightforward.

## Features

- Config flow with municipality selection and manual provider entry
- Permit selection per entry (one device per permit)
- Sensors for active reservations, remaining balance, availability, chargeable window start/end, and favorites
- Options for weekday chargeable windows and auto-end when parking becomes free
- Service calls to manage reservations and favorites
- Diagnostics with redaction of sensitive data
- Lovelace card for starting reservations and managing favorites

## Installation (HACS)

1. Add this repository as a custom repository in HACS (category: Integration).
2. Install **City Visitor Parking** from HACS.
3. Restart Home Assistant.

## Manual installation

1. Copy `custom_components/city_visitor_parking/` into your Home Assistant `custom_components/` directory.
2. Restart Home Assistant.

## Configuration

1. Go to **Settings** → **Devices & services** → **Add integration**.
2. Search for **City Visitor Parking**.
3. Select your municipality, sign in, and choose a permit.
4. Optionally set a description to help distinguish multiple entries.

## Options

- **Operating time overrides**: Set chargeable windows per weekday using comma-separated ranges, for example `09:00-13:00, 14:00-17:30`.
- **Auto-end when free**: Automatically end active reservations when the zone is free. A cooldown prevents repeated attempts.
- **Description**: Update the entry label shown in the UI.

## Sensors

- **Active reservations**: Number of reservations active right now.
- **Remaining balance**: Hours of the available permit balance.
- **Permit zone availability**: `chargeable` or `free`, plus the next change time.
- **Chargeable window start/end**: Start and end of the current or next chargeable window.
- **Favorites**: Number of favorite license plates.

## Lovelace card

This integration ships a custom card for starting reservations.

- Add the card as a Lovelace resource (required for hard refreshes): Settings → Dashboards → Resources, URL `/city_visitor_parking/city-visitor-parking-card.js?v=1`, type `Module`.
- Card type: `custom:city-visitor-parking-card`
- Optional config: `title`, `icon`, `theme`, `config_entry_id`, `show_favorites`, `show_start_time`, `show_end_time`

## Services

Services are device-targeted and always operate on exactly one config entry.

- `city_visitor_parking.start_reservation`
- `city_visitor_parking.update_reservation`
- `city_visitor_parking.end_reservation`
- `city_visitor_parking.add_favorite`
- `city_visitor_parking.update_favorite`
- `city_visitor_parking.remove_favorite`
- `city_visitor_parking.list_active_reservations` (returns license plate and favorite info when available)
- `city_visitor_parking.list_favorites` (returns raw license plates)

See `custom_components/city_visitor_parking/services.yaml` for full schemas.

## Privacy

The integration never logs credentials or raw license plates. Diagnostics redact sensitive values. Note that `list_favorites` and `list_active_reservations` return raw license plates in the service response.

## Troubleshooting

- **Invalid credentials**: Reauthenticate via the integration card.
- **Cannot connect**: Check your network and the provider availability.
- **No permits**: Verify that the account has active visitor parking permits.

## Release process

This repository uses GitHub Releases as the source of truth for versions. See `RELEASING.md` for the full step-by-step process.

---

# Nederlands

City Visitor Parking is een Home Assistant custom integration voor bezoekersparkeren in Nederlandse gemeenten via de async-only `pycityvisitorparking`-bibliotheek.

## Installatie (HACS)

1. Voeg deze repository toe als custom repository in HACS (categorie: Integratie).
2. Installeer **City Visitor Parking** via HACS.
3. Herstart Home Assistant.

## Configuratie

1. Ga naar **Instellingen** → **Apparaten en diensten** → **Integratie toevoegen**.
2. Zoek naar **City Visitor Parking**.
3. Kies je gemeente, meld je aan en selecteer een vergunning.

## Opties

- **Bedrijfstijden**: Stel per weekdag betaalvensters in, bijvoorbeeld `09:00-13:00, 14:00-17:30`.
- **Automatisch beëindigen**: Beëindig reserveringen automatisch wanneer parkeren gratis wordt.
- **Beschrijving**: Pas de naam van de integratie aan zoals deze in de UI verschijnt.

## Lovelace-kaart

Deze integratie bevat een custom kaart om reserveringen te starten.

- Voeg de kaart toe als Lovelace resource (nodig bij hard refreshes): Instellingen → Dashboards → Resources, URL `/city_visitor_parking/city-visitor-parking-card.js?v=1`, type `Module`.
- Kaarttype: `custom:city-visitor-parking-card`
- Optioneel: `title`, `icon`, `theme`, `config_entry_id`, `show_favorites`, `show_start_time`, `show_end_time`

## Diensten

Diensten zijn device-gericht en werken altijd op precies één config entry.

- `city_visitor_parking.start_reservation`
- `city_visitor_parking.update_reservation`
- `city_visitor_parking.end_reservation`
- `city_visitor_parking.add_favorite`
- `city_visitor_parking.update_favorite`
- `city_visitor_parking.remove_favorite`
- `city_visitor_parking.list_active_reservations` (geeft kenteken en favorietgegevens terug indien beschikbaar)
- `city_visitor_parking.list_favorites` (geeft ruwe kentekens terug)

Zie `custom_components/city_visitor_parking/services.yaml` voor de volledige schema’s.

## Privacy

De integratie logt nooit inloggegevens of ruwe kentekens. Diagnostics redigeren gevoelige waarden. Let op: `list_favorites` en `list_active_reservations` geven ruwe kentekens terug in de service response.
