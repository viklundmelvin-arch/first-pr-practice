from datetime import date, datetime

import py7zr
from google.transit import gtfs_realtime_pb2

from koda_punctuality import TZ, classify, extract_line, find_departures, observed_times, read_7z_members

GTFS = {
    "routes.txt": "route_id,route_short_name\nR670,670\nR680,680\n",
    "trips.txt": "route_id,service_id,trip_id,trip_headsign,direction_id\n"
                 "R670,WD,t1,Tekniska högskolan,0\nR670,WE,t2,Tekniska högskolan,0\nR680,WD,t3,Danderyd,0\n",
    "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                    "WD,1,1,1,1,1,0,0,20260101,20261231\nWE,0,0,0,0,0,1,1,20260101,20261231\n",
    "calendar_dates.txt": "service_id,date,exception_type\n",
    "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                      "t1,07:10:00,07:10:00,S1,1\nt1,07:20:00,07:20:00,S2,2\nt2,07:20:00,07:20:00,S2,2\n"
                      "t3,07:20:00,07:20:00,S2,1\n",
    "stops.txt": "stop_id,stop_name\nS1,Vaxholms kajen\nS2,Rindö Smedja\nS9,Annan\n",
}


def gtfs_files():
    return {name: text.encode() for name, text in GTFS.items()}


def feed(ts, trip_id, stop_id, *, time=None, delay=None):
    msg = gtfs_realtime_pb2.FeedMessage()
    msg.header.gtfs_realtime_version = "2.0"
    msg.header.timestamp = ts
    tu = msg.entity.add(id="e").trip_update
    tu.trip.trip_id = trip_id
    stu = tu.stop_time_update.add(stop_id=stop_id)
    if time is not None:
        stu.departure.time = time
    if delay is not None:
        stu.departure.delay = delay
    return msg.SerializeToString()


def test_extract_line_keeps_only_active_trips_of_the_line():
    data = extract_line(gtfs_files(), "670", date(2026, 10, 19))  # a Monday
    assert set(data["trips"]) == {"t1"}
    assert {st["stop_id"] for st in data["stop_times"]} == {"S1", "S2"}
    assert data["stops"] == {"S1": "Vaxholms kajen", "S2": "Rindö Smedja"}


def test_find_departures_matches_stop_name_and_time():
    data = extract_line(gtfs_files(), "670", date(2026, 10, 19))
    deps = find_departures(data, "rindö", 7 * 3600 + 20 * 60)
    assert [(d["trip_id"], d["stop_id"]) for d in deps] == [("t1", "S2")]
    assert find_departures(data, "rindö", 7 * 3600 + 30 * 60) == []


def test_observed_times_uses_latest_prediction_and_delay_fallback():
    sched = int(datetime(2026, 10, 19, 7, 20, tzinfo=TZ).timestamp())
    feeds = [
        feed(sched - 600, "t1", "S2", time=sched + 60),
        feed(sched - 60, "t1", "S2", time=sched + 270),
        feed(sched - 30, "other", "S2", time=sched),
    ]
    assert observed_times(feeds, {("t1", "S2"): sched}) == {("t1", "S2"): (sched - 60, sched + 270)}
    only_delay = [feed(sched - 60, "t1", "S2", delay=-90)]
    assert observed_times(only_delay, {("t1", "S2"): sched})[("t1", "S2")][1] == sched - 90


def test_classify_thresholds():
    assert classify(-61) == "tidig"
    assert classify(-60) == "i tid"
    assert classify(180) == "i tid"
    assert classify(181) == "sen"


def test_read_7z_members_finds_files_in_subfolders(tmp_path):
    archive = tmp_path / "a.7z"
    with py7zr.SevenZipFile(archive, "w") as z:
        z.writestr(b"x", "sl/routes.txt")
        z.writestr(b"y", "sl/other.txt")
    assert read_7z_members(archive, {"routes.txt"}) == {"routes.txt": b"x"}
