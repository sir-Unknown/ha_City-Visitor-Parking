<h1 align="center">
  <img src="https://raw.githubusercontent.com/sir-Unknown/ha_City-Visitor-Parking/main/custom_components/city_visitor_parking/brand/icon@2x.png" alt="City Visitor Parking" height="80">
  <br>
  City Visitor Parking
  <br>
  <sub><span style="font-size: 0.7em;">Beheer bezoekersparkeren in Home Assistant</span></sub>
</h1>

<p align="center">
  <sub>This integration is free and open source. If it saves you a trip to the parking portal, a beer is always appreciated! 🍺</sub>
</p>

<p align="center">
  <a href="https://github.com/sponsors/sir-Unknown">
    <img src="https://img.shields.io/badge/Buy%20me%20a%20beer-111111?style=for-the-badge&logo=buymeacoffee&logoColor=ffdd00" alt="Buy me a beer">
  </a>
</p>

> [!TIP]
> Looking for English documentation? See: [wiki/en/Home](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Home)<br>
> Looking for Dutch documentation? See: [wiki/nl/Home](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/nl/Home)

---

## About this integration

With **City Visitor Parking**, you can manage visitor parking permits for supported Dutch municipalities directly from Home Assistant.

With this integration, you can:

- start, update, and stop a parking session
- quickly select a saved license plate
- instantly see whether parking is paid or free
- automate visitor parking using Home Assistant automations and scripts

This means you no longer have to manually log in to the municipal parking portal every time.

---

## Important

> [!IMPORTANT]
> This integration is under active development. As a result, some features may occasionally stop working correctly, and new versions may introduce regressions.
>
> Always verify in the official parking portal that a session has been started, updated, or stopped correctly.
>
> The maintainer and contributors cannot be held responsible for incorrectly registered parking sessions or any resulting fines.
>
> This integration was developed largely with the help of AI agents, primarily ChatGPT and Claude.

---

## Screenshots

