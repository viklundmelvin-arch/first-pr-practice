# Busslarm

En väckarklocka som räknar baklänges från när du ska vara framme. Den väljer resa med SL och väcker dig så sent som det går, men bara om resan har hållit även de sena morgnarna i historiken.

Det här är fas B: en webbapp för GitHub Pages med riktig data.

| Del | Källa |
| --- | --- |
| Adresser, hållplatser, resor med byten | SL:s reseplanerare, `journeyplanner.integration.sl.se/v2` (ingen nyckel) |
| Risk | KoDa-historik från Trafiklab, räknad i förväg till `data/` |
| Realtid och bussens position | GTFS Regional Realtime, med användarens egen nyckel |
| Karta | OpenStreetMap via Leaflet 1.9.4 (ligger i `vendor/`) |

## Nycklar

Inga nycklar finns i repot. I appen klistrar användaren in sin GTFS-RT-nyckel under Inställningar. Den sparas bara i webbläsarens `localStorage` och skickas bara till `opendata.samtrafiken.se`. Utan nyckel använder appen reseplanerarens beräknade tider.

KoDa- och GTFS-static-nyckeln behövs bara när historiken byggs om. Skripten läser dem från miljövariablerna `TRAFIKLAB_KODA_KEY` och `TRAFIKLAB_GTFS_STATIC_KEY`.

## Bygga om historiken

```sh
pip install gtfs-realtime-bindings py7zr
busslarm/tools/download.sh /tmp/busslarm-work 28    # ca 2 GB, KoDa är långsamt
python3 busslarm/tools/build_history.py \
  --koda /tmp/busslarm-work/koda --static /tmp/busslarm-work/static \
  --work /tmp/busslarm-work/days --out busslarm/data
```

En dag tar ungefär en minut per kärna. Skriptet hoppar över dagar som redan är bearbetade och dagar där KoDa:s arkiv är trasigt.

### Format

`data/meta.json` har datumen och en lista över alla linjer. `data/hist/<route_id>.json` har en fil per GTFS-linje. Varianter som 670X ligger i en egen fil (`9011001067000000-670X.json`), men appen läser alla varianter till reseplanerarens linje-id.

- `stops`: hållplatsområden (`9021…`) som filen använder.
- `trips[].st`: platt lista `[hållplatsindex, sekunder, hållplatsindex, +sekunder, …]`. Första tiden är tidtabellen i sekunder efter midnatt på trafikdygnet, resten är skillnad mot föregående hållplats.
- `trips[].obs`: en rad per dag, `[datumindex, inställd, "förseningar"]`. Förseningen är sekunder sen avgång (ankomst där avgång saknas), kommaseparerad i samma ordning som `st`. Tom betyder ingen observation och `x` betyder inställd eller överhoppad.

Så tas förseningarna fram: varje KoDa-arkiv har en ögonblicksbild av TripUpdates ungefär var 14:e sekund. Skriptet läser en i minuten och sparar för varje hållplats det sista värdet efter att fordonet passerat. Passerade hållplatser ligger kvar i flödet i ungefär tio minuter. Vid sista hållplatsen försvinner turen direkt, så där används den sista prognosen som gjordes högst fem minuter före.

## Publicera

`.github/workflows/busslarm-pages.yml` publicerar `busslarm/` vid push till `master`. Slå på det under Settings → Pages → Source: GitHub Actions. På ett gratiskonto måste repot vara publikt.

## Begränsningar

- Larmet ringer bara medan sidan är öppen och skärmen är tänd. Wake Lock håller skärmen tänd, och .ics-exporten lägger väckningen i kalendern som reserv.
- Risken bygger på samma sorts dag (vardag, lördag eller söndag) under de senaste fyra veckorna. Helgdagar räknas inte separat.
- Bara byten till sista delen av resan kan räddas av nästa avgång. Missas ett tidigare byte räknas dagen som missad.
