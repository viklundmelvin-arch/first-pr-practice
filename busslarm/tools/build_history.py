#!/usr/bin/env python3
"""Build Busslarm's delay history from KoDa GTFS-RT TripUpdates archives.

Step 1, per day (`day`): read one KoDa TripUpdates .7z, sample a snapshot about
every minute and keep, for each trip and stop, the last update seen after the
vehicle passed it. Passed stops stay in SL's feed for roughly ten minutes, so a
one-minute sample catches every stop. A trip drops out at its last stop, so
there the last prediction made within five minutes of arriving is used.

Step 2 (`merge`): group the days by trip and write one JSON file per route to
busslarm/data/hist/<route_id>.json, plus busslarm/data/meta.json.

No API key is read here; download the archives separately (see README.md).
"""
import argparse
import csv
import json
import os
import pickle
import shutil
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timedelta
from multiprocessing import Pool
from zoneinfo import ZoneInfo

import py7zr
from google.transit import gtfs_realtime_pb2 as rt

TZ = ZoneInfo("Europe/Stockholm")
SAMPLE_S = 60
PREDICT_S = 300
CANCELED = rt.TripDescriptor.CANCELED
SKIPPED = rt.TripUpdate.StopTimeUpdate.SKIPPED


def area_of(stop_id, parents):
    return parents.get(stop_id) or stop_id