![City Visitor Parking](https://raw.githubusercontent.com/wiki/sir-Unknown/ha_City-Visitor-Parking/screenshots/card-reservering-twee-actief.png)

More screenshots: [wiki/en/Lovelace-Cards](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Lovelace-Cards)

---

## Supported municipalities

The integration supports a growing number of Dutch municipalities and connects to their visitor parking systems.

<details>
<summary><strong>Show supported municipalities</strong></summary>

| Municipality     | Portal                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- |
| Amstelveen       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Nijmegen         | [parkeerproducten.nijmegen.nl](https://parkeerproducten.nijmegen.nl/DVSPortal/)         |
| Apeldoorn        | [parkeren.apeldoorn.nl](https://parkeren.apeldoorn.nl/DVSPortal/)                       |
| Nissewaard       | [parkeren.nissewaard.nl](https://parkeren.nissewaard.nl/DVSPortal/)                     |
| Assen            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Oldenzaal        | [parkeren.oldenzaal.nl](https://parkeren.oldenzaal.nl/DVSPortal/)                       |
| Bergen op Zoom   | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Oosterhout       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Bloemendaal      | [parkeren.bloemendaal.nl](https://parkeren.bloemendaal.nl/DVSPortal/)                   |
| Oss              | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Breda            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Rijswijk         | [parkeren.rijswijk.nl](https://parkeren.rijswijk.nl/DVSPortal/)                         |
| Delft            | [vergunningen.parkerendelft.com](https://vergunningen.parkerendelft.com/DVSPortal/)     |
| Roermond         | [parkeren.roermond.nl](https://parkeren.roermond.nl/DVSPortal/)                         |
| Den Haag         | [parkerendenhaag.denhaag.nl](https://parkerendenhaag.denhaag.nl/)                       |
| Roosendaal       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Deventer         | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Sittard-Geleen   | [parkeren.sittard-geleen.nl](https://parkeren.sittard-geleen.nl/DVSPortal/)             |
| Doetinchem       | [parkeren.buha.nl](https://parkeren.buha.nl/DVSPortal/)                                 |
| Sluis            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Dordrecht        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Smallingerland   | [parkeren.smallingerland.nl](https://parkeren.smallingerland.nl/DVSPortal/)             |
| Eindhoven        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Súdwest-Fryslân  | [parkeren.sudwestfryslan.nl](https://parkeren.sudwestfryslan.nl/DVSPortal/)             |
| Emmen            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Terneuzen        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Etten-Leur       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Tiel             | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Gorinchem        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Veenendaal       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Groningen        | [aanvraagparkeren.groningen.nl](https://aanvraagparkeren.groningen.nl/DVSPortal/)       |
| Veere            | [parkeren.veere.nl](https://parkeren.veere.nl/DVSPortal/)                               |
| Haarlem          | [parkeren.haarlem.nl](https://parkeren.haarlem.nl/DVSPortal/)                           |
| Venlo            | [parkeren.venlo.nl](https://parkeren.venlo.nl/DVSPortal/)                               |
| Hardenberg       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Vlaardingen      | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Harderwijk       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Vlissingen       | [parkeren.vlissingen.nl](https://parkeren.vlissingen.nl/DVSPortal/)                     |
| Harlingen        | [parkeervergunningen.harlingen.nl](https://parkeervergunningen.harlingen.nl/DVSPortal/) |
| Waadhoeke        | [parkeren.waadhoeke.nl](https://parkeren.waadhoeke.nl/DVSPortal/)                       |
| Heemstede        | [parkeren.heemstede.nl](https://parkeren.heemstede.nl/DVSPortal/)                       |
| Waalwijk         | [parkeren.waalwijk.nl](https://parkeren.waalwijk.nl/DVSPortal/)                         |
| Heerenveen       | [parkeren.heerenveen.nl](https://parkeren.heerenveen.nl/DVSPortal/)                     |
| Weert            | [parkeerloket.weert.nl](https://parkeerloket.weert.nl/DVSPortal/)                       |
| Heerlen          | [parkeren.heerlen.nl](https://parkeren.heerlen.nl/DVSPortal/)                           |
| Zaanstad         | [parkeren.zaanstad.nl](https://parkeren.zaanstad.nl/DVSPortal/)                         |
| Hengelo          | [parkeren.hengelo.nl](https://parkeren.hengelo.nl/DVSPortal/)                           |
| Zevenaar         | [parkeren.zevenaar.nl](https://parkeren.zevenaar.nl/DVSPortal/)                         |
| 's-Hertogenbosch | [parkeren.s-hertogenbosch.nl](https://parkeren.s-hertogenbosch.nl/DVSPortal/)           |
| Zutphen          | [parkeren.zutphen.nl](https://parkeren.zutphen.nl/DVSPortal/)                           |
| Katwijk          | [parkeren.katwijk.nl](https://parkeren.katwijk.nl/DVSPortal/)                           |
| Zwolle           | [parkeerloket.zwolle.nl](https://parkeerloket.zwolle.nl/DVSPortal/)                     |
| Leiden           | [parkeren.leiden.nl](https://parkeren.leiden.nl/DVSPortal/)                             |
| Maastricht       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| Middelburg       | [parkeren.middelburg.nl](https://parkeren.middelburg.nl/DVSPortal/)                     |

</details>

---

## Is your municipality missing?

If your municipality is not listed yet, you can request support through GitHub Issues:

- [Request support](https://github.com/sir-Unknown/ha_City-Visitor-Parking/issues/new)

Adding support for a new municipality requires active collaboration. You may be asked to:

- provide diagnostic logging
- give temporary access to your parking portal account for investigation

More information:

- [Add municipalities (EN)](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/add-municipalities)
- [Gemeenten toevoegen (NL)](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/nl/gemeenten-toevoegen)

---

## Documentation

### English

- [Home](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Home)
- [Installation](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Installation)
- [Configuration](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Configuration)
- [Lovelace Cards](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Lovelace-Cards)
- [Services](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Services)
- [Blueprints](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Blueprints)
- [Troubleshooting](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Troubleshooting)
- [Privacy](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Privacy)
- [Examples](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/en/Examples)

### Nederlands

- [Home](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/nl/Home)

### Library

- [pyCityVisitorParking](https://github.com/sir-Unknown/pyCityVisitorParking)
- [README](https://github.com/sir-Unknown/pyCityVisitorParking#readme)
- [PyPI: pycityvisitorparking](https://pypi.org/project/pycityvisitorparking/)
