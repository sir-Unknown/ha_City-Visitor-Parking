# Release stappen

## 1) Versies bijwerken

1. Werk de versie bij in `custom_components/city_visitor_parking/manifest.json`.
2. Werk `CHANGELOG.md` bij met de release-notities.

## 2) GitHub Release publiceren

1. Ga naar **Releases** op GitHub.
2. Klik op **Draft a new release**.
3. Gebruik een tag die exact overeenkomt met de versie (bijvoorbeeld `1.2.3`).
4. Vul de titel en release-notities in (bij voorkeur op basis van `CHANGELOG.md`).
5. Klik op **Publish release**.

## 2b) GitHub Release publiceren via CLI

Voorwaarde: je bent ingelogd met GitHub CLI (`gh auth login`).

1. Maak een tag die exact overeenkomt met de versie:
   ```bash
   git tag 1.2.3
   git push origin 1.2.3
   ```
2. Publiceer de release met notes uit `CHANGELOG.md` (kopieer de relevante sectie):
   ```bash
   gh release create 1.2.3 --title "1.2.3" --notes "Plak hier de releasenotes uit CHANGELOG.md"
   ```

## 3) Release-asset controleren

Na het publiceren start de workflow `.github/workflows/release.yaml` automatisch en uploadt `city_visitor_parking.zip` als release-asset.
Controleer op de releasepagina of het bestand aanwezig is.
