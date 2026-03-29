# City Visitor Parking — Blueprints

This directory contains Home Assistant automation blueprints for the [City Visitor Parking](https://github.com/sir-Unknown/ha_City-Visitor-Parking#readme) integration.

---

## Available blueprints

| File | Language |
|---|---|
| `smart_parking_registration_en.yaml` | English |
| `smart_parking_registration_nl.yaml` | Dutch |

Both blueprints are functionally identical — only the labels, descriptions, and default texts differ.

---

## Blueprint: Automatic Parking Registration

Automate visitor parking using zone detection, Bluetooth, and mobile notifications. The automation runs fully in the background — you only receive a notification when action is needed.

### Requirements

- Home Assistant with the **City Visitor Parking** integration installed and configured
- Home Assistant Companion App on your phone (for notifications and Bluetooth detection)

### How it works

| Situation | Action |
|---|---|
| 🚗 Arriving in the zone | Notification to register the license plate (Bluetooth required) |
| 📵 Bluetooth disconnects on arrival | Notification appears immediately, without delay |
| ⏰ Active reservation | Hourly reminder; notification if canceled externally |
| 🔵 Bluetooth connects in the zone | Arrival notification also appears if BT connects later |
| 🔵 Bluetooth connects outside the zone | Immediate notification to unregister |
| ⚠️ Leaving without registration | Persistent warning |

---

## Installation

### Via button (recommended)

Import the blueprint directly into Home Assistant using the button below:

**English:**
[![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fsir-Unknown%2Fha_City-Visitor-Parking%2Fblob%2Fmain%2Fblueprints%2Fsmart_parking_registration_en.yaml)

**Nederlands:**
[![Importeer blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fsir-Unknown%2Fha_City-Visitor-Parking%2Fblob%2Fmain%2Fblueprints%2Fsmart_parking_registration_nl.yaml)

### Manual

1. Copy the desired `.yaml` file to the `config/blueprints/automation/` directory in your Home Assistant configuration folder.
2. Restart Home Assistant or reload blueprints via **Settings → Automations → Blueprints → Reload**.
3. Create a new automation based on the blueprint.

---

## Configuration

The blueprint is divided into five sections:

### 1. Parking integration

| Field | Description |
|---|---|
| **Parking permit** | The City Visitor Parking device used to start, stop, and check reservations |

### 2. Location and vehicle

| Field | Description | Required |
|---|---|---|
| **Person** | The `person` entity whose location is tracked | Yes |
| **License plate** | The license plate to register (spaces removed, letters uppercased automatically) | Yes |
| **Zone** | The zone in which the automation is active | Yes |
| **Device tracker** | Optional extra tracker when the person or zone trigger alone is not reliable enough | No |

### 3. Phone and Bluetooth

| Field | Description | Required |
|---|---|---|
| **Receive notifications on** | The mobile device that receives notifications and action buttons | Yes |
| **Bluetooth device** | The device whose Bluetooth status is monitored | Yes |
| **Bluetooth device name** | Name of the Bluetooth device (car or car kit) as shown in the Companion App | At least one of the two |
| **Bluetooth MAC address** | MAC address as an alternative or extra check alongside the name | At least one of the two |
| **Dashboard URL** | Path to the HA dashboard opened via the notification button (e.g. `/lovelace/parking`) | No |

### 4. Advanced *(collapsed by default)*

| Field | Default | Description |
|---|---|---|
| **Notification timeout** | 1 minute | How long the automation waits for a response to a mobile notification |
| **Arrival delay** | 5 s | Extra wait time after arrival to let GPS/Bluetooth status settle |
| **Departure delay** | 30 s | Extra wait time after departure before checking zone status |

### 5. Texts and buttons *(collapsed by default)*

All notification texts and button labels are fully customizable. The following variables are available in message texts:

| Variable | Description |
|---|---|
| `{{ license_plate_clean }}` | The license plate in uppercase without spaces |
| `{{ start_time_display }}` | Start time of the active reservation |
| `{{ end_time_display }}` | End time of the active reservation |

---

## More information

- [Integration documentation](https://github.com/sir-Unknown/ha_City-Visitor-Parking#readme)
- [Issues & feedback](https://github.com/sir-Unknown/ha_City-Visitor-Parking/issues)
