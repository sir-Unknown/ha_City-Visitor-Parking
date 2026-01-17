# City Visitor Parking documentatie

## Introductie

City Visitor Parking laat je bezoekersparkeren van Nederlandse gemeenten beheren in Home Assistant.

## Use cases

- Start een parkeersessie vanaf een dashboardkaart of automatisering.
- Wijzig/verleng een lopende sessie wanneer plannen veranderen.
- Stop een sessie handmatig of automatisch zodra parkeren gratis wordt.
- Monitor betaald/gratis en resterend saldo.
- Gebruik favorieten om snel kentekens te kiezen.

## Supported devices and services

Deze integratie koppelt met bezoekersparkeerportalen van gemeenten (providers).

Ondersteunde providers staan in:

- `custom_components/city_visitor_parking/providers.yaml`

## Supported functionality

- Inloggen op het providerportaal.
- Vergunningen ophalen en selecteren.
- Sessies starten, wijzigen en stoppen.
- Favorieten beheren (toevoegen, wijzigen, verwijderen).
- Favorieten en actieve sessies opvragen voor automatiseringen.

## Known limitations

- Status betaald/gratis is gebaseerd op ingestelde betaalvensters.
- Beschikbare service-velden kunnen per gemeente/provider verschillen.
- Providerportalen kunnen wijzigen zonder aankondiging.

## Data update

- Data wordt periodiek ververst voor sensoren en sessiestatus.
- Na service calls (start/wijzig/stop) ververst Home Assistant zodat wijzigingen snel zichtbaar zijn.

## Installatie

Zie de root README voor installatiestappen.

## Configuratie

1. Ga naar **Instellingen** > **Apparaten en diensten**.
2. Kies **Integratie toevoegen**.
3. Zoek **City Visitor Parking**.
4. Kies je gemeente, log in, en selecteer je vergunning.
5. Optioneel: Geef een beschrijving om entries te onderscheiden.

Meerdere vergunningen? Voeg de integratie meerdere keren toe.

## Volgende stappen

- Lovelace-kaarten: [../cards.md](../cards.md)
- Diensten: [../services.md](../services.md)
- Problemen oplossen: [../troubleshooting.md](../troubleshooting.md)
- Privacy: [../privacy.md](../privacy.md)
- Voorbeelden: [../examples/automations.md](../examples/automations.md)