def load_static(static_dir):
    parents = {}
    with open(os.path.join(static_dir, "stops.txt"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            parents[r["stop_id"]] = r["parent_station"] or r["stop_id"]
    trips = {}
    with open(os.path.join(static_dir, "trips.txt"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            trips[r["trip_id"]] = (r["route_id"], int(r["direction_id"] or 0))
    routes = {}
    with open(os.path.join(static_dir, "routes.txt"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            routes[r["route_id"]] = {"line": r["route_short_name"], "type": int(r["route_type"]), "desc": r["route_desc"]}
    return parents, trips, routes


def sample_names(names):
    """Every .pb snapshot, thinned to about one per SAMPLE_S seconds (names end in ...THH-MM-SSZ.pb)."""
    out, last = [], None
    for n in sorted(x for x in names if x.endswith(".pb")):
        stamp = n.rsplit("-", 3)
        try:
            hh = int(stamp[-3][-2:]); mm = int(stamp[-2]); ss = int(stamp[-1][:2])
        except ValueError:
            continue
        t = hh * 3600 + mm * 60 + ss
        if last is None or t - last >= SAMPLE_S:
            out.append(n); last = t
    return out


def process_day(args):
    archive, out_path = args
    if os.path.exists(out_path):
        return out_path
    # (trip_id, start_date) -> {"c": canceled, "r": route_id, "d": dir, "s": {seq: (stop_id, arr_t, arr_d, dep_t, dep_d, skipped)}}
    runs = {}
    tmp = tempfile.mkdtemp(prefix="koda-")
    try:
        try:
            with py7zr.SevenZipFile(archive) as z:
                targets = sample_names(z.getnames())
                z.extract(path=tmp, targets=targets)
        except (py7zr.exceptions.Bad7zFile, py7zr.exceptions.CrcError, EOFError, OSError) as e:
            # KoDa sometimes serves a truncated archive; skip the day rather than stop.
            print(f"skipping {os.path.basename(archive)}: {e}", file=sys.stderr, flush=True)
            return None
        for name in targets:
            p = os.path.join(tmp, name)
            if not os.path.exists(p):
                continue
            feed = rt.FeedMessage()
            try:
                with open(p, "rb") as f:
                    feed.ParseFromString(f.read())
            except Exception:
                continue
            T = feed.header.timestamp
            for e in feed.entity:
                if not e.HasField("trip_update"):
                    continue
                tu = e.trip_update
                tr = tu.trip
                key = (tr.trip_id, tr.start_date)
                run = runs.get(key)
                if run is None:
                    run = runs[key] = {"c": False, "r": tr.route_id, "d": tr.direction_id, "s": {}}
                run["c"] = tr.schedule_relationship == CANCELED
                stops = run["s"]
                for u in tu.stop_time_update:
                    a, d = u.arrival, u.departure
                    t = d.time or a.time
                    if not t:
                        continue
                    rec = (u.stop_id, a.time, a.delay, d.time, d.delay, u.schedule_relationship == SKIPPED)
                    # A canceled trip never passes its stops; keep its timetable so the app can find it.
                    if t <= T or run["c"]:
                        stops[u.stop_sequence] = rec + (True,)
                    elif t - T <= PREDICT_S and not stops.get(u.stop_sequence, (0,) * 7)[6]:
                        # A trip leaves the feed as soon as it reaches its last stop, so that stop is rarely
                        # seen as passed. Keep the latest prediction made shortly before instead.
                        stops[u.stop_sequence] = rec + (False,)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    with open(out_path + ".tmp", "wb") as f:
        pickle.dump(runs, f, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(out_path + ".tmp", out_path)
    return out_path


def local_sec(epoch, service_date):
    """Seconds after local midnight of the service date (can pass 24 h)."""
    d = datetime.strptime(service_date, "%Y%m%d").replace(tzinfo=TZ)
    return int(epoch - d.timestamp())


def merge(day_files, static_dir, out_dir):
    parents, trips_static, routes = load_static(static_dir)
    # route -> trip_id -> {"d": dir, "stops": {seq: (area, sched)}, "obs": {date: (canceled, {seq: (arr_delay, dep_delay)})}}
    by_route = defaultdict(dict)
    dates = set()
    for path in sorted(day_files):
        with open(path, "rb") as f:
            runs = pickle.load(f)
        for (trip_id, sd), run in runs.items():
            route, direction = trips_static.get(trip_id, (run["r"], run["d"]))
            if not route or not run["s"] or not sd:
                continue
            date = f"{sd[:4]}-{sd[4:6]}-{sd[6:]}"
            dates.add(date)
            t = by_route[route].setdefault(trip_id, {"d": direction, "stops": {}, "obs": {}})
            cells = {}
            for seq, (stop_id, at, ad, dt, dd, skipped, _passed) in run["s"].items():
                ref_t, ref_d = (dt, dd) if dt else (at, ad)
                sched = local_sec(ref_t - ref_d, sd)
                t["stops"].setdefault(seq, (area_of(stop_id, parents), sched))
                if run["c"] or skipped:
                    cells[seq] = None
                else:
                    cells[seq] = (ad if at else dd, dd if dt else ad)
            t["obs"][date] = (run["c"], cells)
    dates = sorted(dates)
    di = {d: i for i, d in enumerate(dates)}
    os.makedirs(os.path.join(out_dir, "hist"), exist_ok=True)
    index = {}
    for route, trips in by_route.items():
        stop_ix = {}
        out_trips = []
        for trip_id, t in trips.items():
            seqs = sorted(t["stops"])
            # Flat [stop index, scheduled seconds, stop index, seconds since previous stop, ...]
            st, prev = [], None
            for s in seqs:
                area, sched = t["stops"][s]
                st += [stop_ix.setdefault(area, len(stop_ix)), sched if prev is None else sched - prev]
                prev = sched
            obs = []
            for date, (canceled, cells) in sorted(t["obs"].items()):
                row = []
                for s in seqs:
                    c = cells.get(s, "missing")
                    # "" = not observed that day, "x" = canceled or stop skipped, else seconds late:
                    # departure, except arrival at the last stop where nobody departs.
                    row.append("" if c == "missing" else "x" if c is None else str(c[0] if s == seqs[-1] else c[1]))
                obs.append([di[date], 1 if canceled else 0, ",".join(row).rstrip(",")])
            out_trips.append({"id": trip_id, "dir": t["d"], "st": st, "obs": obs})
        out_trips.sort(key=lambda x: (x["dir"], x["st"][1] if x["st"] else 0))
        info = routes.get(route, {"line": "", "type": 0, "desc": ""})
        with open(os.path.join(out_dir, "hist", f"{route}.json"), "w", encoding="utf-8") as f:
            json.dump({"route": route, **info, "dates": dates, "stops": list(stop_ix), "trips": out_trips}, f, ensure_ascii=False, separators=(",", ":"))
        index[route] = {**info, "trips": len(out_trips)}
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.now(TZ).isoformat(timespec="minutes"), "dates": dates, "routes": index}, f, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--koda", required=True, help="folder with tu-YYYY-MM-DD.7z archives")
    ap.add_argument("--static", required=True, help="unzipped SL GTFS static folder")
    ap.add_argument("--work", required=True, help="folder for per-day intermediate files")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--only", nargs="*", help="process only these dates (YYYY-MM-DD)")
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    jobs = []
    for n in sorted(os.listdir(a.koda)):
        if n.startswith("tu-") and n.endswith(".7z"):
            d = n[3:13]
            if a.only and d not in a.only:
                continue
            jobs.append((os.path.join(a.koda, n), os.path.join(a.work, f"{d}.pkl")))
    with Pool(a.jobs) as pool:
        for p in pool.imap_unordered(process_day, jobs):
            if p:
                print("day done", os.path.basename(p), flush=True)
    merge([j[1] for j in jobs if os.path.exists(j[1])], a.static, a.out)
    print("merged", flush=True)


if __name__ == "__main__":
    sys.exit(main())
