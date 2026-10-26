"""How punctual is one SL departure? Uses historical GTFS(-RT) data from Trafiklab KoDa.

Example:
    python koda_punctuality.py --line 670 --stop "Pålsundsvägen" --time 07:20 --from 2026-09-28 --to 2026-10-23

With --stop "" the script lists the stops on the line so you can pick yours.
"""

import argparse
import csv
import io
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import py7zr
from google.transit import gtfs_realtime_pb2

KODA_URL = "https://api.koda.trafiklab.se/KoDa/api/v2"
STATIC_URL = KODA_URL + "/gtfs-static/{operator}?date={date}&key={key}"
RT_URL = KODA_URL + "/gtfs-rt/{operator}/TripUpdates?date={date}&hour={hour}&key={key}"
TZ = ZoneInfo("Europe/Stockholm")

# The user's own observations, compared against KoDa where the dates overlap.
OWN_LOG = {
    "2026-10-19": "07:24–07:25",
    "2026-10-20": "07:24–07:25",
    "2026-10-21": "07:24–07:25",
    "2026-10-22": "07:24–07:25",
}


class KodaError(Exception):
    pass


def download(url, dest, key, max_wait=900):
    """Fetch a KoDa archive. KoDa answers 202 while it prepares the file, so poll until it is ready."""
    deadline = time.monotonic() + max_wait
    while True:
        try:
            with urllib.request.urlopen(url, timeout=300) as resp:
                if resp.status == 200:
                    tmp = dest.with_suffix(".part")
                    with open(tmp, "wb") as f:
                        shutil.copyfileobj(resp, f)
                    tmp.rename(dest)
                    return dest
                status, body = resp.status, resp.read(500)
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read(500)
        except urllib.error.URLError as e:
            # The URL carries the API key, so never let it reach the output.
            raise KodaError(str(e.reason).replace(key, "***")) from None
        if status != 202:
            raise KodaError(f"HTTP {status}: {body.decode(errors='replace')[:300]}")
        if time.monotonic() > deadline:
            raise KodaError("KoDa is still preparing the archive; try again later")
        print("  KoDa förbereder arkivet, väntar 30 s ...", file=sys.stderr)
        time.sleep(30)


def read_archive_members(path, wanted):
    """Return {basename: bytes} for archive members whose basename is in `wanted` (None = all).

    KoDa serves some archives as zip and others as 7z, so detect the format from the file itself.
    """
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if not n.endswith("/")]
            return {os.path.basename(n): z.read(n) for n in names
                    if wanted is None or os.path.basename(n) in wanted}
    with tempfile.TemporaryDirectory() as tmp, py7zr.SevenZipFile(path) as z:
        names = [n for n in z.getnames() if wanted is None or os.path.basename(n) in wanted]
        z.extract(path=tmp, targets=names)
        return {os.path.basename(n): (Path(tmp) / n).read_bytes() for n in names if (Path(tmp) / n).is_file()}


def csv_rows(data):
    return csv.DictReader(io.StringIO(data.decode("utf-8-sig")))


def gtfs_seconds(hhmmss):
    h, m, s = (int(x) for x in hhmmss.split(":"))
    return h * 3600 + m * 60 + s


def service_active(service_id, day, calendar, calendar_dates):
    exception = calendar_dates.get((service_id, day.strftime("%Y%m%d")))
    if exception is not None:
        return exception == "1"
    c = calendar.get(service_id)
    if not c:
        return False
    weekday = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][day.weekday()]
    return c["start_date"] <= day.strftime("%Y%m%d") <= c["end_date"] and c[weekday] == "1"


def extract_line(files, line, day):
    """Reduce a full GTFS feed to what we need for one line on one day."""
    route_ids = {r["route_id"] for r in csv_rows(files["routes.txt"]) if r["route_short_name"] == line}
    if not route_ids:
        raise KodaError(f"linje {line} finns inte i GTFS-datat för {day}")

    calendar = {c["service_id"]: c for c in csv_rows(files["calendar.txt"])} if "calendar.txt" in files else {}
    calendar_dates = {}
    for c in csv_rows(files.get("calendar_dates.txt", b"")):
        calendar_dates[(c["service_id"], c["date"])] = c["exception_type"]

    trips = {
        t["trip_id"]: {"headsign": t.get("trip_headsign", ""), "direction": t.get("direction_id", "")}
        for t in csv_rows(files["trips.txt"])
        if t["route_id"] in route_ids and service_active(t["service_id"], day, calendar, calendar_dates)
    }

    stop_times = []
    for st in csv_rows(files["stop_times.txt"]):
        if st["trip_id"] in trips:
            stop_times.append({
                "trip_id": st["trip_id"],
                "stop_id": st["stop_id"],
                "seq": int(st["stop_sequence"]),
                "dep": gtfs_seconds(st["departure_time"] or st["arrival_time"]),
            })

    used = {st["stop_id"] for st in stop_times}
    stops = {s["stop_id"]: s["stop_name"] for s in csv_rows(files["stops.txt"]) if s["stop_id"] in used}
    return {"trips": trips, "stop_times": stop_times, "stops": stops}


