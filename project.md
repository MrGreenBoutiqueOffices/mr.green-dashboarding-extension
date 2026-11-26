# Update 2.1.1 (26 november 2026)

Tijdelijk lege Asset ID's worden opnieuw gelezen via een Chrome-alarm; er is geen doel-URL-sessiecache of fictief fallback-scherm meer. Zie readme.md voor tests en release. De status en Supabase-plannen hieronder zijn historische notities; de huidige extensie verstuurt geen logs naar Supabase.

# Mr.Green Dashboarding Extension - Project Status

## Huidige Status
- **Datum:** 2026-03-04
- **Versie:** 2.0.4
- **Doel:** Een Chrome-extensie voor Kiosk modus waarmee dynamische URL's geladen kunnen worden op basis van het ChromeOS `assetId`.

## Laatste Wijzigingen (v2.0.4)
- `background.js`: Aangepast naar `chrome.tabs.update()` in plaats van `chrome.windows.create()`. Dit adresseert een race-condition waarbij de standaard ChromeOS Kiosk PWA sneller leek te laden dan de extensie-startup en daardoor focus stal, wat resulteerde in een leeg scherm. Het script dwingt nu de bestaande open tab te navigeren naar de device signing URL.

## Eerdere Wijzigingen (v1.5.2 / 2.0.3)
- `background.js`: Remote logging naar Supabase (`kiosk_logs` tabel). Elke stap in de flow logt naar Supabase zodat kiosk-fouten zichtbaar zijn zonder console-toegang. De window-strategie checkt nu eerst op **bestaande kiosk-vensters** (`chrome.windows.getAll`) in plaats van direct een nieuw venster aan te maken — ChromeOS maakt in kiosk mode mogelijk zelf al een venster aan. Extra foutafhandeling op elke async stap.
- `loading.html`: Laadscherm pagina als echte extensie-resource (ipv `about:blank`).

## Vereiste Supabase Setup
Er moet een `kiosk_logs` tabel bestaan in Supabase met de volgende kolommen:
- `id` (int8, primary key, identity)
- `level` (text)
- `message` (text)
- `data` (text)
- `timestamp` (text)
- `extension_version` (text)
- `created_at` (timestamptz, default now())

RLS: INSERT toestaan voor `anon` role.

## Eerdere Wijzigingen
- v1.5.1: `kiosk_enabled: true` toegevoegd aan manifest. Window-creatie flow gerefactored met timeout-fallback.
- v1.5.0: `enterprise.deviceAttributes` permissie, dynamische URL's op basis van assetId, ondersteuning voor 1-monitor setups.

## Verantwoording Permissies
**`enterprise.deviceAttributes`**
Nodig om het unieke Asset ID van het fysieke ChromeOS-apparaat op te halen voor dynamische URL-generatie (bijv. `https://signing.<assetId>.net-os.com`).

## Volgende Stappen
- `kiosk_logs` tabel aanmaken in Supabase (zie setup hierboven).
- Versie 1.5.2 uploaden en testen op kiosk-apparaat.
- Supabase logs analyseren om de exacte foutlocatie te vinden.
