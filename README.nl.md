<h1 align="center">
  <img src="https://raw.githubusercontent.com/sir-Unknown/ha_City-Visitor-Parking/main/custom_components/city_visitor_parking/brand/icon@2x.png" alt="City Visitor Parking" height="80">
  <br>
  City Visitor Parking
  <br>
  <sub><span style="font-size: 0.7em;">Beheer bezoekersparkeren in Home Assistant</span></sub>
</h1>

<p align="center">
  <sub>Deze integratie is gratis en open source. Bespaart het je een bezoek aan het parkeerportaal, dan wordt een biertje zeer gewaardeerd! 🍺</sub>
</p>

<p align="center">
  <a href="https://github.com/sponsors/sir-Unknown">
    <img src="https://img.shields.io/badge/Buy%20me%20a%20beer-111111?style=for-the-badge&logo=buymeacoffee&logoColor=ffdd00" alt="Trakteer me op een biertje">
  </a>
</p>

<!-- ha-marketplace:exclude-start -->
<p align="center">
  <a href="https://my.home-assistant.io/redirect/config_flow_start/?domain=city_visitor_parking">
    <img src="https://my.home-assistant.io/badges/config_flow_start.svg" alt="Open je Home Assistant en start de installatie van City Visitor Parking.">
  </a>
</p>

<p align="center">
  <a href="https://my.home-assistant.io/redirect/marketplace_repository/?owner=sir-Unknown&repository=ha_City-Visitor-Parking&category=integration">
    <img src="https://my.home-assistant.io/badges/marketplace_repository.svg" alt="Open je Home Assistant en open deze repository in de Marketplace.">
  </a>
</p>

> [!TIP]
> Op zoek naar Engelstalige documentatie? Zie de [Engelse README](README.md) of de [wiki](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki)

<!-- ha-marketplace:exclude-end -->

## Over deze integratie

Met **City Visitor Parking** beheer je bezoekersparkeervergunningen van ondersteunde Nederlandse gemeenten rechtstreeks vanuit Home Assistant.

Met deze integratie kun je:

- een parkeersessie starten, wijzigen en stoppen
- snel een opgeslagen kenteken kiezen
- het parkeergebied kiezen bij vergunningen voor meerdere parkeergebieden
- direct zien of parkeren betaald of gratis is
- bezoekersparkeren automatiseren met Home Assistant-automatiseringen en -scripts

Zo hoef je niet elke keer handmatig in te loggen op het parkeerportaal van de gemeente.

---

## Apparaat- en entiteitsnamen

Elke vergunning krijgt één apparaat met de naam `{gemeente} - {vergunnings-ID}`, en de entiteit-ID's beginnen met die naam. Sommige gemeenten gebruiken lange vergunnings-ID's. Voor kortere entiteit-ID's hernoem je het apparaat via **Instellingen** → **Apparaten & diensten** → **Apparaten** en laat je Home Assistant ook de entiteit-ID's hernoemen. Pas daarna automatiseringen en dashboards aan die de oude entiteit-ID's gebruiken.

---

## Belangrijk

> [!IMPORTANT]
> Deze integratie wordt actief ontwikkeld. Daardoor kunnen functies af en toe niet goed werken en kunnen nieuwe versies fouten introduceren.
>
> Controleer altijd in het officiële parkeerportaal dat een sessie correct is gestart, gewijzigd of gestopt.
>
> De beheerder en bijdragers kunnen niet aansprakelijk worden gesteld voor onjuist geregistreerde parkeersessies of eventuele boetes die daaruit voortvloeien.
>
> Deze integratie is grotendeels ontwikkeld met hulp van AI-agents, voornamelijk ChatGPT en Claude.

---

## Schermafbeeldingen

