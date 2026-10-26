#!/bin/bash
# Download what build_history.py needs: SL's GTFS static feed and KoDa TripUpdates
# archives for the last DAYS days. Keys come from the environment, never from the repo:
#   TRAFIKLAB_GTFS_STATIC_KEY, TRAFIKLAB_KODA_KEY
# Usage: download.sh <work folder> [DAYS]
set -euo pipefail
work=${1:?usage: download.sh <work folder> [DAYS]}
days=${2:-28}
mkdir -p "$work/static" "$work/koda"

curl -sS --fail -H "Accept-Encoding: gzip" -o "$work/static/sl.zip" \
  "https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=${TRAFIKLAB_GTFS_STATIC_KEY:?set TRAFIKLAB_GTFS_STATIC_KEY}"
unzip -o -q "$work/static/sl.zip" stops.txt trips.txt routes.txt -d "$work/static"

for i in $(seq 1 "$days"); do
  d=$(date -u -d "today -$i day" +%F)
  f="$work/koda/tu-$d.7z"
  [ -s "$f" ] && continue
  # KoDa may answer 202 while it prepares an archive; try again for a few minutes.
  for try in $(seq 1 10); do
    code=$(curl -sS -o "$f.part" -w "%{http_code}" \
      "https://api.koda.trafiklab.se/KoDa/api/v2/gtfs-rt/sl/TripUpdates?date=$d&key=${TRAFIKLAB_KODA_KEY:?set TRAFIKLAB_KODA_KEY}")
    if [ "$code" = 200 ] && [ "$(stat -c %s "$f.part")" -gt 1000000 ]; then mv "$f.part" "$f"; echo "$d ok"; break; fi
    echo "$d: HTTP $code, retrying"; sleep 30
  done
done
rm -f "$work"/koda/*.part
