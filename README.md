# City Visitor Parking

City Visitor Parking helps you manage visitor parking permits from Dutch municipalities directly in Home Assistant. It is built for residents and small businesses who need to start, update, and end visitor parking sessions quickly, see whether parking is paid or free, and keep favorite license plates ready. The goal is a simple, Home Assistant-native experience so you can handle visitor parking from the same place you already manage your home.

## Features

- Start, update, and end visitor parking sessions from Home Assistant
- See at a glance whether parking is paid or free, and when that changes
- Keep favorite license plates for quick selection
- Track remaining permit balance and active sessions
- Optional auto-end when parking becomes free
- Handy dashboard card for quick access

## Installation (HACS)

1. Add this repository in HACS as a custom repository (category: Integration).
2. Install **City Visitor Parking** from HACS.
3. Restart Home Assistant.

## Manual installation

If you prefer manual setup:

1. Copy `custom_components/city_visitor_parking/` into your Home Assistant `custom_components/` folder.
2. Restart Home Assistant.

## Configuration

1. Go to **Settings** → **Devices & services** → **Add integration**.
2. Search for **City Visitor Parking**.
3. Pick your municipality, sign in, and choose your permit.
4. Optionally add a short description so you can tell entries apart.

## Options

- **Paid time windows**: Set the paid hours per weekday, for example `09:00-13:00, 14:00-17:30`.
- **Auto-end when free**: Automatically end an active session when parking becomes free again.
- **Description**: Rename the entry as shown in the UI.

## Sensors

These give you a quick overview in Home Assistant:

- **Active sessions**: How many visitor sessions are currently running.
- **Remaining balance**: How many hours you still have available.
- **Paid or free**: Whether the zone is currently paid or free, plus when that changes.
- **Paid window start/end**: The next start and end time for paid parking.
- **Favorites**: How many license plates you have saved.

## Lovelace card

Optional dashboard card for quick actions.

- Resources are registered automatically in dashboard storage mode. If you use YAML mode, add the resources manually: Settings → Dashboards → Resources, URL `/city_visitor_parking/city-visitor-parking-card.js`, type `Module`, and `/city_visitor_parking/city-visitor-parking-active-card.js`, type `Module`.
- Card type: `custom:city-visitor-parking-card`
- Optional config: `title`, `icon`, `theme`, `config_entry_id`, `show_favorites`, `show_start_time`, `show_end_time`

## Services

Advanced automations can call these services directly (each runs on a single entry):

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

The integration never logs credentials or raw license plates. Diagnostic reports hide sensitive values. Note that `list_favorites` and `list_active_reservations` return raw license plates in the service response.

## Troubleshooting

- **Sign-in failed**: Open the integration and reauthenticate.
- **Cannot connect**: Check your network and the provider status.
- **No permits**: Make sure your account has active visitor parking permits.

# Nederlands

City Visitor Parking helpt je om bezoekersparkeren van Nederlandse gemeenten direct in Home Assistant te beheren. Het is bedoeld voor bewoners en kleine bedrijven die snel een parkeersessie willen starten of stoppen, willen zien of parkeren betaald of gratis is, en vaste kentekens bij de hand willen houden.

## Installatie (HACS)

1. Voeg deze repository toe als custom repository in HACS (categorie: Integratie).
2. Installeer **City Visitor Parking** via HACS.
3. Herstart Home Assistant.

## Configuratie

1. Ga naar **Instellingen** → **Apparaten en diensten** → **Integratie toevoegen**.
2. Zoek naar **City Visitor Parking**.
3. Kies je gemeente, meld je aan en selecteer een vergunning.

## Opties

- **Betaalvensters**: Stel per weekdag betaalde tijden in, bijvoorbeeld `09:00-13:00, 14:00-17:30`.
- **Automatisch beëindigen**: Laat een actieve sessie automatisch stoppen zodra parkeren gratis wordt.
- **Beschrijving**: Geef de integratie een herkenbare naam in de UI.

## Lovelace-kaart

Optionele dashboardkaart voor snelle acties.

- Resources worden automatisch geregistreerd in dashboard storage mode. Gebruik je YAML mode, voeg dan handmatig toe: Instellingen → Dashboards → Resources, URL `/city_visitor_parking/city-visitor-parking-card.js`, type `Module`, en `/city_visitor_parking/city-visitor-parking-active-card.js`, type `Module`.
- Kaarttype: `custom:city-visitor-parking-card`
- Optioneel: `title`, `icon`, `theme`, `config_entry_id`, `show_favorites`, `show_start_time`, `show_end_time`

## Diensten

Voor geavanceerde automatiseringen kun je deze diensten gebruiken (elk werkt op één entry):

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

De integratie logt nooit inloggegevens of ruwe kentekens. Diagnostische rapporten verbergen gevoelige waarden. Let op: `list_favorites` en `list_active_reservations` geven ruwe kentekens terug in de service response.