![City Visitor Parking](https://raw.githubusercontent.com/wiki/sir-Unknown/ha_City-Visitor-Parking/screenshots/card-reservering-twee-actief.png)

Meer schermafbeeldingen: [wiki/en/Lovelace-Cards](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/lovelace-cards)

---

## Ondersteunde gemeenten

De integratie ondersteunt een groeiend aantal Nederlandse gemeenten en maakt verbinding met hun bezoekersparkeersystemen.

| Letter | Gemeente         | Portaal                                                                                 |
| ------ | ---------------- | --------------------------------------------------------------------------------------- |
| **A**  | Amstelveen       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Amsterdam        | [parkeervergunningen.amsterdam.nl](https://parkeervergunningen.amsterdam.nl/login-ssp)  |
|        | Apeldoorn        | [parkeren.apeldoorn.nl](https://parkeren.apeldoorn.nl/DVSPortal/)                       |
|        | Assen            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| **B**  | Bergen op Zoom   | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Bloemendaal      | [parkeren.bloemendaal.nl](https://parkeren.bloemendaal.nl/DVSPortal/)                   |
|        | Breda            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| **D**  | Delft            | [vergunningen.parkerendelft.com](https://vergunningen.parkerendelft.com/DVSPortal/)     |
|        | Den Haag         | [parkerendenhaag.denhaag.nl](https://parkerendenhaag.denhaag.nl/)                       |
|        | Deventer         | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Doetinchem       | [parkeren.buha.nl](https://parkeren.buha.nl/DVSPortal/)                                 |
|        | Dordrecht        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| **E**  | Eindhoven        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Emmen            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Etten-Leur       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| **G**  | Gorinchem        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Groningen        | [aanvraagparkeren.groningen.nl](https://aanvraagparkeren.groningen.nl/DVSPortal/)       |
| **H**  | Haarlem          | [parkeren.haarlem.nl](https://parkeren.haarlem.nl/DVSPortal/)                           |
|        | Hardenberg       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Harderwijk       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Harlingen        | [parkeervergunningen.harlingen.nl](https://parkeervergunningen.harlingen.nl/DVSPortal/) |
|        | Heemstede        | [parkeren.heemstede.nl](https://parkeren.heemstede.nl/DVSPortal/)                       |
|        | Heerenveen       | [parkeren.heerenveen.nl](https://parkeren.heerenveen.nl/DVSPortal/)                     |
|        | Heerlen          | [parkeren.heerlen.nl](https://parkeren.heerlen.nl/DVSPortal/)                           |
|        | Hengelo          | [parkeren.hengelo.nl](https://parkeren.hengelo.nl/DVSPortal/)                           |
|        | 's-Hertogenbosch | [parkeren.s-hertogenbosch.nl](https://parkeren.s-hertogenbosch.nl/DVSPortal/)           |
|        | Hoorn            | [parkeren.hoorn.nl](https://parkeren.hoorn.nl/DVSPortal/)                               |
| **K**  | Katwijk          | [parkeren.katwijk.nl](https://parkeren.katwijk.nl/DVSPortal/)                           |
| **L**  | Leiden           | [parkeren.leiden.nl](https://parkeren.leiden.nl/DVSPortal/)                             |
| **M**  | Maastricht       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Middelburg       | [parkeren.middelburg.nl](https://parkeren.middelburg.nl/DVSPortal/)                     |
| **N**  | Nijmegen         | [parkeerproducten.nijmegen.nl](https://parkeerproducten.nijmegen.nl/DVSPortal/)         |
|        | Nissewaard       | [parkeren.nissewaard.nl](https://parkeren.nissewaard.nl/DVSPortal/)                     |
| **O**  | Oldenzaal        | [parkeren.oldenzaal.nl](https://parkeren.oldenzaal.nl/DVSPortal/)                       |
|        | Oosterhout       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Oss              | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| **R**  | Rijswijk         | [parkeren.rijswijk.nl](https://parkeren.rijswijk.nl/DVSPortal/)                         |
|        | Roermond         | [parkeren.roermond.nl](https://parkeren.roermond.nl/DVSPortal/)                         |
|        | Roosendaal       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Rotterdam        | [bezoek.rotterdam.nl](https://bezoek.rotterdam.nl/)                                     |
| **S**  | Sittard-Geleen   | [parkeren.sittard-geleen.nl](https://parkeren.sittard-geleen.nl/DVSPortal/)             |
|        | Sluis            | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Smallingerland   | [parkeren.smallingerland.nl](https://parkeren.smallingerland.nl/DVSPortal/)             |
|        | Súdwest-Fryslân  | [parkeren.sudwestfryslan.nl](https://parkeren.sudwestfryslan.nl/DVSPortal/)             |
| **T**  | Terneuzen        | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Tiel             | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
| **V**  | Veenendaal       | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Veere            | [parkeren.veere.nl](https://parkeren.veere.nl/DVSPortal/)                               |
|        | Venlo            | [parkeren.venlo.nl](https://parkeren.venlo.nl/DVSPortal/)                               |
|        | Vlaardingen      | [mijn.2park.nl](https://mijn.2park.nl/)                                                 |
|        | Vlissingen       | [parkeren.vlissingen.nl](https://parkeren.vlissingen.nl/DVSPortal/)                     |
| **W**  | Waadhoeke        | [parkeren.waadhoeke.nl](https://parkeren.waadhoeke.nl/DVSPortal/)                       |
|        | Waalwijk         | [parkeren.waalwijk.nl](https://parkeren.waalwijk.nl/DVSPortal/)                         |
|        | Weert            | [parkeerloket.weert.nl](https://parkeerloket.weert.nl/DVSPortal/)                       |
| **Z**  | Zaanstad         | [parkeren.zaanstad.nl](https://parkeren.zaanstad.nl/DVSPortal/)                         |
|        | Zevenaar         | [parkeren.zevenaar.nl](https://parkeren.zevenaar.nl/DVSPortal/)                         |
|        | Zutphen          | [parkeren.zutphen.nl](https://parkeren.zutphen.nl/DVSPortal/)                           |
|        | Zwolle           | [parkeerloket.zwolle.nl](https://parkeerloket.zwolle.nl/DVSPortal/)                     |

**Amsterdam:** vul bij gebruikersnaam je _meldcode_ in en bij wachtwoord je _pincode_, de codes waarmee je inlogt op [Mijn Parkeren](https://parkeervergunningen.amsterdam.nl/login-ssp). Je vindt ze op de pagina van je vergunning in Mijn Parkeren nadat je bent ingelogd met DigiD of eHerkenning.

---

## Ontbreekt jouw gemeente?

Staat jouw gemeente er nog niet bij, dan kun je ondersteuning aanvragen via GitHub Issues:

- [Ondersteuning aanvragen](https://github.com/sir-Unknown/ha_City-Visitor-Parking/issues/new)

Ondersteuning voor een nieuwe gemeente toevoegen vraagt nauwe samenwerking. Mogelijk word je gevraagd om:

- diagnostische logging aan te leveren
- tijdelijk toegang te geven tot je account op het parkeerportaal voor onderzoek

Meer informatie:

- [Add municipalities (EN)](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/add-municipalities)
- [Gemeenten toevoegen (NL)](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/gemeenten-toevoegen)

---

## Documentatie

### Nederlands

- [Home](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Home)
<!-- ha-marketplace:exclude-start -->
- [Installatie](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Installatie)
<!-- ha-marketplace:exclude-end -->
- [Configuratie](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Configuratie)
- [Diensten](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Diensten)
- [Probleemoplossing](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Probleemoplossing)
- [Voorbeelden](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Voorbeelden)

### English

- [Home](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Home)
<!-- ha-marketplace:exclude-start -->
- [Installation](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Installation)
<!-- ha-marketplace:exclude-end -->
- [Configuration](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Configuration)
- [Lovelace Cards](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Lovelace-Cards)
- [Services](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Services)
- [Blueprints](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Blueprints)
- [Troubleshooting](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Troubleshooting)
- [Privacy](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Privacy)
- [Examples](https://github.com/sir-Unknown/ha_City-Visitor-Parking/wiki/Examples)

### Bibliotheek

- [pyCityVisitorParking](https://github.com/sir-Unknown/pyCityVisitorParking)
- [README](https://github.com/sir-Unknown/pyCityVisitorParking#readme)
- [PyPI: pycityvisitorparking](https://pypi.org/project/pycityvisitorparking/)
