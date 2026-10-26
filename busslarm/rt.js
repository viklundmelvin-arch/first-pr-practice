// Minimal GTFS Realtime reader: decodes only the fields Busslarm uses from
// TripUpdates and VehiclePositions (protobuf wire format, no library).
"use strict";

const RT = (() => {
  const td = new TextDecoder();

  function reader(buf) {
    const b = new Uint8Array(buf);
    let p = 0;
    // Returns [signed low 32 bits, full value as a Number] so int32 delays (sign-extended
    // to 10 bytes) and int64 epoch times both come out right.
    function varint() {
      let lo = 0, num = 0, mul = 1, i = 0, byte;
      do {
        byte = b[p++];
        if (i < 5) lo |= (byte & 0x7f) << (7 * i);
        num += (byte & 0x7f) * mul;
        mul *= 128; i++;
      } while (byte & 0x80);
      return [lo | 0, num];
    }
    function skip(wire) {
      if (wire === 0) varint();
      else if (wire === 1) p += 8;
      else if (wire === 2) { const n = varint()[1]; p += n; }
      else if (wire === 5) p += 4;
      else throw new Error("protobuf: unsupported wire type " + wire);
    }
    function fields(end, fn) {
      while (p < end) {
        const tag = varint()[1];
        const f = Math.floor(tag / 8), wire = tag & 7;
        if (!fn(f, wire)) skip(wire);
      }
    }
    const sub = fn => { const n = varint()[1]; const end = p + n; fields(end, fn); p = end; };
    const str = () => { const n = varint()[1]; const s = td.decode(b.subarray(p, p + n)); p += n; return s; };
    const f32 = () => { const v = new DataView(b.buffer, b.byteOffset + p, 4).getFloat32(0, true); p += 4; return v; };
    return { varint, sub, str, f32, fields, get len() { return b.length; } };
  }

  function tripDescriptor(r) {
    const t = { tripId: "", routeId: "", startDate: "", startTime: "", rel: 0, dir: null };
    r.sub((f, w) => {
      if (f === 1 && w === 2) t.tripId = r.str();
      else if (f === 2 && w === 2) t.startTime = r.str();
      else if (f === 3 && w === 2) t.startDate = r.str();
      else if (f === 4 && w === 0) t.rel = r.varint()[0];
      else if (f === 5 && w === 2) t.routeId = r.str();
      else if (f === 6 && w === 0) t.dir = r.varint()[0];
      else return false;
      return true;
    });
    return t;
  }
  function stopEvent(r) {
    const e = { delay: null, time: null };
    r.sub((f, w) => {
      if (f === 1 && w === 0) e.delay = r.varint()[0];
      else if (f === 2 && w === 0) e.time = r.varint()[1];
      else return false;
      return true;
    });
    return e;
  }
  function stopTimeUpdate(r) {
    const u = { seq: null, stopId: "", arr: null, dep: null, rel: 0 };
    r.sub((f, w) => {
      if (f === 1 && w === 0) u.seq = r.varint()[1];
      else if (f === 2 && w === 2) u.arr = stopEvent(r);
      else if (f === 3 && w === 2) u.dep = stopEvent(r);
      else if (f === 4 && w === 2) u.stopId = r.str();
      else if (f === 5 && w === 0) u.rel = r.varint()[0];
      else return false;
      return true;
    });
    return u;
  }
  function vehicleDescriptor(r) {
    let id = "";
    r.sub((f, w) => { if (f === 1 && w === 2) { id = r.str(); return true; } return false; });
    return id;
  }
  function tripUpdate(r) {
    const t = { trip: null, vehicle: "", stops: [], timestamp: null };
    r.sub((f, w) => {
      if (f === 1 && w === 2) t.trip = tripDescriptor(r);
      else if (f === 2 && w === 2) t.stops.push(stopTimeUpdate(r));
      else if (f === 3 && w === 2) t.vehicle = vehicleDescriptor(r);
      else if (f === 4 && w === 0) t.timestamp = r.varint()[1];
      else return false;
      return true;
    });
    return t;
  }
  function position(r) {
    const pos = { lat: null, lon: null, bearing: null };
    r.sub((f, w) => {
      if (f === 1 && w === 5) pos.lat = r.f32();
      else if (f === 2 && w === 5) pos.lon = r.f32();
      else if (f === 3 && w === 5) pos.bearing = r.f32();
      else return false;
      return true;
    });
    return pos;
  }
  function vehiclePosition(r) {
    const v = { trip: null, pos: null, seq: null, status: null, timestamp: null, stopId: "", vehicle: "" };
    r.sub((f, w) => {
      if (f === 1 && w === 2) v.trip = tripDescriptor(r);
      else if (f === 2 && w === 2) v.pos = position(r);
      else if (f === 3 && w === 0) v.seq = r.varint()[1];
      else if (f === 4 && w === 0) v.status = r.varint()[0];
      else if (f === 5 && w === 0) v.timestamp = r.varint()[1];
      else if (f === 7 && w === 2) v.stopId = r.str();
      else if (f === 8 && w === 2) v.vehicle = vehicleDescriptor(r);
      else return false;
      return true;
    });
    return v;
  }

  function decode(buf) {
    const r = reader(buf);
    const out = { timestamp: null, trips: [], vehicles: [] };
    r.fields(r.len, (f, w) => {
      if (f === 1 && w === 2) {
        r.sub((g, w2) => { if (g === 3 && w2 === 0) { out.timestamp = r.varint()[1]; return true; } return false; });
      } else if (f === 2 && w === 2) {
        r.sub((g, w2) => {
          if (g === 3 && w2 === 2) out.trips.push(tripUpdate(r));
          else if (g === 4 && w2 === 2) out.vehicles.push(vehiclePosition(r));
          else return false;
          return true;
        });
      } else return false;
      return true;
    });
    return out;
  }

  const BASE = "https://opendata.samtrafiken.se/gtfs-rt/sl/";
  async function fetchFeed(name, key) {
    const res = await fetch(`${BASE}${name}.pb?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("Nyckeln godkändes inte."), { code: "key" });
    if (!res.ok) throw new Error(`Realtid svarade ${res.status}.`);
    return decode(await res.arrayBuffer());
  }

  // Platform 9022001067033001 belongs to stop area 9021001067033000.
  const areaOf = stopId => (stopId && stopId.startsWith("9022") ? `9021${stopId.slice(4, 13)}000` : stopId);

  return { decode, fetchFeed, areaOf, CANCELED: 3, SKIPPED: 1 };
})();
