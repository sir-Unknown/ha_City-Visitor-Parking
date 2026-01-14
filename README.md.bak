````md
# City Visitor Parking 🚗

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=sir-Unknown&repository=ha_City-Visitor-Parking&category=integration)

Manage Dutch municipality visitor parking permits from Home Assistant: start/extend/stop sessions, see paid/free windows, and keep favorite license plates ready.

---

## Screenshots

<p align="center">
  <img src="docs/integration.png" alt="Integration setup" width="320">
  <img src="docs/options.png" alt="Integration options" width="320">
  <img src="docs/permit_details.png" alt="Permit details" width="320">
</p>
<p align="center">
  <img src="docs/lovelace.png" alt="Lovelace card placement" width="320">
  <img src="docs/card_options.png" alt="Lovelace card options" width="320">
</p>
<p align="center">
  <img src="docs/new_reservation.png" alt="Visitor parking card" width="320">
  <img src="docs/active_reservations.png" alt="Active reservations card" width="320">
</p>

---

## Table of contents

- [English](#english)
  - [Features](#features)
  - [Quick start](#quick-start)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Options](#options)
  - [Entities (sensors)](#entities-sensors)
  - [Lovelace cards](#lovelace-cards)
  - [Services](#services)
  - [Privacy](#privacy)
  - [Troubleshooting](#troubleshooting)
  - [Support](#support)
- [Nederlands](#nederlands)
  - [Functies](#functies)
  - [Snel starten](#snel-starten)
  - [Installatie](#installatie-1)
  - [Configuratie](#configuratie-1)
  - [Opties](#opties-1)
  - [Entiteiten (sensoren)](#entiteiten-sensoren)
  - [Lovelace-kaarten](#lovelace-kaarten)
  - [Diensten](#diensten)
  - [Privacy](#privacy-1)
  - [Problemen oplossen](#problemen-oplossen)
  - [Support](#support-1)

---

# English

## Features

- Start, update, and end visitor parking sessions
- Paid/free indicator + next change moment
- Favorites (license plates) for quick selection
- Remaining balance + active sessions count
- Optional auto-end when parking becomes free
- Optional Lovelace cards for quick actions

## Quick start

1. Install via HACS (recommended).
2. Add the integration: **Settings → Devices & services → Add integration → City Visitor Parking**
3. Select municipality → sign in → pick a permit.
4. Add a Lovelace card (optional) to start/stop sessions quickly.

## Installation

### HACS (recommended)

1. Add this repository as a **Custom repository** (category: **Integration**).
2. Install **City Visitor Parking**.
3. Restart Home Assistant.

### Manual

1. Copy `custom_components/city_visitor_parking/` into your HA `custom_components/`.
2. Restart Home Assistant.

## Configuration

1. **Settings → Devices & services → Add integration**
2. Search **City Visitor Parking**
3. Select your municipality and sign in
4. Choose your permit
5. (Optional) Give the config entry a short description (useful if you add multiple permits)

> Multiple permits are supported by adding the integration multiple times.

## Options

| Option             | What it does                                              | Notes                                           |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------- |
| Paid time windows  | Defines paid-parking windows per weekday                  | Used for paid/free status + change moment       |
| Auto-end when free | Ends an active session automatically when it becomes free | Handy for “start parking when paid” automations |
| Description        | Renames the config entry in the UI                        | Cosmetic                                        |

**Paid time window format**

- Use 24h format: `HH:MM-HH:MM`
- Multiple windows per day separated by commas
  Example: `09:00-13:00, 14:00-17:30`

## Entities (sensors)

Entities are created per config entry. Find them via:
**Settings → Devices & services → City Visitor Parking → (your entry) → Entities**

Typical sensors:

- **Active sessions**: number of running sessions
- **Remaining balance**: available hours/credit (as provided by the municipality system)
- **Paid or free**: current status + next change time
- **Paid window start/end**: next start/end of the paid window
- **Favorites**: count of saved plates

## Lovelace cards

Cards are optional. They provide quick actions on dashboards.

### Card types

- `custom:city-visitor-parking-card` (main actions: start/update/end + favorites)
- If you use the second JS resource, your installation may also expose an “active reservations” card. If the editor says _Custom element doesn't exist_, double-check the resources and the card type.

### Minimal example

```yaml
type: custom:city-visitor-parking-card
title: Visitor parking
```
````

### Common card options

- `title`
- `icon`
- `theme`
- `config_entry_id` (only needed if you have multiple entries)
- `show_favorites`
- `show_start_time`
- `show_end_time`

### Resources (YAML dashboards only)

Storage mode registers resources automatically. For YAML mode add:

- `/city_visitor_parking/city-visitor-parking-card.js` (type: `module`)
- `/city_visitor_parking/city-visitor-parking-active-card.js` (type: `module`)

## Services

All services run **per config entry**. You can call them from automations/scripts:

- `city_visitor_parking.start_reservation`
- `city_visitor_parking.update_reservation`
- `city_visitor_parking.end_reservation`
- `city_visitor_parking.add_favorite`
- `city_visitor_parking.update_favorite`
- `city_visitor_parking.remove_favorite`
- `city_visitor_parking.list_active_reservations`
- `city_visitor_parking.list_favorites`

**Where to see the exact fields**

- **Developer Tools → Services** and select `city_visitor_parking.*`
- Or check `custom_components/city_visitor_parking/services.yaml`

### Example (script)

```yaml
service: city_visitor_parking.start_reservation
target:
  device_id: YOUR_DEVICE_ID
data:
  license_plate: "12-ABC-3"
  # other fields depend on your municipality/permit
```

## Privacy

- Credentials and raw license plates are not logged.
- Diagnostics redact sensitive values.
- Note: `list_favorites` and `list_active_reservations` return raw license plates in the service response (as intended for automations).

## Troubleshooting

- **Sign-in failed** → open the integration and reauthenticate.
- **Cannot connect** → check network + municipality/provider availability.
- **No permits found** → verify your account has an active visitor parking permit.

Enable debug logging:

```yaml
logger:
  default: info
  logs:
    custom_components.city_visitor_parking: debug
```

## Support

When opening an issue, include:

- What municipality + permit type (no credentials)
- What you tried + expected result
- Relevant debug log excerpt
- A diagnostics file (Home Assistant: **Settings → System → Diagnostics**)

---

# Nederlands

## Functies

- Starten, aanpassen en stoppen van bezoekersparkeersessies
- Status **betaald/gratis** + eerstvolgende omschakelmoment
- Favorieten (kentekens) voor snelle selectie
- Resterend saldo + aantal actieve sessies
- Optioneel automatisch stoppen zodra het gratis wordt
- Optionele Lovelace-kaarten voor snelle bediening

## Snel starten

1. Installeer via HACS.
2. Voeg integratie toe: **Instellingen → Apparaten en diensten → Integratie toevoegen → City Visitor Parking**
3. Kies gemeente → log in → selecteer vergunning.
4. Voeg een Lovelace-kaart toe (optioneel).

## Installatie

### HACS (aanbevolen)

1. Voeg deze repo toe als **Custom repository** (categorie: **Integratie**).
2. Installeer **City Visitor Parking**.
3. Herstart Home Assistant.

### Handmatig

1. Kopieer `custom_components/city_visitor_parking/` naar `custom_components/`.
2. Herstart Home Assistant.

## Configuratie

1. **Instellingen → Apparaten en diensten → Integratie toevoegen**
2. Zoek **City Visitor Parking**
3. Kies je gemeente en log in
4. Selecteer je vergunning
5. (Optioneel) Geef de entry een beschrijving (handig bij meerdere vergunningen)

## Opties

| Optie               | Wat doet het                                 | Opmerking                     |
| ------------------- | -------------------------------------------- | ----------------------------- |
| Betaalvensters      | Stel per weekdag betaalde tijden in          | Voor status + omschakelmoment |
| Automatisch stoppen | Stopt een sessie zodra parkeren gratis wordt | Handig bij automatiseringen   |
| Beschrijving        | Andere naam in de UI                         | Alleen cosmetisch             |

**Formaat betaalvensters**

- 24-uurs: `HH:MM-HH:MM`
- Meerdere vensters: scheiden met komma’s
  Voorbeeld: `09:00-13:00, 14:00-17:30`

## Entiteiten (sensoren)

Per entry worden entiteiten aangemaakt. Je vindt ze via:
**Instellingen → Apparaten en diensten → City Visitor Parking → (entry) → Entiteiten**

Gebruikelijk:

- **Actieve sessies**
- **Resterend saldo**
- **Betaald of gratis** (+ omschakelmoment)
- **Start/einde betaalvenster**
- **Favorieten** (aantal)

## Lovelace-kaarten

Optioneel (integratie werkt ook zonder kaarten).

### Kaarttypes

- `custom:city-visitor-parking-card`
- Mogelijk is er ook een tweede kaart voor actieve sessies (afhankelijk van je resources). Krijg je _Custom element doesn't exist_? Controleer resources + kaarttype.

### Voorbeeld

```yaml
type: custom:city-visitor-parking-card
title: Bezoekersparkeren
```

### Opties

- `title`, `icon`, `theme`
- `config_entry_id` (alleen bij meerdere entries)
- `show_favorites`, `show_start_time`, `show_end_time`

### Resources (alleen bij YAML dashboards)

- `/city_visitor_parking/city-visitor-parking-card.js` (type: `module`)
- `/city_visitor_parking/city-visitor-parking-active-card.js` (type: `module`)

## Diensten

- `city_visitor_parking.start_reservation`
- `city_visitor_parking.update_reservation`
- `city_visitor_parking.end_reservation`
- `city_visitor_parking.add_favorite`
- `city_visitor_parking.update_favorite`
- `city_visitor_parking.remove_favorite`
- `city_visitor_parking.list_active_reservations`
- `city_visitor_parking.list_favorites`

Exacte velden:

- **Ontwikkelaarstools → Diensten**
- of `custom_components/city_visitor_parking/services.yaml`

## Privacy

- Geen logging van inloggegevens of ruwe kentekens.
- Diagnostics verbergen gevoelige waarden.
- Let op: `list_favorites` en `list_active_reservations` geven ruwe kentekens terug in de service response.

## Problemen oplossen

- **Aanmelden mislukt** → reauthenticatie via de integratie.
- **Kan niet verbinden** → netwerk + beschikbaarheid provider/gemeente.
- **Geen vergunningen** → check of je account een actieve bezoekersvergunning heeft.

Debug logging:

```yaml
logger:
  default: info
  logs:
    custom_components.city_visitor_parking: debug
```

## Support

Bij een issue:

- Gemeente + type vergunning (geen inlog)
- Stappen om te reproduceren
- Debug log (relevant stukje)
- Diagnostics bestand
