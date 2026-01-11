# City Visitor Parking 🚗

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=sir-Unknown&repository=ha_City-Visitor-Parking&category=integration)

Manage Dutch municipality visitor parking permits directly from Home Assistant. Start, update, and end sessions, see paid and free windows, and keep favorite license plates ready.

## 📌 Table of contents

- [English](#english)
  - [Features](#features)
  - [Installation (HACS)](#installation-hacs)
  - [Manual installation](#manual-installation)
  - [Configuration](#configuration)
  - [Options](#options)
  - [Sensors](#sensors)
  - [Lovelace card](#lovelace-card)
  - [Services](#services)
  - [Privacy and data](#privacy-and-data)
  - [Troubleshooting](#troubleshooting)
- [Nederlands](#nederlands)
  - [Functies](#functies)
  - [Installatie (HACS)](#installatie-hacs)
  - [Handmatige installatie](#handmatige-installatie)
  - [Configuratie](#configuratie)
  - [Opties](#opties)
  - [Sensoren](#sensoren)
  - [Lovelace-kaart](#lovelace-kaart)
  - [Diensten](#diensten)
  - [Privacy en gegevens](#privacy-en-gegevens)
  - [Problemen oplossen](#problemen-oplossen)

## English

City Visitor Parking helps you manage visitor parking permits from Dutch municipalities directly in Home Assistant. It is built for residents and small businesses who need to start, update, and end sessions quickly, see when parking is paid or free, and keep favorite license plates ready.

### ✨ Features

- ✅ Start, update, and end visitor parking sessions from Home Assistant
- 🕒 See paid or free status and when it changes
- ⭐ Save favorite license plates for quick selection
- 📉 Track remaining permit balance and active sessions
- 🛑 Optional auto-end when parking becomes free
- 🧰 Handy dashboard card for quick access

### 📦 Installation (HACS)

1. ➕ Add this repository in HACS as a custom repository (category: Integration).
2. 📦 Install **City Visitor Parking** from HACS.
3. 🔁 Restart Home Assistant.

### 🛠️ Manual installation

1. 📁 Copy `custom_components/city_visitor_parking/` into your Home Assistant `custom_components/` folder.
2. 🔁 Restart Home Assistant.

### ⚙️ Configuration

1. ⚙️ Go to **Settings** → **Devices & services** → **Add integration**.
2. 🔍 Search for **City Visitor Parking**.
3. 🏙️ Pick your municipality, sign in, and choose your permit.
4. 🏷️ Optionally add a short description so you can tell entries apart.

### 🧩 Options

| Option | Description | Example |
| --- | --- | --- |
| Paid time windows | Set paid hours per weekday | `09:00-13:00, 14:00-17:30` |
| Auto-end when free | Automatically end an active session when parking becomes free | Enabled/disabled |
| Description | Rename the entry as shown in the UI | `Office permit` |

### 📊 Sensors

| Sensor | What it shows |
| --- | --- |
| Active sessions | How many visitor sessions are currently running |
| Remaining balance | How many hours you still have available |
| Paid or free | Whether the zone is currently paid or free, plus when that changes |
| Paid window start/end | The next start and end time for paid parking |
| Favorites | How many license plates you have saved |

### 🧰 Lovelace card

Optional dashboard card for quick actions.

- 🧩 Card type: `custom:city-visitor-parking-card`
- 🧪 Optional config: `title`, `icon`, `theme`, `config_entry_id`, `show_favorites`, `show_start_time`, `show_end_time`

Example:

```yaml
type: custom:city-visitor-parking-card
title: Visitor parking
```

Resource notes:

- ✅ Resources are registered automatically in dashboard storage mode.
- 🧾 If you use YAML mode, add the resources manually:
  - Settings → Dashboards → Resources
  - `/city_visitor_parking/city-visitor-parking-card.js` (type `Module`)
  - `/city_visitor_parking/city-visitor-parking-active-card.js` (type `Module`)

### 🧪 Services

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

### 🔒 Privacy and data

The integration never logs credentials or raw license plates. Diagnostic reports hide sensitive values. Note that `list_favorites` and `list_active_reservations` return raw license plates in the service response.

### 🩺 Troubleshooting

- 🔑 **Sign-in failed**: Open the integration and reauthenticate.
- 🌐 **Cannot connect**: Check your network and the provider status.
- 🪪 **No permits**: Make sure your account has active visitor parking permits.

## Nederlands

City Visitor Parking helpt je om bezoekersparkeren van Nederlandse gemeenten direct in Home Assistant te beheren. Het is bedoeld voor bewoners en kleine bedrijven die snel een parkeersessie willen starten of stoppen, willen zien of parkeren betaald of gratis is, en vaste kentekens bij de hand willen houden.

### ✨ Functies

- ✅ Start, wijzig en beëindig parkeersessies in Home Assistant
- 🕒 Zie direct of parkeren betaald of gratis is en wanneer dit wisselt
- ⭐ Sla favoriete kentekens op voor snelle selectie
- 📉 Bekijk het resterende saldo en actieve sessies
- 🛑 Automatisch stoppen zodra parkeren gratis wordt (optioneel)
- 🧰 Handige dashboardkaart voor snelle acties

### 📦 Installatie (HACS)

1. ➕ Voeg deze repository toe als custom repository in HACS (categorie: Integratie).
2. 📦 Installeer **City Visitor Parking** via HACS.
3. 🔁 Herstart Home Assistant.

### 🛠️ Handmatige installatie

1. 📁 Kopieer `custom_components/city_visitor_parking/` naar je Home Assistant `custom_components/` map.
2. 🔁 Herstart Home Assistant.

### ⚙️ Configuratie

1. ⚙️ Ga naar **Instellingen** → **Apparaten en diensten** → **Integratie toevoegen**.
2. 🔍 Zoek naar **City Visitor Parking**.
3. 🏙️ Kies je gemeente, meld je aan en selecteer een vergunning.
4. 🏷️ Voeg eventueel een korte beschrijving toe zodat je entries kunt onderscheiden.

### 🧩 Opties

| Optie | Beschrijving | Voorbeeld |
| --- | --- | --- |
| Betaalvensters | Stel per weekdag betaalde tijden in | `09:00-13:00, 14:00-17:30` |
| Automatisch stoppen | Beëindig een actieve sessie automatisch zodra parkeren gratis wordt | Aan/uit |
| Beschrijving | Hernoem de entry zoals zichtbaar in de UI | `Vergunning kantoor` |

### 📊 Sensoren

| Sensor | Wat je ziet |
| --- | --- |
| Actieve sessies | Hoeveel sessies op dit moment lopen |
| Resterend saldo | Hoeveel uur je nog beschikbaar hebt |
| Betaald of gratis | Of de zone betaald of gratis is, inclusief het omslagmoment |
| Start/einde betaalvenster | Het volgende start- en eindmoment voor betaald parkeren |
| Favorieten | Hoeveel kentekens je hebt opgeslagen |

### 🧰 Lovelace-kaart

Optionele dashboardkaart voor snelle acties.

- 🧩 Kaarttype: `custom:city-visitor-parking-card`
- 🧪 Optioneel: `title`, `icon`, `theme`, `config_entry_id`, `show_favorites`, `show_start_time`, `show_end_time`

Voorbeeld:

```yaml
type: custom:city-visitor-parking-card
title: Bezoekersparkeren
```

Resource-notities:

- ✅ Resources worden automatisch geregistreerd in dashboard storage mode.
- 🧾 Gebruik je YAML mode, voeg dan handmatig toe:
  - Instellingen → Dashboards → Resources
  - `/city_visitor_parking/city-visitor-parking-card.js` (type `Module`)
  - `/city_visitor_parking/city-visitor-parking-active-card.js` (type `Module`)

### 🧪 Diensten

Voor geavanceerde automatiseringen kun je deze diensten direct aanroepen (elk werkt op één entry):

- `city_visitor_parking.start_reservation`
- `city_visitor_parking.update_reservation`
- `city_visitor_parking.end_reservation`
- `city_visitor_parking.add_favorite`
- `city_visitor_parking.update_favorite`
- `city_visitor_parking.remove_favorite`
- `city_visitor_parking.list_active_reservations` (geeft kenteken en favorietgegevens terug indien beschikbaar)
- `city_visitor_parking.list_favorites` (geeft ruwe kentekens terug)

Zie `custom_components/city_visitor_parking/services.yaml` voor de volledige schema’s.

### 🔒 Privacy en gegevens

De integratie logt nooit inloggegevens of ruwe kentekens. Diagnostische rapporten verbergen gevoelige waarden. Let op: `list_favorites` en `list_active_reservations` geven ruwe kentekens terug in de service response.

### 🩺 Problemen oplossen

- 🔑 **Aanmelden mislukt**: Open de integratie en doorloop opnieuw de reauthenticatie.
- 🌐 **Kan niet verbinden**: Controleer je netwerk en de status van de provider.
- 🪪 **Geen vergunningen**: Controleer of je account actieve bezoekersvergunningen heeft.