def load_line(operator, line, day, key, cache):
    """Static data for the line on `day`, cached as a small JSON so the big archive can be deleted."""
    out = cache / f"static-{operator}-{line}-{day}.json"
    if out.exists():
        return json.loads(out.read_text())
    archive = cache / f"static-{operator}-{day}.archive"
    if not archive.exists():
        print(f"  hämtar GTFS-static för {day} ...", file=sys.stderr)
        download(STATIC_URL.format(operator=operator, date=day, key=key), archive, key)
    wanted = {"routes.txt", "trips.txt", "stop_times.txt", "stops.txt", "calendar.txt", "calendar_dates.txt"}
    data = extract_line(read_archive_members(archive, wanted), line, day)
    out.write_text(json.dumps(data))
    archive.unlink()
    return data


def find_departures(data, stop_query, scheduled, tolerance=120):
    """Trips that leave a stop matching `stop_query` within `tolerance` seconds of `scheduled`."""
    q = stop_query.casefold()
    matches = []
    for st in data["stop_times"]:
        name = data["stops"].get(st["stop_id"], "")
        if q in name.casefold() and abs(st["dep"] - scheduled) <= tolerance:
            trip = data["trips"][st["trip_id"]]
            matches.append({**st, "stop_name": name, "headsign": trip["headsign"]})
    return matches


def observed_times(feeds, targets):
    """Latest prediction for each (trip_id, stop_id) in `targets` across a series of TripUpdates feeds.

    feeds: iterable of serialized FeedMessage bytes.
    targets: {(trip_id, stop_id): scheduled unix time}.
    Returns {(trip_id, stop_id): (feed_timestamp, predicted unix time)}. The last prediction made
    is the best estimate of when the bus actually left; SL drops a stop once the bus has passed it.
    """
    trip_ids = {t for t, _ in targets}
    best = {}
    for raw in feeds:
        msg = gtfs_realtime_pb2.FeedMessage()
        msg.ParseFromString(raw)
        ts = msg.header.timestamp
        for entity in msg.entity:
            if not entity.HasField("trip_update"):
                continue
            tu = entity.trip_update
            trip_id = tu.trip.trip_id
            if trip_id not in trip_ids:
                continue
            for stu in tu.stop_time_update:
                k = (trip_id, stu.stop_id)
                if k not in targets:
                    continue
                ev = stu.departure if stu.HasField("departure") else stu.arrival
                if ev.time:
                    predicted = ev.time
                elif ev.HasField("delay"):
                    predicted = targets[k] + ev.delay
                else:
                    continue
                ts_used = ts or tu.timestamp
                if k not in best or ts_used >= best[k][0]:
                    best[k] = (ts_used, predicted)
    return best


def classify(delay_s, early_limit=-60, late_limit=180):
    """SL/Trafikanalys-style: more than 1 min early is early, more than 3 min late is late."""
    if delay_s < early_limit:
        return "tidig"
    if delay_s > late_limit:
        return "sen"
    return "i tid"


def load_rt(operator, day, hour, targets, key, cache):
    out = cache / f"rt-{operator}-{day}-{hour:02d}.json"
    if out.exists():
        stored = json.loads(out.read_text())
    else:
        archive = cache / f"rt-{operator}-{day}-{hour:02d}.archive"
        if not archive.exists():
            print(f"  hämtar TripUpdates {day} timme {hour} ...", file=sys.stderr)
            download(RT_URL.format(operator=operator, date=day, hour=hour, key=key), archive, key)
        files = read_archive_members(archive, None)
        feeds = [b for name, b in sorted(files.items()) if name.endswith(".pb")]
        stamps = [ts for ts in (feed_timestamp(b) for b in feeds) if ts]
        obs = observed_times(feeds, targets)
        stored = {
            "feeds": len(feeds),
            "first": min(stamps, default=0),
            "last": max(stamps, default=0),
            "obs": [[t, s, ts, p] for (t, s), (ts, p) in obs.items()],
        }
        out.write_text(json.dumps(stored))
        archive.unlink()
    return stored


def feed_timestamp(raw):
    msg = gtfs_realtime_pb2.FeedMessage()
    msg.ParseFromString(raw)
    return msg.header.timestamp


def weekdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def hhmm(unix):
    return datetime.fromtimestamp(unix, TZ).strftime("%H:%M:%S")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--operator", default="sl")
    p.add_argument("--line", default="670")
    p.add_argument("--stop", default="Pålsundsvägen", help="del av hållplatsnamnet; tom sträng listar linjens hållplatser")
    p.add_argument("--time", default="07:20", help="tidtabellstid vid hållplatsen (HH:MM)")
    p.add_argument("--headsign", help="filtrera på riktning, t.ex. 'Tekniska högskolan'")
    p.add_argument("--from", dest="start", default="2026-09-28")
    p.add_argument("--to", dest="end", default="2026-10-23")
    p.add_argument("--cache", default="koda_cache")
    args = p.parse_args()

    key = os.environ.get("TRAFIKLAB_KODA_KEY")
    if not key:
        sys.exit("TRAFIKLAB_KODA_KEY saknas")
    cache = Path(args.cache)
    cache.mkdir(exist_ok=True)
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)

    if not args.stop:
        data = load_line(args.operator, args.line, start, key, cache)
        print(f"Hållplatser på linje {args.line} ({start}):")
        for name in sorted(set(data["stops"].values())):
            print(f"  {name}")
        return

    h, m = (int(x) for x in args.time.split(":"))
    scheduled_s = h * 3600 + m * 60
    rows = []
    for day in weekdays(start, end):
        try:
            data = load_line(args.operator, args.line, day, key, cache)
        except KodaError as e:
            print(f"{day}: inga statiska data ({e})", file=sys.stderr)
            continue
        deps = find_departures(data, args.stop, scheduled_s)
        if args.headsign:
            deps = [d for d in deps if args.headsign.casefold() in d["headsign"].casefold()]
        if not deps:
            rows.append((day, None, None, None, "ingen tur i tidtabellen"))
            continue
        # GTFS times count from "noon minus 12 h", which equals midnight except on DST days.
        base = datetime(day.year, day.month, day.day, 12, tzinfo=TZ).timestamp() - 12 * 3600
        targets = {(d["trip_id"], d["stop_id"]): int(base + d["dep"]) for d in deps}
        hours = sorted({datetime.fromtimestamp(t, TZ).hour for t in targets.values()})
        obs = {}
        for hour in hours:
            try:
                rt = load_rt(args.operator, day, hour, targets, key, cache)
            except KodaError as e:
                print(f"{day} timme {hour}: inga realtidsdata ({e})", file=sys.stderr)
                continue
            if rt["feeds"] and not (rt["first"] <= min(targets.values()) <= rt["last"] + 600):
                print(f"{day}: varning – arkivet täcker {hhmm(rt['first'])}–{hhmm(rt['last'])}, "
                      "inte avgångstiden", file=sys.stderr)
            for t, s, ts, pred in rt["obs"]:
                if (t, s) not in obs or ts >= obs[(t, s)][0]:
                    obs[(t, s)] = (ts, pred)
        for d in deps:
            k = (d["trip_id"], d["stop_id"])
            if k not in obs:
                rows.append((day, d, targets[k], None, "saknas i realtidsdata"))
            else:
                rows.append((day, d, targets[k], obs[k][1], None))

    print_report(rows, args)


def print_report(rows, args):
    print(f"\nLinje {args.line}, {args.stop}, avgång {args.time} (vardagar {args.start} – {args.end})\n")
    print(f"{'datum':<12}{'dag':<5}{'mot':<26}{'plan':<10}{'faktisk':<10}{'diff':>7}  status   egen logg")
    counts = {"tidig": 0, "i tid": 0, "sen": 0}
    delays = []
    for day, dep, sched, actual, note in rows:
        dname = ["mån", "tis", "ons", "tor", "fre"][day.weekday()]
        own = OWN_LOG.get(day.isoformat(), "")
        if note:
            head = dep["headsign"][:24] if dep else ""
            print(f"{day!s:<12}{dname:<5}{head:<26}{'':<10}{'':<10}{'':>7}  {note}  {own}")
            continue
        delay = actual - sched
        status = classify(delay)
        counts[status] += 1
        delays.append(delay)
        sign = "+" if delay >= 0 else "-"
        diff = f"{sign}{abs(delay) // 60}:{abs(delay) % 60:02d}"
        print(f"{day!s:<12}{dname:<5}{dep['headsign'][:24]:<26}{hhmm(sched):<10}{hhmm(actual):<10}"
              f"{diff:>7}  {status:<8} {own}")

    n = len(delays)
    if not n:
        print("\nInga observationer hittades.")
        return
    print(f"\n{n} observerade avgångar:")
    for status, c in counts.items():
        print(f"  {status:<6} {c:>3}  ({100 * c / n:.0f} %)")
    delays.sort()
    median = delays[n // 2] if n % 2 else (delays[n // 2 - 1] + delays[n // 2]) / 2
    print(f"  median {median / 60:+.1f} min, värsta {delays[-1] / 60:+.1f} min, tidigast {delays[0] / 60:+.1f} min")
    print("  (tidig = mer än 1 min före tidtabellen, sen = mer än 3 min efter)")


if __name__ == "__main__":
    main()
