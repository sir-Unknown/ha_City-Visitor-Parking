# DVSPortal API URL check report

- Checked municipalities: 35
- API mismatches: 0
- API fetch errors: 1
- Fake login credentials: username='123456', password='1234'

## API status

| Municipality          | API Status | Configured API | Found API             | Base URL                                 |
| --------------------- | ---------- | -------------- | --------------------- | ---------------------------------------- |
| Leidschendam-Voorburg | ERROR      | /DVSPortal/api | SSL certificate error | https://parkeren.lv.nl                   |
| 's-Hertogenbosch      | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.s-hertogenbosch.nl      |
| Apeldoorn             | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.apeldoorn.nl            |
| Bloemendaal           | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.bloemendaal.nl          |
| Delft                 | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://vergunningen.parkerendelft.com   |
| Doetinchem (via Buha) | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.buha.nl                 |
| Groningen             | OK         | /DVSPortal/api | /DVSPortal/api/       | https://aanvraagparkeren.groningen.nl    |
| Haarlem               | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.haarlem.nl              |
| Harlingen             | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeervergunningen.harlingen.nl |
| Heemstede             | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.heemstede.nl            |
| Heerenveen            | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.heerenveen.nl           |
| Heerlen               | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.heerlen.nl              |
| Hengelo               | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.hengelo.nl              |
| Katwijk               | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.katwijk.nl              |
| Leiden                | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.leiden.nl               |
| Middelburg            | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.middelburg.nl           |
| Nijmegen              | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeerproducten.nijmegen.nl     |
| Nissewaard            | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.nissewaard.nl           |
| Oldenzaal             | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.oldenzaal.nl            |
| Rijswijk              | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.rijswijk.nl             |
| Roermond              | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.roermond.nl             |
| Schouwen-Duiveland    | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.schouwen-duiveland.nl   |
| Sittard-Geleen        | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.sittard-geleen.nl       |
| Smallingerland        | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.smallingerland.nl       |
| Súdwest-Fryslân       | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.sudwestfryslan.nl       |
| Veere                 | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.veere.nl                |
| Venlo                 | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.venlo.nl                |
| Vlissingen            | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.vlissingen.nl           |
| Waadhoeke             | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.waadhoeke.nl            |
| Waalwijk              | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.waalwijk.nl             |
| Weert                 | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeerloket.weert.nl            |
| Zaanstad              | OK         | /DVSPortal/api | /DVSPortal/api/       | https://parkeren.zaanstad.nl             |
| Zevenaar              | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.zevenaar.nl             |
| Zutphen               | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeren.zutphen.nl              |
| Zwolle                | OK         | /DVSWebAPI/api | /DVSWebAPI/api/       | https://parkeerloket.zwolle.nl           |

## Login status

| Municipality          | Login Status | Login URL                                                    | Login Response                                                                          |
| --------------------- | ------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Leidschendam-Voorburg | SKIPPED      | -                                                            | Skipped because api_url could not be resolved                                           |
| 's-Hertogenbosch      | HTTP 200     | https://parkeren.s-hertogenbosch.nl/DVSPortal/api/login      | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Apeldoorn             | HTTP 200     | https://parkeren.apeldoorn.nl/DVSPortal/api/login            | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Bloemendaal           | HTTP 200     | https://parkeren.bloemendaal.nl/DVSWebAPI/api/login          | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Delft                 | HTTP 200     | https://vergunningen.parkerendelft.com/DVSWebAPI/api/login   | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Doetinchem (via Buha) | HTTP 200     | https://parkeren.buha.nl/DVSWebAPI/api/login                 | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Groningen             | HTTP 200     | https://aanvraagparkeren.groningen.nl/DVSPortal/api/login    | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Haarlem               | HTTP 200     | https://parkeren.haarlem.nl/DVSWebAPI/api/login              | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Harlingen             | HTTP 200     | https://parkeervergunningen.harlingen.nl/DVSWebAPI/api/login | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Heemstede             | HTTP 200     | https://parkeren.heemstede.nl/DVSWebAPI/api/login            | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Heerenveen            | HTTP 200     | https://parkeren.heerenveen.nl/DVSWebAPI/api/login           | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Heerlen               | HTTP 200     | https://parkeren.heerlen.nl/DVSPortal/api/login              | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Hengelo               | HTTP 200     | https://parkeren.hengelo.nl/DVSWebAPI/api/login              | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Katwijk               | HTTP 200     | https://parkeren.katwijk.nl/DVSWebAPI/api/login              | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Leiden                | HTTP 200     | https://parkeren.leiden.nl/DVSWebAPI/api/login               | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Middelburg            | HTTP 200     | https://parkeren.middelburg.nl/DVSWebAPI/api/login           | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Nijmegen              | HTTP 200     | https://parkeerproducten.nijmegen.nl/DVSPortal/api/login     | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Nissewaard            | HTTP 200     | https://parkeren.nissewaard.nl/DVSWebAPI/api/login           | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Oldenzaal             | HTTP 200     | https://parkeren.oldenzaal.nl/DVSWebAPI/api/login            | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Rijswijk              | HTTP 200     | https://parkeren.rijswijk.nl/DVSWebAPI/api/login             | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Roermond              | HTTP 200     | https://parkeren.roermond.nl/DVSWebAPI/api/login             | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Schouwen-Duiveland    | HTTP 200     | https://parkeren.schouwen-duiveland.nl/DVSWebAPI/api/login   | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Sittard-Geleen        | HTTP 200     | https://parkeren.sittard-geleen.nl/DVSPortal/api/login       | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Smallingerland        | HTTP 200     | https://parkeren.smallingerland.nl/DVSPortal/api/login       | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Súdwest-Fryslân       | HTTP 200     | https://parkeren.sudwestfryslan.nl/DVSWebAPI/api/login       | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Veere                 | HTTP 200     | https://parkeren.veere.nl/DVSWebAPI/api/login                | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Venlo                 | HTTP 200     | https://parkeren.venlo.nl/DVSWebAPI/api/login                | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Vlissingen            | HTTP 200     | https://parkeren.vlissingen.nl/DVSPortal/api/login           | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Waadhoeke             | HTTP 200     | https://parkeren.waadhoeke.nl/DVSPortal/api/login            | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Waalwijk              | HTTP 200     | https://parkeren.waalwijk.nl/DVSWebAPI/api/login             | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Weert                 | HTTP 200     | https://parkeerloket.weert.nl/DVSPortal/api/login            | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Zaanstad              | HTTP 200     | https://parkeren.zaanstad.nl/DVSPortal/api/login             | {"ErrorMessage":"Unable to login.","LoginStatus":0,"Result":0,"RequiresOtp":false}      |
| Zevenaar              | HTTP 200     | https://parkeren.zevenaar.nl/DVSWebAPI/api/login             | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Zutphen               | HTTP 200     | https://parkeren.zutphen.nl/DVSWebAPI/api/login              | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
| Zwolle                | HTTP 200     | https://parkeerloket.zwolle.nl/DVSWebAPI/api/login           | {"ErrorMessage":"U kunt niet inloggen.","LoginStatus":0,"Result":0,"RequiresOtp":false} |
