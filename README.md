<h1><img src="https://raw.githubusercontent.com/sir-Unknown/ha_City-Visitor-Parking/main/custom_components/city_visitor_parking/brand/icon.png" alt="City Visitor Parking" height="40" valign="middle"> City Visitor Parking <a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=sir-Unknown&repository=ha_City-Visitor-Parking&category=integration"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open in HACS" height="28" align="right"></a></h1>
<p><em>Beheer bezoekersparkeervergunningen van Nederlandse gemeenten vanuit Home Assistant.</em></p>

Manage Dutch municipality visitor parking permits directly from Home Assistant. This integration lets you start, update, and end visitor parking sessions without having to open the municipal parking portal. Keep your favorite license plates at hand, see at a glance whether parking is paid or free, and automate your visitor parking with Home Assistant automations and scripts.

The integration supports a growing number of [Dutch municipalities](#supported-municipalities) and connects to their parking systems.

> [!IMPORTANT]
> This integration is under active development — thank you for using it and for your patience! Features may occasionally break, and new versions can sometimes introduce regressions. It is possible that a parking session is not correctly started, updated, or ended.
>
> Please always verify that your session is active through the official parking portal. The maintainer and all contributors cannot be held responsible for incorrectly registered visitor parking sessions or any fines that may result.
>
> This integration is built almost entirely with the help of AI agents, primarily ChatGPT and Claude.

## Screenshots

Visitor parking card

![Visitor parking card](https://raw.githubusercontent.com/wiki/sir-Unknown/ha_City-Visitor-Parking/screenshots/card-reservering-formulier-leeg.png)

Active reservations overview

![Active reservations card](https://raw.githubusercontent.com/wiki/sir-Unknown/ha_City-Visitor-Parking/screenshots/card-reservering-actief-een.png)

More screenshots: [wiki/Lovelace-Cards](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Lovelace-Cards)

## Supported municipalities

| Municipality     |                                                                                         | Municipality    |                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| Amstelveen       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Nijmegen        | [parkeerproducten.nijmegen.nl](https://parkeerproducten.nijmegen.nl/DVSPortal/) |
| Apeldoorn        | [parkeren.apeldoorn.nl](https://parkeren.apeldoorn.nl/DVSPortal/)                       | Nissewaard      | [parkeren.nissewaard.nl](https://parkeren.nissewaard.nl/DVSPortal/)             |
| Assen            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Oldenzaal       | [parkeren.oldenzaal.nl](https://parkeren.oldenzaal.nl/DVSPortal/)               |
| Bergen op Zoom   | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Oosterhout      | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Bloemendaal      | [parkeren.bloemendaal.nl](https://parkeren.bloemendaal.nl/DVSPortal/)                   | Oss             | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Breda            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Rijswijk        | [parkeren.rijswijk.nl](https://parkeren.rijswijk.nl/DVSPortal/)                 |
| Delft            | [vergunningen.parkerendelft.com](https://vergunningen.parkerendelft.com/DVSPortal/)     | Roermond        | [parkeren.roermond.nl](https://parkeren.roermond.nl/DVSPortal/)                 |
| Den Haag         | [parkerendenhaag.denhaag.nl](https://parkerendenhaag.denhaag.nl/)                       | Roosendaal      | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Deventer         | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Sittard-Geleen  | [parkeren.sittard-geleen.nl](https://parkeren.sittard-geleen.nl/DVSPortal/)     |
| Doetinchem       | [parkeren.buha.nl](https://parkeren.buha.nl/DVSPortal/)                                 | Sluis           | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Dordrecht        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Smallingerland  | [parkeren.smallingerland.nl](https://parkeren.smallingerland.nl/DVSPortal/)     |
| Eindhoven        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Súdwest-Fryslân | [parkeren.sudwestfryslan.nl](https://parkeren.sudwestfryslan.nl/DVSPortal/)     |
| Emmen            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Terneuzen       | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Etten-Leur       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Tiel            | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Gorinchem        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Veenendaal      | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Groningen        | [aanvraagparkeren.groningen.nl](https://aanvraagparkeren.groningen.nl/DVSPortal/)       | Veere           | [parkeren.veere.nl](https://parkeren.veere.nl/DVSPortal/)                       |
| Haarlem          | [parkeren.haarlem.nl](https://parkeren.haarlem.nl/DVSPortal/)                           | Venlo           | [parkeren.venlo.nl](https://parkeren.venlo.nl/DVSPortal/)                       |
| Hardenberg       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Vlaardingen     | [mijn.2park.nl](https://mijn.2park.nl/)                                         |
| Harderwijk       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 | Vlissingen      | [parkeren.vlissingen.nl](https://parkeren.vlissingen.nl/DVSPortal/)             |
| Harlingen        | [parkeervergunningen.harlingen.nl](https://parkeervergunningen.harlingen.nl/DVSPortal/) | Waadhoeke       | [parkeren.waadhoeke.nl](https://parkeren.waadhoeke.nl/DVSPortal/)               |
| Heemstede        | [parkeren.heemstede.nl](https://parkeren.heemstede.nl/DVSPortal/)                       | Waalwijk        | [parkeren.waalwijk.nl](https://parkeren.waalwijk.nl/DVSPortal/)                 |
| Heerenveen       | [parkeren.heerenveen.nl](https://parkeren.heerenveen.nl/DVSPortal/)                     | Weert           | [parkeerloket.weert.nl](https://parkeerloket.weert.nl/DVSPortal/)               |
| Heerlen          | [parkeren.heerlen.nl](https://parkeren.heerlen.nl/DVSPortal/)                           | Zaanstad        | [parkeren.zaanstad.nl](https://parkeren.zaanstad.nl/DVSPortal/)                 |
| Hengelo          | [parkeren.hengelo.nl](https://parkeren.hengelo.nl/DVSPortal/)                           | Zevenaar        | [parkeren.zevenaar.nl](https://parkeren.zevenaar.nl/DVSPortal/)                 |
| 's-Hertogenbosch | [parkeren.s-hertogenbosch.nl](https://parkeren.s-hertogenbosch.nl/DVSPortal/)           | Zutphen         | [parkeren.zutphen.nl](https://parkeren.zutphen.nl/DVSPortal/)                   |
| Katwijk          | [parkeren.katwijk.nl](https://parkeren.katwijk.nl/DVSPortal/)                           | Zwolle          | [parkeerloket.zwolle.nl](https://parkeerloket.zwolle.nl/DVSPortal/)             |
| Leiden           | [parkeren.leiden.nl](https://parkeren.leiden.nl/DVSPortal/)                             |                 |                                                                                 |
| Maastricht       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |                 |                                                                                 |
| Middelburg       | [parkeren.middelburg.nl](https://parkeren.middelburg.nl/DVSPortal/)                     |                 |                                                                                 |

## Requesting support for additional municipalities

Is your municipality not listed? Please [open an issue](https://github.com/sir-Unknown/ha_City-Visitor-Parking/issues/new) to request support. Note that adding a new municipality requires active collaboration: you will be asked to provide diagnostic logging and, if needed, give the maintainer temporary access to your parking portal account to investigate how the system works.

## Documentation

- English: [wiki](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki)
- Nederlands: [wiki/Nederlands](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Nederlands)
- Library: [pyCityVisitorParking](https://github.com/sir-Unknown/pyCityVisitorParking)
- Library README: [pyCityVisitorParking README](https://github.com/sir-Unknown/pyCityVisitorParking#readme)
- PyPI: [pycityvisitorparking](https://pypi.org/project/pycityvisitorparking/)

Quick links:

- Installation: [wiki/Installation](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Installation)
- Configuration: [wiki/Configuration](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Configuration)
- Lovelace cards: [wiki/Lovelace-Cards](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Lovelace-Cards)
- Services: [wiki/Services](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Services)
- Blueprints: [wiki/Blueprints](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Blueprints)
- Troubleshooting: [wiki/Troubleshooting](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Troubleshooting)
- Privacy: [wiki/Privacy](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Privacy)
- Examples: [wiki/Examples](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Examples)
