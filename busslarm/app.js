"use strict";
// Busslarm, phase B. Real trips from SL's journey planner, risk from KoDa history
// (precomputed into data/), realtime and bus position from GTFS Regional Realtime.

// ---------- Time (always Stockholm time) ----------
const TZ = "Europe/Stockholm";
const DAY = 86400;
const tzParts = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function local(ms) {
  const p = Object.fromEntries(tzParts.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
}
// Epoch ms of a local date and seconds after its midnight (handles DST changes).
function epochOf(date, sec = 0) {
  const [y, m, d] = date.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d) + sec * 1000;
  for (let i = 0; i < 2; i++) {
    const l = local(guess);
    const have = (Date.UTC(...l.date.split("-").map((v, k) => k === 1 ? v - 1 : +v)) - Date.UTC(y, m - 1, d)) / 1000 + l.sec;
    guess += (sec - have) * 1000;
  }
  return guess;
}
const relSec = (ms, date) => Math.round((ms - epochOf(date, 0)) / 1000);
const pc = s => { const [h, m, sec = 0] = String(s).split(":").map(Number); return h * 3600 + m * 60 + sec; };
function fmt(sec, withSeconds = false) {
  sec = ((Math.round(sec) % DAY) + DAY) % DAY;
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor(sec % 3600 / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return withSeconds ? `${h}:${m}:${s}` : `${h}:${m}`;
}
function dur(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return s ? `${m} min ${s} s` : `${m} min`;
}
const durMin = sec => `${Math.round(sec / 60)} min`;
const signMin = sec => `${sec >= 0 ? "+" : "−"}${Math.abs(Math.round(sec / 60))} min`;
const DOW = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const dateOf = s => new Date(s + "T12:00:00Z");
const dow = s => dateOf(s).getUTCDay();
const addDays = (s, n) => { const d = dateOf(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayIso = () => local(Date.now()).date;
const nowSec = () => local(Date.now()).sec;
const dayKind = s => (dow(s) === 0 ? "sön" : dow(s) === 6 ? "lör" : "vardag");
const KIND_TEXT = { vardag: "vardagar", lör: "lördagar", sön: "söndagar" };
const shortDate = s => `${dateOf(s).getUTCDate()} ${MON[dateOf(s).getUTCMonth()]}`;
function dayName(s) {
  const t = todayIso();
  const base = `${DOW[dow(s)]} ${shortDate(s)}`;
  if (s === t) return `Idag · ${base}`;
  if (s === addDays(t, 1)) return `Imorgon · ${base}`;
  return base;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Rules ----------
// Assumed lateness when a trip has no history, per safety level (s).
const UNKNOWN_LATE = { bus: { vanlig: 120, saker: 300, mycket: 480 }, rail: { vanlig: 60, saker: 180, mycket: 300 } };
const SAFETY = {
  vanlig: { name: "Vanlig", q: 0.5, text: "Räknar med en vanlig morgon (medianen). Mest sömn, men var tredje morgon kan bli tight." },
  saker: { name: "Säker", q: 0.9, text: "Räknar med en sen morgon: 9 av 10 morgnar kom bussen fram tidigare än så." },
  mycket: { name: "Mycket säker", q: 1, text: "Räknar med den sämsta morgonen som finns i historiken." },
};
const STOP_SLACK = 30;      // stand at the stop this long before the earliest departure ever seen
const NO_DATA_EARLY = 60;   // without history, be there a minute before the timetable
const MIN_TRANSFER = 60;    // seconds between getting off (plus the walk) and the next departure
const MIN_DAYS = 5;         // fewer observed days than this and the history is shown but not trusted
const MATCH_S = 90;         // timetable times within this many seconds count as the same departure

// ---------- State ----------
const KEY = "busslarm.b1";
function seed() {
  const t = todayIso();
  let mon = addDays(t, 1);
  while (dayKind(mon) !== "vardag") mon = addDays(mon, 1);
  return {
    settings: {
      speed: "normal", customKmh: 5, safety: "saker", snooze: 5, theme: "dark", rtKey: "",
      routines: {
        vanlig: [["Dusch", 12], ["Klä på dig", 8], ["Frukost", 15], ["Tänder och packning", 10]],
        snabb: [["Klä på dig", 6], ["Snabb frukost", 8], ["Tänder och packning", 6]],
      },
    },
    home: { name: "Hem", label: "Vaxholm, Pålsundsvägen (hållplats)", coord: [59.40336, 18.326332], stopId: "9091001000002805" },
    places: [{ id: "tcentralen", name: "T-Centralen", label: "Stockholm, T-Centralen", coord: [59.331134, 18.060337], stopId: "9091001000009001" }],
    events: [{ id: "e1", title: "Exempel: skolan börjar", place: "tcentralen", date: mon, start: pc("08:30"), end: pc("15:00"), early: 5, routine: "vanlig", repeat: true, example: true }],
  };
}
function loadState() { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
function saveState() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
let S = loadState() || seed();
const ui = {
  tab: "idag", viewDate: null, details: false, armed: null, alarm: null, sheet: null,
  resa: { from: "hem", to: S.places[0]?.id || "hem", date: null, time: "08:15", open: null },
  mapEdit: null, plans: {}, live: null, exclude: new Set(),
};

// ---------- Walking ----------
const kmh = () => ({ lugn: 4.5, normal: 5.5, snabb: 6.5 }[S.settings.speed] ?? Math.min(15, Math.max(2, Number(S.settings.customKmh) || 5)));
const speedMs = () => kmh() / 3.6;
// JP gives distance for walks from an address, only a time for walks inside a station.
const walkSec = w => (!w ? 0 : w.m ? Math.round(w.m / speedMs()) : w.dur || 0);
const walkSum = ws => ws.reduce((a, w) => ({ m: (a.m || 0) + (w.m || 0), dur: (a.dur || 0) + (w.m ? Math.round(w.m / speedMs()) : w.dur || 0) }), { m: 0, dur: 0 });

// ---------- Places ----------
function place(id) {
  if (id === "hem") return { id: "hem", ...S.home };
  return S.places.find(p => p.id === id) || null;
}
const placeName = id => place(id)?.name || "Okänd plats";
const hasCoord = p => p && Array.isArray(p.coord) && p.coord.length === 2;

// ---------- SL journey planner ----------
const JP = "https://journeyplanner.integration.sl.se/v2";
let jpBusy = 0;
const jpQueue = [];
async function jpFetch(path) {
  // At most three requests at a time; the week view asks for many days at once.
  if (jpBusy >= 3) await new Promise(r => jpQueue.push(r));
  jpBusy++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(JP + path);
        if (!res.ok) throw new Error(`Reseplaneraren svarade ${res.status}`);
        return await res.json();
      } catch (e) {
        if (attempt >= 1) throw e;
        await sleep(800);
      }
    }
  } finally {
    jpBusy--;
    jpQueue.shift()?.();
  }
}
async function searchPlaces(q) {
  const j = await jpFetch(`/stop-finder?name_sf=${encodeURIComponent(q)}&any_obj_filter_sf=46&type_sf=any`);
  return (j.locations || []).slice(0, 8).map(l => ({
    kind: l.type, name: l.disassembledName || l.name, label: l.name, coord: l.coord,
    stopId: l.type === "stop" ? l.id : null,
  })).filter(l => Array.isArray(l.coord));
}
const jpPoint = p => (p.stopId ? `type_X=any&name_X=${encodeURIComponent(p.stopId)}` : `type_X=coord&name_X=${encodeURIComponent(`${p.coord[1].toFixed(6)}:${p.coord[0].toFixed(6)}:WGS84[dd.ddddd]`)}`);
const jpCache = new Map();
async function jpTrips(from, to, date, arriveSec) {
  const t = Math.max(0, arriveSec);
  const key = JSON.stringify([from.stopId || from.coord, to.stopId || to.coord, date, t]);
  const hit = jpCache.get(key);
  const ttl = date === todayIso() ? 120e3 : 30 * 60e3;
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const q = (ts) => `/trips?${jpPoint(from).replaceAll("_X", "_origin")}&${jpPoint(to).replaceAll("_X", "_destination")}` +
    `&itd_date=${date.replaceAll("-", "")}&itd_time=${fmt(ts).replace(":", "")}&itd_trip_date_time_dep_arr=arr&calc_number_of_trips=3&gen_c=true`;
  // The planner returns three trips around the time asked for; a second, earlier ask gives more to choose from.
  const p = Promise.all([jpFetch(q(t)), jpFetch(q(Math.max(0, t - 25 * 60)))]).then(([a, b]) => {
    const seen = new Set(), out = [];
    for (const j of [...(a.journeys || []), ...(b.journeys || [])]) {
      const k = j.legs.map(l => `${l.transportation?.properties?.globalId || "walk"}@${l.origin?.departureTimePlanned}`).join("|");
      if (!seen.has(k)) { seen.add(k); out.push(j); }
    }
    return out;
  });
  jpCache.set(key, { at: Date.now(), p });
  p.catch(() => jpCache.delete(key));
  return p;
}

const isWalkLeg = l => (l.transportation?.product?.class ?? 99) >= 99;
const stopArea = s => s?.parent?.type === "stop" ? s.parent.id : s?.id;
const stopName = s => s?.parent?.disassembledName || s?.disassembledName || s?.name || "";
function parseJourney(j, date) {
  const segs = [];
  let walks = [];
  const rel = iso => (iso ? relSec(Date.parse(iso), date) : null);
  for (const l of j.legs) {
    if (isWalkLeg(l)) {
      walks.push({ m: l.distance || null, dur: l.duration || 0, coords: l.coords || [] });
      continue;
    }
    const t = l.transportation || {};
    const o = l.origin, d = l.destination;
    segs.push({
      walksBefore: walks,
      leg: {
        line: t.disassembledName || t.number || t.name || "?",
        name: t.name || "", cls: t.product?.class ?? 5, routeId: t.properties?.globalId || null,
        towards: t.destination?.name || "",
        from: { area: stopArea(o), name: stopName(o), coord: o.coord, platform: o.properties?.platformName || o.properties?.platform || "" },
        to: { area: stopArea(d), name: stopName(d), coord: d.coord },
        depSched: rel(o.departureTimeBaseTimetable || o.departureTimePlanned),
        arrSched: rel(d.arrivalTimeBaseTimetable || d.arrivalTimePlanned),
        depEst: rel(o.departureTimeEstimated), arrEst: rel(d.arrivalTimeEstimated),
        depEpoch: Date.parse(o.departureTimeBaseTimetable || o.departureTimePlanned),
        coords: l.coords || [],
        stops: (l.stopSequence || []).map(s => ({ name: stopName(s), coord: s.coord, area: stopArea(s) })),
        canceled: (l.realtimeStatus || []).some(s => /CANCEL/i.test(s)) || l.isCancelled === true,
        infos: (l.infos || []).map(i => i.title || i.subtitle || i.content).filter(Boolean),
      },
    });
    walks = [];
  }
  return { legs: segs.map(s => s.leg), wo: walkSum(segs[0]?.walksBefore || walks), tr: segs.slice(1).map(s => walkSum(s.walksBefore)), wd: walkSum(segs.length ? walks : []),
    walkCoords: [...segs.flatMap(s => s.walksBefore.map(w => w.coords)), ...(segs.length ? walks.map(w => w.coords) : [])], walkOnly: !segs.length,
    walkOnlyLeg: !segs.length ? walkSum(walks) : null, raw: j };
}

// ---------- History (precomputed from KoDa) ----------
let META = null;
const routeCache = new Map();
async function loadMeta() {
  if (META) return META;
  try { META = await (await fetch("data/meta.json")).json(); } catch { META = { dates: [], routes: {} }; }
  return META;
}
function loadRoute(id) {
  if (!id) return Promise.resolve(null);
  if (!routeCache.has(id)) {
    routeCache.set(id, (async () => {
      const meta = await loadMeta();
      if (!meta.routes[id]) return null;
      const res = await fetch(`data/hist/${id}.json`);
      if (!res.ok) return null;
      const h = await res.json();
      // Decode the flat [stop, seconds, stop, +seconds, ...] arrays once.
      for (const t of h.trips) {
        const a = [], s = [];
        for (let i = 0, prev = 0; i < t.st.length; i += 2) { a.push(t.st[i]); prev = i ? prev + t.st[i + 1] : t.st[i + 1]; s.push(prev); }
        t.areas = a; t.sched = s;
      }
      return h;
    })().catch(() => null));
  }
  return routeCache.get(id);
}
// The planner gives one id per line; GTFS splits variants out, e.g. 9011001067000000-670X.
const baseRoute = id => String(id || "").split("-")[0];
async function loadRoutesFor(id) {
  if (!id) return [];
  const meta = await loadMeta();
  const ids = Object.keys(meta.routes).filter(r => baseRoute(r) === id);
  return (await Promise.all(ids.map(loadRoute))).filter(Boolean);
}
const sameTime = (a, b) => { const d = (((a - b) % DAY) + DAY) % DAY; return Math.min(d, DAY - d) <= MATCH_S; };
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
// Every past day this departure ran: how late it left the boarding stop and reached the alighting stop.
function matchLeg(hs, leg, date) {
  if (!hs.length || leg.depSched == null) return null;
  const kind = dayKind(date);
  const byDate = new Map();
  for (const h of hs) {
    const fi = h.stops.indexOf(leg.from.area), ti = h.stops.indexOf(leg.to.area);
    if (fi < 0 || ti < 0) continue;
    for (const t of h.trips) {
      const i = t.areas.findIndex((a, k) => a === fi && sameTime(t.sched[k], leg.depSched));
      if (i < 0) continue;
      const j = t.areas.findIndex((a, k) => k > i && a === ti);
      if (j < 0) continue;
      for (const [di, canc, row] of t.obs) {
        const d = h.dates[di];
        if (dayKind(d) !== kind || byDate.has(d) || d >= date) continue;
        const cells = row.split(",");
        const dep = cells[i], arr = cells[j];
        if (canc || dep === "x" || arr === "x") byDate.set(d, { date: d, canceled: true });
        else if (dep && arr) byDate.set(d, { date: d, dep: +dep, arr: +arr });
      }
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return null;
  const run = days.filter(d => !d.canceled);
  const depS = run.map(d => d.dep).sort((a, b) => a - b), arrS = run.map(d => d.arr).sort((a, b) => a - b);
  return { days, byDate, n: days.length, canceled: days.length - run.length, depS, arrS, minDep: depS[0] ?? 0, medDep: depS.length ? quantile(depS, 0.5) : 0, medArr: arrS.length ? quantile(arrS, 0.5) : 0 };
}
// The next few departures of the same line between the same stops, for when a transfer is missed.
function nextRuns(leg, date) {
  const cand = [];
  for (const h of leg.hs || []) {
    const fi = h.stops.indexOf(leg.from.area), ti = h.stops.indexOf(leg.to.area);
    if (fi < 0 || ti < 0) continue;
    for (const t of h.trips) {
      t.areas.forEach((a, i) => {
        if (a !== fi || t.sched[i] <= leg.depSched + 30 || t.sched[i] > leg.depSched + 3600) return;
        const j = t.areas.findIndex((b, k) => k > i && b === ti);
        if (j > 0) cand.push({ depSched: t.sched[i], arrSched: t.sched[j] });
      });
    }
  }
  cand.sort((a, b) => a.depSched - b.depSched);
  const out = [];
  for (const c of cand) {
    if (out.length >= 4) break;
    if (out.some(o => sameTime(o.depSched, c.depSched))) continue;
    // Only departures seen running on this kind of day count.
    const hist = matchLeg(leg.hs, { from: leg.from, to: leg.to, depSched: c.depSched }, date);
    if (hist) out.push({ ...c, line: leg.line, cls: leg.cls, hist });
  }
  return out;
}
const kindOf = leg => ([0, 1, 2, 4].includes(leg.cls) ? "rail" : "bus");
const trusted = leg => leg.hist && leg.hist.n >= MIN_DAYS && leg.hist.arrS.length;
function lateFor(leg, safety) {
  if (trusted(leg)) return quantile(leg.hist.arrS, SAFETY[safety].q);
  return UNKNOWN_LATE[kindOf(leg)][safety];
}

// ---------- Evaluate one journey against the target ----------
function evaluate(J, { target, earliest, date, safety = S.settings.safety }) {
  if (J.walkOnly) {
    const leave = target - (J.walkOnlyLeg?.dur || 0);
    const ok = earliest == null || leave >= earliest;
    return { key: "walk", walkOnly: true, walkM: J.walkOnlyLeg?.m || 0, legs: [], leave, final: target, ok, fail: ok ? null : "tidigt", transfers: 0, totalWalk: J.walkOnlyLeg?.m || 0, risk: "walk", J };
  }
  const legs = J.legs;
  const L0 = legs[0], last = legs[legs.length - 1];
  const atStop = trusted(L0) ? Math.floor((L0.depSched + L0.hist.minDep - STOP_SLACK) / 60) * 60 : L0.depSched - NO_DATA_EARLY;
  const leave = atStop - walkSec(J.wo);
  // A missed transfer onto the last leg means taking its next departure, if that still gets you there.
  const run = late => {
    let lastArr = last.arrSched + late[legs.length - 1], next = null;
    for (let k = 0; k < legs.length - 1; k++) {
      const ready = legs[k].arrSched + late[k] + walkSec(J.tr[k]) + MIN_TRANSFER;
      if (ready <= legs[k + 1].depSched) continue;
      next = k === legs.length - 2 ? (last.next || []).find(n => n.depSched >= ready) : null;
      if (!next) return { ok: false, why: "byte", at: k };
      lastArr = next.arrSched + lateFor(next, safety);
    }
    const final = lastArr + walkSec(J.wd);
    return { ok: final <= target, why: final <= target ? null : "sent", final, next };
  };
  const plan = run(legs.map(l => lateFor(l, safety)));
  const typ = run(legs.map(l => (trusted(l) ? l.hist.medArr : 0)));
  let ok = plan.ok && !legs.some(l => l.canceled), fail = legs.some(l => l.canceled) ? "inställd" : plan.why;
  if (earliest != null && leave < earliest) { ok = false; fail = "tidigt"; }
  // Replay every past day of the same kind: you at the stop at atStop, each vehicle as late as it really was.
  let stats = null;
  const withHist = legs.filter(l => l.hist);
  if (withHist.length) {
    const dates = [...new Set(withHist.flatMap(l => l.hist.days.map(d => d.date)))].sort();
    const days = [];
    for (const d of dates) {
      const obs = legs.map(l => (l.hist ? l.hist.byDate.get(d) : { dep: 0, arr: 0, assumed: true }));
      if (obs.some(o => !o)) continue;
      let good = true, why = null;
      // A cancelled last leg after a transfer can still be saved by its next departure, below.
      if (obs.slice(0, legs.length > 1 ? -1 : undefined).some(o => o.canceled)) { good = false; why = "inställd"; }
      else if (L0.depSched + obs[0].dep < atStop) { good = false; why = "gick före"; }
      else {
        let lastArr = last.arrSched + (obs[obs.length - 1].arr || 0);
        for (let k = 0; k < legs.length - 1 && good; k++) {
          const ready = legs[k].arrSched + obs[k].arr + walkSec(J.tr[k]) + MIN_TRANSFER;
          if (!obs[k + 1].canceled && ready <= legs[k + 1].depSched + obs[k + 1].dep) continue;
          const n = k === legs.length - 2 ? (last.next || []).map(x => ({ x, o: x.hist.byDate.get(d) })).find(({ x, o }) => o && !o.canceled && x.depSched + o.dep >= ready) : null;
          if (n) { lastArr = n.x.arrSched + n.o.arr; why = "nästa"; }
          else { good = false; why = obs[k + 1].canceled ? "inställd" : "byte"; }
        }
        if (good && lastArr + walkSec(J.wd) > target) { good = false; why = "sent"; }
      }
      days.push({ date: d, ok: good, why, dep: obs[0].canceled ? null : L0.depSched + obs[0].dep });
    }
    if (days.length) stats = { days, ok: days.filter(x => x.ok).length, n: days.length, assumed: legs.filter(l => !l.hist) };
  }
  const ratio = stats ? stats.ok / stats.n : null;
  const risk = stats && stats.n >= MIN_DAYS ? (ratio >= 0.95 ? "low" : ratio >= 0.8 ? "mid" : "high") : "unk";
  const totalWalk = (J.wo.m || 0) + (J.wd.m || 0) + J.tr.reduce((a, b) => a + (b.m || 0), 0);
  return {
    key: legs.map(l => `${l.routeId}:${l.line}@${l.depSched}`).join("|"), legs, J, wo: J.wo, wd: J.wd, tr: J.tr, atStop, leave,
    final: plan.final ?? last.arrSched + lateFor(last, safety) + walkSec(J.wd), typical: typ.final ?? last.arrSched + walkSec(J.wd),
    timetable: last.arrSched + walkSec(J.wd), ok, fail, stats, next: plan.next, risk, transfers: legs.length - 1, totalWalk,
    wait: (trusted(L0) ? L0.depSched + L0.hist.medDep : L0.depSched) - atStop,
  };
}

async function planTrip({ from, to, target, earliest = null, date }) {
  const o = place(from), d = place(to);
  if (!hasCoord(o) || !hasCoord(d)) return { options: [], tooLate: null, error: "Platsen saknar adress." };
  const journeys = (await jpTrips(o, d, date, target)).map(j => parseJourney(j, date));
  await Promise.all(journeys.flatMap(J => J.legs.map(async l => { l.hs = await loadRoutesFor(l.routeId); l.hist = matchLeg(l.hs, l, date); })));
  for (const J of journeys) { const l = J.legs[J.legs.length - 1]; if (J.legs.length > 1 && l) l.next = nextRuns(l, date); }
  const evald = journeys.map(J => evaluate(J, { target, earliest, date })).filter(e => !ui.exclude.has(e.key));
  const rank = (a, b) => b.leave - a.leave || a.transfers - b.transfers || a.totalWalk - b.totalWalk || a.final - b.final;
  const best = new Map();
  for (const e of evald.filter(e => e.ok).sort(rank)) if (!best.has(e.key)) best.set(e.key, e);
  const options = [...best.values()].slice(0, 4);
  const topLeave = options[0]?.leave ?? -Infinity;
  const tooLate = evald.filter(e => !e.ok && e.fail !== "tidigt" && e.leave > topLeave).sort((a, b) => a.leave - b.leave)[0] || null;
  return { options, tooLate, target, any: evald.length };
}

// ---------- Day plans ----------
function eventsOn(date) {
  const wd = dow(date);
  return S.events.filter(e => e.date === date || (e.repeat && date >= e.date && dow(e.date) === wd)).sort((a, b) => a.start - b.start);
}
const routineSec = name => (S.settings.routines[name] || []).reduce((s, [, m]) => s + (Number(m) || 0) * 60, 0);
async function dayPlan(date) {
  const events = eventsOn(date);
  const segs = [];
  let from = "hem", earliest = null;
  for (const ev of events) {
    const target = ev.start - ev.early * 60;
    if (ev.place === from) {
      segs.push({ ev, from, same: true, target });
    } else {
      let res;
      try { res = await planTrip({ from, to: ev.place, target, earliest, date }); }
      catch (e) { res = { options: [], tooLate: null, error: "Kunde inte nå SL:s reseplanerare." }; }
      const chosen = res.options.find(o => o.key === ev.choice) || res.options[0] || null;
      segs.push({ ev, from, res, chosen, target, gap: earliest != null && chosen ? chosen.leave - earliest : null });
    }
    from = ev.place; earliest = ev.end;
  }
  let wake = null, routine = 0;
  if (segs.length) {
    const s0 = segs[0];
    routine = routineSec(s0.ev.routine);
    const leave0 = s0.same ? s0.target : s0.chosen?.leave;
    if (leave0 != null) wake = leave0 - routine;
  }
  return { date, events, segs, wake, routine };
}
// Plans are fetched in the background; render() shows what is ready and asks again when it arrives.
function planFor(date) {
  const sig = JSON.stringify([eventsOn(date), S.home, S.places, S.settings.safety, S.settings.speed, S.settings.customKmh, S.settings.routines, [...ui.exclude]]);
  const cur = ui.plans[date];
  const fresh = cur && cur.sig === sig && (date !== todayIso() || Date.now() - cur.at < 120e3);
  if (!fresh && !cur?.pending) {
    const entry = { sig, pending: true, at: Date.now(), p: cur?.sig === sig ? cur.p : null };
    ui.plans[date] = entry;
    dayPlan(date).then(p => { entry.p = p; entry.pending = false; entry.at = Date.now(); afterPlan(date); })
      .catch(() => { entry.pending = false; entry.error = true; afterPlan(date); });
  }
  return ui.plans[date];
}
function afterPlan(date) {
  if (ui.armed && ui.armed.date === date) rearm(date);
  if ((ui.tab === "idag" && ui.viewDate === date) || ui.tab === "vecka") render();
}
function defaultViewDate() {
  const t = todayIso();
  const ev = eventsOn(t);
  if (ev.length && nowSec() < ev[ev.length - 1].start) return t;
  for (let i = 1; i < 7; i++) if (eventsOn(addDays(t, i)).length) return addDays(t, i);
  return addDays(t, 1);
}

// ---------- Rendering helpers ----------
const METRO = { 10: "metroblue", 11: "metroblue", 13: "red", 14: "red", 17: "green", 18: "green", 19: "green" };
function lineColor(leg) {
  if (leg.cls === 2) return `var(--m-${METRO[parseInt(leg.line, 10)] || "red"})`;
  if (leg.cls === 0 || leg.cls === 1) return "var(--m-train)";
  if (leg.cls === 4) return "var(--m-tram)";
  if (leg.cls === 9) return "var(--m-boat)";
  return /blåbuss/i.test(leg.name) ? "var(--m-blue)" : "var(--m-bus)";
}
const chip = leg => `<span class="chip" style="--lc:${lineColor(leg)}">${esc(leg.line)}</span>`;
const riskText = { low: "Låg risk", mid: "Medelrisk", high: "Hög risk", unk: "Okänd risk", walk: "Bara gång" };
const WHY = { "inställd": "inställd", "gick före": "gick innan du var där", byte: "missat bytet", sent: "för sent fram", "nästa": "tog nästa avgång efter bytet" };
function ticks(stats, mini = false) {
  if (!stats) return "";
  return `<div class="ticks${mini ? " mini" : ""}" aria-hidden="true">${stats.days.map(d => {
    const mon = dow(d.date) === 1;
    return `<span class="tick${d.ok ? "" : " fail"}${mon ? " mon" : ""}" title="${esc(d.date)}: ${d.dep != null ? `gick ${fmt(d.dep, true)}` : "inställd"}${d.ok ? "" : `, ${WHY[d.why] || "hade missat"}`}"></span>`;
  }).join("")}</div>`;
}
function rangeText() {
  const d = META?.dates || [];
  return d.length ? `${shortDate(d[0])}–${shortDate(d[d.length - 1])}` : "";
}
function riskLine(o, date) {
  if (o.walkOnly) return "Ingen buss, ingen förseningsrisk.";
  const kind = KIND_TEXT[dayKind(date)];
  if (o.stats) {
    const fails = o.stats.days.filter(d => !d.ok).reduce((m, d) => (m[d.why] = (m[d.why] || 0) + 1, m), {});
    const failTxt = Object.entries(fails).map(([w, n]) => `${n} ${WHY[w]}`).join(", ");
    const caught = o.stats.days.filter(d => d.ok && d.why === "nästa").length;
    let s = `Hade fungerat <b>${o.stats.ok} av ${o.stats.n}</b> ${kind} (${rangeText()}).${failTxt ? ` Missar: ${failTxt}.` : ""}${caught ? ` ${caught} av dagarna hann du inte bytet men nästa ${esc(o.legs[o.legs.length - 1].line)} räckte.` : ""}`;
    if (o.legs.length > 1 && !o.stats.assumed.length) s += " Bytet är räknat med båda fordonens verkliga tider.";
    if (o.stats.assumed.length) s += ` ${o.stats.assumed.map(l => l.line).join(", ")} saknar historik och antas gå enligt tidtabell.`;
    if (o.stats.n < MIN_DAYS) s += ` För få dagar för att lita på, så appen räknar som utan historik.`;
    return s;
  }
  return `Ingen historik för de här avgångarna. Appen räknar med att ${o.legs.length > 1 ? "varje fordon" : "bussen"} kan vara ${durMin(lateFor(o.legs[o.legs.length - 1], S.settings.safety))} sen.`;
}
function riskShort(o) {
  if (o.walkOnly) return `<span class="risk low">Gång</span>`;
  if (o.stats) return `<span class="risk ${o.risk}">${o.stats.ok}/${o.stats.n}</span>`;
  return `<span class="risk unk">Okänd</span>`;
}
const legsHtml = (o, sep = '<span class="sep">→</span>') => o.walkOnly ? "<span>Gå hela vägen</span>" : o.legs.map(l => `${chip(l)} <span>${fmt(l.depSched)}</span>`).join(sep);
function optRow(o, { rec = false, sel = false, wakeFrom = null } = {}) {
  const big = wakeFrom != null ? `${fmt(o.leave - wakeFrom)}<small>vakna</small>` : `${fmt(o.leave)}<small>gå</small>`;
  return `<button type="button" class="opt${rec ? " rec" : ""}${sel ? " sel" : ""}" data-opt="${esc(o.key)}">
    <span class="big">${big}</span>
    <span class="mid"><span class="legs">${legsHtml(o, '<span aria-hidden="true">→</span>')}</span><span class="sub">${wakeFrom != null ? `Gå ${fmt(o.leave)} · ` : ""}framme ${fmt(o.final)}</span></span>
    <span class="side">${rec ? '<span class="tag">Bäst</span>' : ""}${riskShort(o)}</span>
  </button>`;
}
function tooLateRow(o, wakeFrom = null) {
  const big = wakeFrom != null ? `${fmt(o.leave - wakeFrom)}<small>vakna</small>` : `${fmt(o.leave)}<small>gå</small>`;
  const why = o.fail === "inställd" ? "Inställd" : o.fail === "byte" ? "Bytet håller inte en sen morgon" : "Hinner inte en sen morgon";
  return `<div class="opt no"><span class="big">${big}</span><span class="mid"><span class="legs">${legsHtml(o, "→")}</span><span class="sub warn">${why}</span></span><span class="side"></span></div>`;
}
const walkTxt = w => `${w.m ? `${w.m} m · ` : ""}${dur(walkSec(w))}`;

// Line-map rows for one day: only the stops that matter, details open on tap.
function lmRows(p, { live = null } = {}) {
  const rows = [];
  const row = (t, what, det, seg = "", node = "", style = "", tSmall = "") => {
    const body = det
      ? `<button class="lmb" type="button" data-act="lmtoggle" aria-expanded="false"><span class="what">${what}</span><span class="det">${det}</span></button>`
      : `<span class="what">${what}</span>`;
    rows.push(`<li class="${seg} ${node}${det ? " has" : ""}" style="${style}"><span class="t">${t}${tSmall ? `<small>${tSmall}</small>` : ""}</span><span class="rail"><span class="dot"></span></span><span class="body">${body}</span></li>`);
  };
  p.segs.forEach((s, idx) => {
    if (idx === 0 && p.wake != null) {
      const r = S.settings.routines[s.ev.routine] || [];
      row(fmt(p.wake), "Vakna", `${s.ev.routine === "snabb" ? "Snabb" : "Vanlig"} rutin, ${durMin(p.routine)}: ${r.map(x => esc(x[0])).join(", ")}`, "s-routine", "n-wake");
    }
    if (s.same) {
      row(fmt(s.ev.start), esc(s.ev.title), `${esc(placeName(s.ev.place))} · till ${fmt(s.ev.end)}`, "s-event", "n-event");
      return;
    }
    const o = s.chosen;
    if (!o) {
      row(fmt(s.target), "Går inte ihop", s.res.error ? esc(s.res.error) : s.res.tooLate ? `Bästa resan, ${legsHtml(s.res.tooLate, " → ")}, kommer fram ${fmt(s.res.tooLate.final)} en sen morgon.` : "Ingen resa hittades.", "s-event", "n-bad");
      row(fmt(s.ev.start), esc(s.ev.title), `${esc(placeName(s.ev.place))} · till ${fmt(s.ev.end)}`, "s-event", "n-event");
      return;
    }
    const fromName = s.from === "hem" ? "Gå hemifrån" : `Gå från ${esc(placeName(s.from))}`;
    const gap = s.gap != null && s.gap > 120 ? `${durMin(s.gap)} ledigt innan. ` : "";
    if (o.walkOnly) {
      row(fmt(o.leave), fromName, `${gap}Gå hela vägen, ${o.walkM} m`, "s-walk");
    } else {
      const lv = live && idx === 0 && live.leave != null ? live.leave : o.leave;
      row(fmt(lv), fromName, `${gap}${o.wo.m || o.wo.dur ? `${walkTxt(o.wo)} till ` : ""}${esc(o.legs[0].from.name)}`, "s-walk");
      o.legs.forEach((l, k) => {
        const lc = `--lc: ${lineColor(l)}`;
        const info = l.infos.length ? ` <span class="warn">${l.infos.map(esc).join(" ")}</span>` : "";
        if (k === 0) {
          const usual = trusted(l) ? `Brukar gå ${fmt(l.depSched + l.hist.medDep)} (tidtabell ${fmt(l.depSched)}). ` : "Ingen historik, tidtabellen gäller. ";
          row(fmt(o.atStop), `${chip(l)} ${esc(l.from.name)}`, `${usual}Du står där ${fmt(o.atStop)} och väntar oftast ${dur(o.wait)}. Mot ${esc(l.towards)}.${info}`, "s-bus", "", lc);
        } else {
          const nx = k === o.legs.length - 1 && l.next?.length ? ` Hinner du inte går nästa ${fmt(l.next[0].depSched)}.` : "";
          row(fmt(l.depSched), `${chip(l)} Byt vid ${esc(l.from.name)}`, `Avgår ${fmt(l.depSched)} mot ${esc(l.towards)}${o.tr[k - 1]?.dur ? `, ${walkTxt(o.tr[k - 1])} att gå` : ""}.${nx}${info}`, "s-bus", "", lc);
        }
      });
    }
    const L = o.walkOnly ? null : o.legs[o.legs.length - 1];
    const off = L ? `Kliv av vid ${esc(L.to.name)}${o.wd.dur ? `, ${walkTxt(o.wd)} kvar` : ""}. ` : "";
    row(fmt(o.final), `Framme`, `${off}Räknat på en ${S.settings.safety === "vanlig" ? "vanlig" : "sen"} morgon. Mål ${fmt(s.target)}, ${durMin(s.target - o.final)} tillgodo.`, "s-event", "", "", "senast");
    row(fmt(s.ev.start), esc(s.ev.title), `${esc(placeName(s.ev.place))} · till ${fmt(s.ev.end)}`, "s-event", "n-event");
  });
  return `<ol class="lm">${rows.join("")}</ol>`;
}

function chart(o) {
  const L = o?.legs?.[0];
  if (!L || !L.hist || !L.hist.depS.length) return "";
  const dep = L.depSched, h = L.hist;
  const W = 400, H = 120, pl = 12, pr = 12;
  const lo = Math.min(dep - 150, dep + h.depS[0] - 60, o.atStop - 60), hi = Math.max(dep + 600, dep + h.depS[h.depS.length - 1] + 60);
  const x = s => pl + (s - lo) / (hi - lo) * (W - pl - pr);
  const step = (hi - lo) > 1800 ? 300 : 120;
  let g = "";
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    g += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="22" y2="88"/><text x="${x(t)}" y="106" text-anchor="middle">${fmt(t)}</text>`;
  }
  g += `<line class="tt" x1="${x(dep)}" x2="${x(dep)}" y1="12" y2="92" stroke-width="1.5"/><text x="${x(dep) + 4}" y="14">tidtabell</text>`;
  g += `<line class="you" x1="${x(o.atStop)}" x2="${x(o.atStop)}" y1="22" y2="88" stroke-width="2.5"/>`;
  const stack = {};
  for (const d of h.days) {
    if (d.canceled) continue;
    const k = Math.round(d.dep / 20);
    stack[k] = (stack[k] || 0) + 1;
    g += `<circle class="pt${dow(d.date) === 1 ? " mon" : ""}" cx="${x(dep + d.dep)}" cy="${80 - Math.min(5, stack[k] - 1) * 11}" r="4.5"><title>${d.date}: ${fmt(dep + d.dep, true)}</title></circle>`;
  }
  const canc = h.canceled ? ` ${h.canceled} gång${h.canceled > 1 ? "er" : ""} var den inställd.` : "";
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="När ${esc(L.line)} ${fmt(dep)} faktiskt gick, ${h.depS.length} dagar">${g}</svg></div>
  <div class="legend"><span style="--c: var(--ink)">Avgång</span><span style="--c: var(--bad)">Måndag</span><span style="--c: var(--amber)">Du vid hållplatsen ${fmt(o.atStop)}</span></div>
  <p class="note">Tidigast ${fmt(dep + h.depS[0], true)}, oftast ${fmt(dep + h.medDep, true)}, 9 av 10 senast ${fmt(dep + quantile(h.depS, 0.9), true)}.${canc}</p>`;
}

// ---------- Today ----------
function viewIdag() {
  const date = ui.viewDate || (ui.viewDate = defaultViewDate());
  const entry = planFor(date);
  const p = entry.p;
  const idx = Math.round((dateOf(date) - dateOf(todayIso())) / 864e5);
  let h = `<div class="dayhead">
    <span class="label">${esc(dayName(date))}</span>
    <button class="iconbtn" type="button" data-act="day" data-d="-1" aria-label="Föregående dag" ${idx <= 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
    <button class="iconbtn" type="button" data-act="day" data-d="1" aria-label="Nästa dag" ${idx >= 6 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg></button>
  </div>`;
  const events = eventsOn(date);
  if (!events.length) {
    return h + `<div class="wake none">--:--</div><p class="wake-sub">Inget inplanerat.</p>
      <div class="row"><button class="btn primary" type="button" data-act="newev" data-date="${date}">Lägg till händelse</button></div>`;
  }
  if (!p) {
    return h + `<div class="wake none">--:--</div><p class="wake-sub"><b>${esc(events[0].title)}</b> ${fmt(events[0].start)} · ${esc(placeName(events[0].place))}</p>
      ${entry.error ? `<p class="warn">Kunde inte räkna fram dagen.</p><div><button class="btn small" type="button" data-act="replan">Försök igen</button></div>` : `<p class="loading">Hämtar resor från SL och räknar risk…</p>`}`;
  }
  const s0 = p.segs[0];
  const o = s0?.chosen;
  const ev0 = p.events[0];
  if (ui.live && ui.live.date === date) h += livePanel();
  h += `<div class="wake num${p.wake == null ? " none" : ""}">${p.wake == null ? "--:--" : fmt(p.wake)}</div>
    <p class="wake-sub"><b>${esc(ev0.title)}</b> ${fmt(ev0.start)} · ${esc(placeName(ev0.place))}</p>`;
  if (o) {
    h += `<p class="trip">${legsHtml(o)}<span class="sep">·</span><span>gå ${fmt(o.leave)}</span><span class="sep">·</span><span>framme ${fmt(o.final)}</span></p>
      <div class="riskline"><span class="risk ${o.risk === "walk" ? "low" : o.risk}">${riskText[o.risk]}</span>${o.stats ? `${ticks(o.stats, true)}<span class="note">${o.stats.ok} av ${o.stats.n} ${KIND_TEXT[dayKind(date)]}</span>` : ""}</div>`;
    const infos = o.legs.flatMap(l => l.infos);
    if (infos.length) h += `<p class="warn">${infos.map(esc).join(" ")}</p>`;
  }
  if (entry.pending) h += `<p class="loading">Uppdaterar…</p>`;
  const armedHere = ui.armed && ui.armed.date === date;
  h += `<div class="row"><button class="btn primary" type="button" data-act="arm" ${p.wake == null ? "disabled" : ""}>${armedHere ? "Stäng av larmet" : "Aktivera larm"}</button>
    ${p.wake != null ? `<button class="btn ghost" type="button" data-act="ics">Lägg i kalendern</button>` : ""}</div>`;
  h += `<p class="armed" id="armStatus"${armedHere ? "" : ' style="color:var(--muted)"'}>${armStatus(date)}</p>`;
  h += `<div class="block"><h2>Dagen</h2>${lmRows(p, { live: ui.live?.date === date ? ui.live : null })}</div>`;
  if (!o) return h;
  h += `<div><button class="btn ghost" type="button" data-act="details" aria-expanded="${!!ui.details}">${ui.details ? "Dölj detaljer" : "Visa detaljer"}</button></div>`;
  if (!ui.details) return h;
  const L = o.walkOnly ? null : o.legs[0];
  if (!o.walkOnly) h += `<div class="block"><h2>Karta</h2>${mapDiv({ kind: "trip", date, seg: 0 })}</div>`;
  if (L && trusted(L)) {
    const tt = Math.floor((L.depSched - 300) / 60) * 60;
    h += `<div class="block"><h2>Vad du vinner</h2><p>${durMin(o.atStop - tt)} mer sömn och ca ${dur(o.wait)} väntan i stället för ${dur(L.depSched + L.hist.medDep - tt)}, jämfört med att stå vid hållplatsen 5 min före tidtabellen.</p></div>`;
  }
  h += `<div class="block"><div class="riskhead"><h2>Risk</h2><span class="risk ${o.risk === "walk" ? "low" : o.risk}">${riskText[o.risk]}</span></div>
    ${ticks(o.stats)}<p class="note">${riskLine(o, date)} Säkerhetsnivå: <button class="link" type="button" data-act="settings">${SAFETY[S.settings.safety].name}</button>.</p></div>`;
  if (L?.hist) h += `<div class="block"><h2>Så brukar ${esc(L.line)} ${fmt(L.depSched)} gå</h2>${chart(o)}</div>`;
  h += `<div class="block"><h2>Andra sätt att åka</h2><div class="opts">${s0.res.options.map((a, i) => optRow(a, { rec: i === 0, sel: a.key === o.key, wakeFrom: p.routine })).join("")}${s0.res.tooLate ? tooLateRow(s0.res.tooLate, p.routine) : ""}</div></div>`;
  return h;
}
function armStatus(date) {
  if (ui.armed && ui.armed.date === date) {
    const left = ui.armed.at - Date.now();
    if (left <= 0) return "Larmet ringer.";
    return `Larmet är på och ringer ${fmt(ui.armed.wake)}, om ${dur(left / 1000)}. Ha sidan öppen och skärmen tänd.${ui.armed.note ? ` ${ui.armed.note}` : ""}`;
  }
  return "Larmet ringer bara medan sidan är öppen och skärmen tänd. Lägg tiden i kalendern som reserv.";
}

// ---------- Live: realtime for the next departure ----------
// Runs from 45 minutes before you leave until you are there. With a GTFS-RT key it reads
// SL's TripUpdates and VehiclePositions; without one it uses the planner's estimated times.
function liveTarget() {
  const date = todayIso();
  const p = ui.plans[date]?.p;
  const o = p?.segs[0]?.chosen;
  if (!o || o.walkOnly) return null;
  const t = nowSec();
  if (t < o.leave - 45 * 60 || t > o.final + 120) return null;
  return { date, p, o };
}
let liveTimer = null, liveBusy = false, rtTrips = { at: 0, feed: null };
function liveLoop() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(liveLoop, 20e3);
  if (document.visibilityState !== "visible" || liveBusy) return;
  const tgt = liveTarget();
  if (!tgt) { if (ui.live) { ui.live = null; if (ui.tab === "idag") render(); } return; }
  liveBusy = true;
  updateLive(tgt).catch(e => { ui.live = { ...(ui.live || {}), date: tgt.date, error: e.message || String(e) }; })
    .finally(() => { liveBusy = false; if (ui.tab === "idag" && ui.viewDate === tgt.date && !ui.sheet) render(); });
}
function findRtTrip(feed, leg, date) {
  const depEpoch = epochOf(date, leg.depSched) / 1000;
  for (const t of feed.trips) {
    if (t.trip?.routeId && leg.routeId && baseRoute(t.trip.routeId) !== leg.routeId) continue;
    const i = t.stops.findIndex(u => RT.areaOf(u.stopId) === leg.from.area);
    if (i < 0) continue;
    const u = t.stops[i], ev = u.dep?.time ? u.dep : u.arr;
    if (!ev?.time || Math.abs(ev.time - (ev.delay || 0) - depEpoch) > MATCH_S) continue;
    if (!t.trip?.routeId && !t.stops.slice(i + 1).some(x => RT.areaOf(x.stopId) === leg.to.area)) continue;
    const now = Date.now() / 1000;
    return { t, u, pred: ev.time, delay: ev.delay || 0, canceled: t.trip?.rel === RT.CANCELED || u.rel === RT.SKIPPED, away: t.stops.slice(0, i).filter(x => (x.dep?.time || x.arr?.time || 0) > now).length };
  }
  return null;
}
async function updateLive({ date, o }) {
  const L = o.legs[0];
  const live = { date, key: o.key, leg: L, source: null, pred: null, delay: null, pos: null, away: null, canceled: false, leave: null, at: Date.now() };
  const key = (S.settings.rtKey || "").trim();
  if (key) {
    if (!rtTrips.feed || Date.now() - rtTrips.at > 45e3) rtTrips = { at: Date.now(), feed: await RT.fetchFeed("TripUpdates", key) };
    const m = findRtTrip(rtTrips.feed, L, date);
    if (m) {
      Object.assign(live, { source: "rt", pred: relSec(m.pred * 1000, date), delay: m.delay, canceled: m.canceled, away: m.away });
      const vp = await RT.fetchFeed("VehiclePositions", key);
      const v = vp.vehicles.find(x => (m.t.trip?.tripId && x.trip?.tripId === m.t.trip.tripId) || (m.t.vehicle && x.vehicle === m.t.vehicle));
      if (v?.pos?.lat) live.pos = { lat: v.pos.lat, lon: v.pos.lon, age: Math.round(Date.now() / 1000 - (v.timestamp || 0)) };
    }
  }
  if (live.pred == null) {
    // Fall back to the planner's own realtime estimate.
    const fresh = await jpTrips(place("hem"), place(ui.plans[date].p.segs[0].ev.place), date, ui.plans[date].p.segs[0].target);
    for (const j of fresh) {
      const J = parseJourney(j, date);
      const l = J.legs.find(x => x.routeId === L.routeId && x.from.area === L.from.area && sameTime(x.depSched, L.depSched));
      if (l) { Object.assign(live, { source: "jp", pred: l.depEst ?? l.depSched, delay: (l.depEst ?? l.depSched) - l.depSched, canceled: l.canceled }); break; }
    }
  }
  if (live.canceled) {
    ui.exclude.add(o.key);
    delete ui.plans[date];
  } else if (live.pred != null && live.pred - nowSec() < 25 * 60) {
    // Predictions are only worth acting on close to departure.
    // Be at the stop 90 s before the predicted departure; only worth saying if it moves by a minute or more.
    const atStop = Math.floor((live.pred - 90) / 60) * 60;
    if (Math.abs(atStop - o.atStop) >= 60) live.leave = atStop - walkSec(o.wo);
  }
  ui.live = live;
  refreshLiveMarker();
}
function livePanel() {
  const lv = ui.live, o = ui.plans[lv.date]?.p?.segs[0]?.chosen;
  if (!o) return "";
  const L = lv.leg, t = nowSec();
  const leave = lv.leave ?? o.leave;
  let say = t < leave - 300 ? `Gå om ${durMin(leave - t)}` : t < leave ? `Gå om ${dur(leave - t)}` : "Gå nu";
  if (lv.pred != null && t > lv.pred + 60) say = `På ${L.line}`;
  if (lv.canceled) say = `${L.line} ${fmt(L.depSched)} är inställd`;
  let detail = "";
  if (lv.canceled) detail = "Appen letar en annan resa.";
  else if (lv.pred != null) {
    detail = `${chip(L)} ${fmt(L.depSched)} från ${esc(L.from.name)} · beräknas <b>${fmt(lv.pred, true)}</b> (${signMin(lv.pred - L.depSched)})`;
    if (lv.away != null) detail += ` · ${lv.away ? `${lv.away} hållplats${lv.away === 1 ? "" : "er"} bort` : "nästa hållplats är din"}`;
    if (lv.leave != null) detail += `<br>Gå ${fmt(lv.leave)} i stället för ${fmt(o.leave)}.`;
  } else if (lv.error) detail = `<span class="warn">${esc(lv.error)}</span>`;
  else detail = "Ingen realtid för turen än.";
  const src = lv.source === "rt" ? "SL realtid (GTFS-RT)" : lv.source === "jp" ? `SL:s reseplanerare${S.settings.rtKey ? ". Bussens position kommer när den börjar sin tur" : '. <button class="link" type="button" data-act="settings">Lägg in en GTFS-RT-nyckel</button> för bussens position'}` : "";
  return `<div class="live" aria-live="polite">
    <div class="spread"><span class="label">Just nu</span><span class="when">${fmt(t)}</span></div>
    <div class="say">${say}</div><p>${detail}</p>
    ${lv.pos ? mapDiv({ kind: "trip", date: lv.date, seg: 0, live: true }) : ""}
    ${src ? `<p class="note">Källa: ${src}.${lv.pos ? ` Positionen är ${lv.pos.age} s gammal.` : ""}</p>` : ""}
  </div>`;
}

// ---------- Maps (Leaflet + OpenStreetMap) ----------
const maps = [];
let liveMarker = null;
function mapDiv(spec) { return `<div class="lmap${spec.editing ? " editing" : ""}" data-map='${esc(JSON.stringify(spec))}' role="img" aria-label="Karta"></div>`; }
const divIcon = (cls, size, style = "") => L.divIcon({ className: "mk", html: `<div class="${cls}" style="${style}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const label = (latlng, text) => L.marker(latlng, { interactive: false, icon: L.divIcon({ className: "mk-label", html: esc(text), iconSize: null, iconAnchor: [-10, 8] }) });
function unmountMaps() { while (maps.length) { try { maps.pop().remove(); } catch {} } liveMarker = null; }
function mountMaps() {
  if (typeof L === "undefined") return;
  document.querySelectorAll(".lmap").forEach(el => {
    const spec = JSON.parse(el.dataset.map);
    const m = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
    maps.push(m);
    const pts = [];
    const css = getComputedStyle(document.documentElement);
    if (spec.kind === "places") {
      const all = [{ id: "hem", ...S.home }, ...S.places].filter(hasCoord);
      for (const p of all) {
        L.marker(p.coord, { icon: p.id === "hem" ? divIcon("mk-home", 22) : divIcon("mk-place", 14), title: p.name }).addTo(m);
        label(p.coord, p.name).addTo(m);
        pts.push(p.coord);
      }
      if (spec.editing) m.on("click", e => mapPick(e.latlng));
    } else if (spec.kind === "trip") {
      const seg = spec.resa ? { chosen: ui.resaRes?.find(x => x.key === spec.key), from: ui.resa.from, ev: { place: ui.resa.to } } : ui.plans[spec.date]?.p?.segs[spec.seg];
      const o = seg?.chosen;
      if (!o) return;
      for (const c of o.J.walkCoords) if (c.length > 1) L.polyline(c, { color: css.getPropertyValue("--muted").trim() || "#999", weight: 3, dashArray: "2 7", lineCap: "round" }).addTo(m);
      for (const l of o.legs) {
        const col = css.getPropertyValue(lineColor(l).slice(4, -1)).trim() || "#e2604c";
        if (l.coords.length > 1) L.polyline(l.coords, { color: col, weight: 6, opacity: .9 }).addTo(m);
        pts.push(...l.coords);
        for (const s of [l.from, l.to]) if (s.coord) { L.marker(s.coord, { icon: divIcon("mk-stop" + (s === o.legs[0].from ? " hl" : ""), 14), title: s.name }).addTo(m); label(s.coord, s.name).addTo(m); }
      }
      for (const id of [seg.from, seg.ev.place]) {
        const p = place(id);
        if (hasCoord(p) && !p.stopId) { L.marker(p.coord, { icon: id === "hem" ? divIcon("mk-home", 22) : divIcon("mk-place", 14) }).addTo(m); pts.push(p.coord); }
      }
      if (spec.live && ui.live?.pos) {
        const L0 = o.legs[0];
        liveMarker = L.marker([ui.live.pos.lat, ui.live.pos.lon], { icon: divIcon("mk-bus", 26, `--lc:${col0(L0, css)}`), title: `${L0.line} just nu`, zIndexOffset: 1000 }).addTo(m);
        m.setView([ui.live.pos.lat, ui.live.pos.lon], 14);
        m.fitBounds(L.latLngBounds([[ui.live.pos.lat, ui.live.pos.lon], L0.from.coord]).pad(0.4));
        return;
      }
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.15));
    else if (pts.length) m.setView(pts[0], 15);
    else m.setView([59.3293, 18.0686], 11);
  });
}
const col0 = (leg, css) => css.getPropertyValue(lineColor(leg).slice(4, -1)).trim();
function refreshLiveMarker() {
  if (liveMarker && ui.live?.pos) liveMarker.setLatLng([ui.live.pos.lat, ui.live.pos.lon]);
}

// ---------- Alarm screen and sound ----------
let audioCtx = null, soundTimer = null, wakeLock = null;
function beep(vol) {
  const t = audioCtx.currentTime;
  [[0, 784], [0.18, 988]].forEach(([o, f]) => {
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + o);
    g.gain.exponentialRampToValueAtTime(vol, t + o + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.15);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t + o); osc.stop(t + o + 0.17);
  });
}
function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume?.(); } catch { audioCtx = null; }
}
function startSound() {
  stopSound();
  if (!audioCtx) return;
  let n = 0;
  const play = () => { try { beep(Math.min(0.4, 0.02 + n * 0.015)); } catch {} n++; };
  play();
  soundTimer = setInterval(play, 1100);
  try { navigator.vibrate?.([500, 300, 500, 300, 500]); } catch {}
}
function stopSound() { clearInterval(soundTimer); soundTimer = null; try { navigator.vibrate?.(0); } catch {} }
function snoozeInfo(ctx) {
  const ev = ctx.p.segs[0].ev;
  const slack = ev.routine === "vanlig" ? routineSec("vanlig") - routineSec("snabb") : 0;
  const len = Math.max(1, Number(S.settings.snooze) || 5) * 60;
  const used = ctx.snoozes * len;
  const left = Math.floor((slack - used) / len);
  return { len, left: Math.max(0, left), routineLeft: ctx.p.routine - used };
}
function showAlarm() {
  const ctx = ui.armed;
  ui.alarm = true;
  const o = ctx.p.segs[0].chosen, ev = ctx.p.segs[0].ev;
  const sn = snoozeInfo(ctx);
  const leg = o && !o.walkOnly ? `${o.legs[0].line} ${fmt(o.legs[0].depSched)}` : "Gå";
  $("alarmInner").innerHTML = `<div class="now">${fmt(nowSec())}</div>
    <p class="what"><span>${esc(leg)}</span> · ${esc(ev.title)} ${fmt(ev.start)}</p>
    <p class="hint">Gå hemifrån ${fmt(o ? o.leave : ctx.p.segs[0].target)}. Rutinen har ${durMin(sn.routineLeft)} kvar.</p>
    <div class="btns">
      <button class="btn primary" type="button" data-act="alarmoff">Stäng av</button>
      <button class="btn" type="button" data-act="snooze" ${sn.left ? "" : "disabled"}>${sn.left ? `Snooza ${durMin(sn.len)}` : "Ingen marginal kvar"}</button>
    </div>
    <p class="hint">${sn.left ? `${sn.left} snooze kvar. Varje snooze kortar rutinen, bussen är densamma.` : ev.routine === "snabb" ? "Du har redan snabb rutin, så det finns ingen tid att snooza på." : "Rutinen är nere på snabb rutin. Snooza mer och du missar bussen."}</p>`;
  $("alarm").hidden = false;
  startSound();
  $("alarmInner").querySelector("button")?.focus();
}
function closeAlarm(snooze) {
  stopSound();
  $("alarm").hidden = true;
  ui.alarm = null;
  const ctx = ui.armed;
  if (!ctx) return;
  if (snooze) {
    const sn = snoozeInfo(ctx);
    ctx.snoozes++; ctx.at += sn.len * 1000; ctx.wake += sn.len; ctx.rang = false;
  } else {
    ctx.done = true;
    releaseWakeLock();
  }
  render();
}
async function arm(date) {
  if (ui.armed && ui.armed.date === date) { ui.armed = null; releaseWakeLock(); render(); return; }
  unlockAudio();
  const p = ui.plans[date]?.p;
  if (!p || p.wake == null) return;
  ui.armed = { date, p, at: epochOf(date, p.wake), wake: p.wake, snoozes: 0, rang: false, note: "" };
  try { audioCtx && beep(0.08); } catch {}
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
  render();
}
// A fresh plan can move the alarm, for example when SL cancels the bus. Never after it has rung.
function rearm(date) {
  const a = ui.armed, p = ui.plans[date]?.p;
  if (!a || a.rang || a.done || a.snoozes || !p || p.wake == null) return;
  if (p.wake !== a.wake) {
    a.note = `Väckningen flyttades från ${fmt(a.wake)} till ${fmt(p.wake)}: ${p.segs[0].chosen ? legsHtml(p.segs[0].chosen, " → ").replace(/<[^>]+>/g, "") : "ny resa"}.`;
    a.wake = p.wake; a.at = epochOf(date, p.wake);
  }
  a.p = p;
}
function releaseWakeLock() { try { wakeLock?.release(); } catch {} wakeLock = null; }

// Calendar file as a backup alarm: one event at the wake time with an alarm on it.
function downloadIcs(date) {
  const p = ui.plans[date]?.p;
  if (!p || p.wake == null) return;
  const o = p.segs[0].chosen, ev = p.segs[0].ev;
  const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const icsEsc = s => String(s).replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const trip = o ? (o.walkOnly ? "Gå hela vägen" : o.legs.map(l => `${l.line} ${fmt(l.depSched)} från ${l.from.name}`).join(", byt till ")) : "";
  const desc = `Gå hemifrån ${o ? fmt(o.leave) : ""}. ${trip}. ${ev.title} ${fmt(ev.start)}.`;
  const start = epochOf(date, p.wake);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Busslarm//SV", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:busslarm-${date}-${p.wake}@busslarm`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + 10 * 60e3)}`,
    `SUMMARY:${icsEsc(`Vakna · ${ev.title}`)}`, `DESCRIPTION:${icsEsc(desc)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Vakna")}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `busslarm-${date}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- Week ----------
function viewVecka() {
  const t = todayIso();
  let h = `<div class="spread"><h2>Veckan</h2><button class="btn small" type="button" data-act="newev" data-date="${addDays(t, 1)}">Ny händelse</button></div><div>`;
  for (let i = 0; i < 7; i++) {
    const date = addDays(t, i);
    const events = eventsOn(date);
    const p = events.length ? planFor(date).p : null;
    const name = i === 0 ? "Idag" : i === 1 ? "Imorgon" : `${DOW[dow(date)][0].toUpperCase() + DOW[dow(date)].slice(1)} ${dateOf(date).getUTCDate()}/${dateOf(date).getUTCMonth() + 1}`;
    const bad = p?.segs.some(s => !s.same && !s.chosen);
    const first = events[0];
    const more = events.length > 1 ? ` <span class="note">+${events.length - 1}</span>` : "";
    const open = ui.openDay === date;
    const w = !events.length ? "–" : p ? (p.wake == null ? "–" : fmt(p.wake)) : "…";
    h += `<button class="dayrow" type="button" data-act="toggleday" data-date="${date}" aria-expanded="${open}">
      <span class="dn">${name}</span>
      <span class="w${p?.wake == null ? " none" : ""}">${w}</span>
      <span class="e">${first ? `${esc(first.title)} ${fmt(first.start)}${more}` : '<span class="note">Inget inplanerat</span>'}${bad ? ' <span class="warn">· går inte ihop</span>' : ""}</span>
    </button>`;
    if (open) {
      h += `<div class="dayopen">`;
      for (const e of events) {
        const s = p?.segs.find(x => x.ev.id === e.id);
        h += `<button class="ev" type="button" data-act="editev" data-id="${esc(e.id)}"><span class="t">${fmt(e.start)}</span><span>${esc(e.title)}<br><span class="sub">${esc(placeName(e.place))}${e.repeat ? " · varje vecka" : ""}${s && !s.same && !s.chosen ? ' · <span class="warn">hinner inte</span>' : ""}</span></span></button>`;
      }
      h += `<div class="row">${events.length ? `<button class="btn small" type="button" data-act="openday" data-date="${date}">Visa dagen</button>` : ""}<button class="btn small ghost" type="button" data-act="newev" data-date="${date}">Lägg till</button></div></div>`;
    }
  }
  h += `</div>`;
  if (S.events.some(e => e.example)) h += `<div><button class="link" type="button" data-act="clearex">Ta bort exempelhändelsen</button></div>`;
  return h;
}

function placeOptions(sel) {
  return [{ id: "hem", name: "Hem" }, ...S.places].map(p => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
}
function openEventEditor(id, date) {
  const e = id ? S.events.find(x => x.id === id) : { id: null, title: "", place: S.places[0]?.id || "hem", date: date || addDays(todayIso(), 1), start: pc("08:30"), end: pc("09:30"), early: 10, routine: "vanlig", repeat: false };
  if (!e) return;
  openSheet(`<div class="sheet-head"><h2>${id ? "Ändra händelse" : "Ny händelse"}</h2><button class="btn small ghost" type="button" data-act="close">Stäng</button></div>
    <form id="evForm" class="steps" novalidate>
      <label class="field" for="ev-title">Vad<input id="ev-title" required maxlength="60" value="${esc(e.title)}" placeholder="Till exempel Prov i matte"></label>
      <label class="field" for="ev-place">Var<select id="ev-place">${placeOptions(e.place)}</select></label>
      <p class="note">Saknas platsen? Lägg till den under <button class="link" type="button" data-act="goplaces">Platser</button>.</p>
      <div class="grid2">
        <label class="field" for="ev-date">Dag<input id="ev-date" type="date" value="${esc(e.date)}"></label>
        <label class="field" for="ev-early">Vara där före (min)<input id="ev-early" type="number" min="0" max="120" step="1" value="${e.early}"></label>
      </div>
      <div class="grid2">
        <label class="field" for="ev-start">Börjar<input id="ev-start" type="time" value="${fmt(e.start)}"></label>
        <label class="field" for="ev-end">Slutar<input id="ev-end" type="time" value="${fmt(e.end)}"></label>
      </div>
      <label class="field" for="ev-routine">Morgonrutin om det är dagens första<select id="ev-routine">
        <option value="vanlig" ${e.routine === "vanlig" ? "selected" : ""}>Vanlig (${durMin(routineSec("vanlig"))})</option>
        <option value="snabb" ${e.routine === "snabb" ? "selected" : ""}>Snabb (${durMin(routineSec("snabb"))})</option></select></label>
      <label class="check" for="ev-repeat"><input id="ev-repeat" type="checkbox" ${e.repeat ? "checked" : ""}> Upprepa varje vecka</label>
      <p class="note warn" id="ev-err" hidden></p>
      <div class="row"><button class="btn primary" type="submit">Spara</button>${id ? `<button class="btn danger ghost" type="button" data-act="delev" data-id="${esc(id)}">Ta bort</button>` : ""}</div>
    </form>`);
  $("evForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const title = $("ev-title").value.trim();
    const start = $("ev-start").value ? pc($("ev-start").value) : null;
    const end = $("ev-end").value ? pc($("ev-end").value) : null;
    const err = $("ev-err");
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (!title) return fail("Skriv vad det är.");
    if (!$("ev-date").value) return fail("Välj en dag.");
    if (start == null || end == null) return fail("Fyll i när det börjar och slutar.");
    if (end <= start) return fail("Sluttiden måste vara efter starttiden.");
    const rec = { title, place: $("ev-place").value, date: $("ev-date").value, start, end, early: Math.max(0, Math.min(120, Number($("ev-early").value) || 0)), routine: $("ev-routine").value, repeat: $("ev-repeat").checked, example: false };
    if (id) Object.assign(e, rec, { choice: e.place === rec.place && e.start === rec.start && e.early === rec.early ? e.choice : undefined });
    else S.events.push({ id: "e" + Date.now().toString(36), ...rec });
    saveState(); closeSheet(); render();
  });
}

// ---------- Trip search ----------
function viewResa() {
  const r = ui.resa;
  r.date ||= addDays(todayIso(), 1);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(todayIso(), i));
  return `<h2>Sök resa</h2>
    <div class="steps">
      <div class="grid2">
        <label class="field" for="r-from">Från<select id="r-from">${placeOptions(r.from)}</select></label>
        <label class="field" for="r-to">Till<select id="r-to">${placeOptions(r.to)}</select></label>
      </div>
      <div class="grid2">
        <label class="field" for="r-date">Dag<select id="r-date">${dates.map(d => `<option value="${d}" ${d === r.date ? "selected" : ""}>${esc(dayName(d))}</option>`).join("")}</select></label>
        <label class="field" for="r-time">Framme senast<input id="r-time" type="time" value="${esc(r.time)}"></label>
      </div>
      <p class="note">Andra adresser lägger du till under <button class="link" type="button" data-act="goplaces">Platser</button>.</p>
    </div><div id="resaOut"></div>`;
}
let resaSeq = 0;
async function renderResaResults() {
  const r = ui.resa, out = $("resaOut");
  if (!out) return;
  if (r.from === r.to) { out.innerHTML = `<p class="note">Välj två olika platser.</p>`; return; }
  const target = r.time ? pc(r.time) : null;
  if (target == null) { out.innerHTML = `<p class="note">Fyll i när du ska vara framme.</p>`; return; }
  const seq = ++resaSeq;
  if (!ui.resaRes || ui.resaSig !== JSON.stringify([r.from, r.to, r.date, r.time])) {
    out.innerHTML = `<p class="loading">Hämtar resor från SL…</p>`;
    let res;
    try { res = await planTrip({ from: r.from, to: r.to, target, date: r.date }); }
    catch { if (seq === resaSeq) out.innerHTML = `<div class="block"><p class="warn">Kunde inte nå SL:s reseplanerare.</p><div><button class="btn small" type="button" data-act="retryresa">Försök igen</button></div></div>`; return; }
    if (seq !== resaSeq) return;
    ui.resaRes = res.options; ui.resaTooLate = res.tooLate; ui.resaSig = JSON.stringify([r.from, r.to, r.date, r.time]);
  }
  const options = ui.resaRes;
  const wakeFrom = r.from === "hem" ? routineSec("vanlig") : null;
  if (!options.length) {
    out.innerHTML = `<div class="block"><p class="warn">Ingen resa hinner fram ${fmt(target)} en ${S.settings.safety === "vanlig" ? "vanlig" : "sen"} morgon.</p>${ui.resaTooLate ? `<div class="opts">${tooLateRow(ui.resaTooLate, wakeFrom)}</div>` : ""}</div>`;
    return;
  }
  let h = `<div class="block"><h2>Förslag</h2><div class="opts">`;
  options.forEach((o, i) => {
    h += optRow(o, { rec: i === 0, sel: r.open === o.key, wakeFrom });
    if (r.open === o.key) h += optDetail(o, r);
  });
  if (ui.resaTooLate) h += tooLateRow(ui.resaTooLate, wakeFrom);
  h += `</div></div>`;
  unmountMaps();
  out.innerHTML = h;
  mountMaps();
}
function optDetail(o, r) {
  const fake = { segs: [{ ev: { title: placeName(r.to), place: r.to, start: pc(r.time), end: pc(r.time), routine: "vanlig" }, from: r.from, chosen: o, target: pc(r.time) }], wake: null };
  let h = `<div class="optdetail">${lmRows(fake).replace(/<li class="s-event n-event[^"]*"[\s\S]*?<\/li><\/ol>$/, "</ol>")}`;
  h += `<p class="riskline"><span class="risk ${o.risk === "walk" ? "low" : o.risk}">${riskText[o.risk]}</span>${o.stats ? ticks(o.stats, true) : ""}</p><p class="note">${riskLine(o, r.date)}</p>`;
  if (!o.walkOnly) h += mapDiv({ kind: "trip", resa: true, key: o.key });
  h += `<div class="row"><button class="btn small" type="button" data-act="addtrip" data-key="${esc(o.key)}">Lägg till i veckan</button></div></div>`;
  return h;
}

// ---------- Places ----------
function viewPlatser() {
  const editing = ui.mapEdit;
  let h = `<h2>Platser</h2>`;
  if (editing) h += `<p style="color:var(--amber)">${editing.kind === "home" ? "Tryck på kartan där du bor." : `Tryck på kartan där ${esc(placeName(editing.id))} ligger.`} <button class="link" type="button" data-act="cancelmap">Avbryt</button></p>`;
  h += mapDiv({ kind: "places", editing: !!editing });
  h += `<ul class="places">`;
  for (const p of [{ id: "hem", ...S.home }, ...S.places]) {
    const isHome = p.id === "hem";
    h += `<li><span class="name"><span>${esc(isHome ? "Hem" : p.name)}</span><span class="row">
        <button class="link" type="button" data-act="editpl" data-id="${esc(p.id)}">Ändra</button>
        <button class="link" type="button" data-act="movepl" data-id="${esc(p.id)}">Flytta på kartan</button>
        ${isHome ? "" : `<button class="link" type="button" data-act="delpl" data-id="${esc(p.id)}">Ta bort</button>`}</span></span>
      <span class="sub">${esc(p.label || "Ingen adress")}${p.stopId ? " · åker från hållplatsen" : ""}</span>
    </li>`;
  }
  h += `</ul>`;
  if (ui.confirmDel) {
    const p = place(ui.confirmDel);
    const used = S.events.filter(e => e.place === ui.confirmDel).length;
    h += `<div class="block"><p>Ta bort ${esc(p?.name)}?${used ? ` ${used} händelse${used > 1 ? "r" : ""} använder platsen och flyttas till Hem.` : ""}</p><div class="row"><button class="btn danger" type="button" data-act="delplok">Ta bort</button><button class="btn ghost" type="button" data-act="delplno">Avbryt</button></div></div>`;
  }
  h += `<div class="block"><h2>Ny plats</h2><div><button class="btn" type="button" data-act="newpl">Sök adress eller hållplats</button></div></div>`;
  return h;
}
// Sheet with an address search. Used for new places, changing a place and home.
function openPlaceEditor(id) {
  const p = id ? place(id) : { id: null, name: "", label: "", coord: null, stopId: null };
  ui.pick = p.coord ? { label: p.label, coord: p.coord, stopId: p.stopId } : null;
  const isHome = id === "hem";
  const draw = () => {
    const pick = ui.pick;
    $("plPicked").innerHTML = pick ? `<div class="picked"><span>${esc(pick.label)}</span><span class="badge">${pick.stopId ? "hållplats" : "adress"}</span></div>` : `<p class="note">Ingen adress vald än.</p>`;
  };
  openSheet(`<div class="sheet-head"><h2>${isHome ? "Hem" : id ? "Ändra plats" : "Ny plats"}</h2><button class="btn small ghost" type="button" data-act="close">Stäng</button></div>
    <form id="plForm" class="steps" novalidate>
      ${isHome ? "" : `<label class="field" for="pl-name">Namn<input id="pl-name" maxlength="30" value="${esc(p.name)}" placeholder="Till exempel Skolan"></label>`}
      <div class="search"><label class="field" for="pl-q">Adress eller hållplats<input id="pl-q" autocomplete="off" placeholder="Till exempel Drottninggatan 20" value=""></label>
        <ul class="results" id="plResults" hidden></ul></div>
      <div id="plPicked"></div>
      <p class="note">Väljer du en hållplats räknar appen från hållplatsen. Med en adress räknar den med gångvägen dit.</p>
      <p class="note warn" id="pl-err" hidden></p>
      <div class="row"><button class="btn primary" type="submit">Spara</button></div>
    </form>`);
  draw();
  let timer = null, last = "";
  $("pl-q").addEventListener("input", e => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 3) { $("plResults").hidden = true; return; }
    timer = setTimeout(async () => {
      last = q;
      let list = [];
      try { list = await searchPlaces(q); } catch { list = null; }
      if (q !== last || !$("plResults")) return;
      ui.searchList = list || [];
      const kindName = { stop: "Hållplats", singlehouse: "Adress", street: "Gata", poi: "Plats", locality: "Ort", suburb: "Område" };
      $("plResults").innerHTML = list == null ? `<li><button type="button" disabled>Sökningen misslyckades.</button></li>`
        : list.length ? list.map((l, i) => `<li><button type="button" data-act="pickres" data-i="${i}"><span class="k">${esc(kindName[l.kind] || l.kind)}</span><span>${esc(l.label)}</span></button></li>`).join("")
          : `<li><button type="button" disabled>Inga träffar.</button></li>`;
      $("plResults").hidden = false;
    }, 300);
  });
  ui.drawPick = draw;
  $("plForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const err = $("pl-err");
    const name = isHome ? "Hem" : $("pl-name").value.trim();
    if (!name) { err.textContent = "Ge platsen ett namn."; err.hidden = false; return; }
    if (!ui.pick) { err.textContent = "Sök och välj en adress."; err.hidden = false; return; }
    const rec = { name, label: ui.pick.label, coord: ui.pick.coord, stopId: ui.pick.stopId || null };
    if (isHome) Object.assign(S.home, rec);
    else if (id) Object.assign(S.places.find(x => x.id === id), rec);
    else S.places.push({ id: "p" + Date.now().toString(36), ...rec });
    saveState(); closeSheet(); render();
  });
}
function mapPick(latlng) {
  const e = ui.mapEdit;
  if (!e) return;
  const coord = [+latlng.lat.toFixed(6), +latlng.lng.toFixed(6)];
  const rec = { coord, stopId: null, label: `Vald på kartan (${coord[0].toFixed(4)}, ${coord[1].toFixed(4)})` };
  if (e.id === "hem") Object.assign(S.home, rec);
  else Object.assign(S.places.find(p => p.id === e.id) || {}, rec);
  ui.mapEdit = null;
  saveState(); render();
}

// ---------- Settings ----------
function openSettings() {
  const st = S.settings;
  const steps = name => (st.routines[name] || []).map(([n, m], i) => `<div class="step">
      <input class="inp" id="rt-${name}-n-${i}" data-rt="${name}" data-i="${i}" data-f="n" value="${esc(n)}" aria-label="Moment">
      <input class="inp" id="rt-${name}-m-${i}" data-rt="${name}" data-i="${i}" data-f="m" type="number" min="0" max="120" value="${m}" aria-label="Minuter">
      <button class="x" type="button" data-act="rtdel" data-rt="${name}" data-i="${i}" aria-label="Ta bort ${esc(n)}">✕</button></div>`).join("");
  openSheet(`<div class="sheet-head"><h2>Inställningar</h2><button class="btn small ghost" type="button" data-act="close">Klar</button></div>
    <div class="steps"><div class="spread"><span class="label">Realtid (GTFS-RT)</span><span class="badge${st.rtKey ? " ok" : ""}" id="keyBadge">${st.rtKey ? "Nyckel sparad" : "Ingen nyckel"}</span></div>
      <p class="note">Klistra in din Trafiklab-nyckel för GTFS Regional Realtime. Den behövs för bussens position och SL:s egna förseningar. Utan nyckel används reseplanerarens beräknade tider.</p>
      <div class="keybox"><input class="inp" id="set-key" type="password" autocomplete="off" spellcheck="false" placeholder="Klistra in nyckeln" value="${esc(st.rtKey)}" aria-label="GTFS-RT-nyckel">
        <button class="btn small" type="button" data-act="keysave">Spara</button></div>
      <div class="row"><button class="btn small ghost" type="button" data-act="keytest" ${st.rtKey ? "" : "disabled"}>Testa nyckeln</button>${st.rtKey ? `<button class="btn small ghost danger" type="button" data-act="keydel">Ta bort</button>` : ""}<span class="note" id="keyNote"></span></div>
      <p class="note">Nyckeln sparas bara i den här webbläsaren och skickas bara till opendata.samtrafiken.se.</p></div>
    <div class="steps"><span class="label">Gånghastighet</span>
      <div class="seg" role="group" aria-label="Gånghastighet">${[["lugn", "Lugn"], ["normal", "Normal"], ["snabb", "Snabb"], ["egen", "Egen"]].map(([k, n]) => `<button type="button" data-act="speed" data-k="${k}" aria-pressed="${st.speed === k}">${n}</button>`).join("")}</div>
      ${st.speed === "egen" ? `<label class="field" for="set-kmh">Egen hastighet (km/h)<input id="set-kmh" type="number" min="2" max="15" step="0.1" value="${esc(st.customKmh)}"></label>` : ""}
      <p class="note">${String(kmh()).replace(".", ",")} km/h. 500 m tar ${dur(500 / speedMs())}. Gäller gångsträckor med längd; byten inne på en station tar den tid SL anger.</p></div>
    <div class="steps"><span class="label">Säkerhetsnivå</span>
      <div class="seg" role="group" aria-label="Säkerhetsnivå">${Object.entries(SAFETY).map(([k, v]) => `<button type="button" data-act="safety" data-k="${k}" aria-pressed="${st.safety === k}">${v.name}</button>`).join("")}</div>
      <p class="note">${SAFETY[st.safety].text}</p></div>
    ${["vanlig", "snabb"].map(n => `<div class="steps"><div class="spread"><span class="label">${n === "vanlig" ? "Vanlig" : "Snabb"} rutin</span><span class="note" id="rtsum-${n}">${durMin(routineSec(n))}</span></div>${steps(n)}<div><button class="link" type="button" data-act="rtadd" data-rt="${n}">Lägg till moment</button></div></div>`).join("")}
    <div class="steps"><span class="label">Snooze</span>
      <label class="field" for="set-snooze">Längd (min)<input id="set-snooze" type="number" min="1" max="15" value="${esc(st.snooze)}"></label>
      <p class="note">Snooze tar tid från rutinen, aldrig från bussen.</p></div>
    <div class="steps"><span class="label">Utseende</span>
      <div class="seg" role="group" aria-label="Tema">${[["dark", "Mörkt"], ["light", "Ljust"], ["system", "Som telefonen"]].map(([k, n]) => `<button type="button" data-act="theme" data-k="${k}" aria-pressed="${st.theme === k}">${n}</button>`).join("")}</div></div>
    <div><button class="link" type="button" data-act="about">Om datan och hur appen räknar</button></div>
    <div class="steps"><span class="label">Data</span><p class="note">Platser, händelser och nyckel sparas bara i den här webbläsaren.</p>
      ${ui.confirmReset ? `<div class="row"><button class="btn danger" type="button" data-act="resetok">Ja, återställ allt</button><button class="btn ghost" type="button" data-act="resetno">Avbryt</button></div>` : `<div><button class="btn small ghost" type="button" data-act="reset">Återställ allt</button></div>`}</div>`);
}
async function testKey() {
  const note = $("keyNote");
  note.textContent = "Testar…";
  try {
    const vp = await RT.fetchFeed("VehiclePositions", S.settings.rtKey.trim());
    note.textContent = `Fungerar. ${vp.vehicles.length} fordon i trafik just nu.`;
    note.className = "note okc";
  } catch (e) {
    note.textContent = e.code === "key" ? "Nyckeln godkändes inte." : `Fungerade inte: ${e.message}`;
    note.className = "note warn";
  }
}

function openAbout() {
  const st = S.settings;
  const m = META || { dates: [], routes: {} };
  openSheet(`<div class="sheet-head"><h2>Om datan</h2><button class="btn small ghost" type="button" data-act="close">Stäng</button></div>
    <div class="steps prose">
      <p><b>Resor och adresser:</b> SL:s reseplanerare (journeyplanner.integration.sl.se), samma som SL-appen.</p>
      <p><b>Risk:</b> KoDa-historik från Trafiklab, ${m.dates.length} dagar (${rangeText() || "saknas"}), ${Object.keys(m.routes).length} linjer. Datan räknas fram i förväg och ligger i appen, så ingen KoDa-nyckel behövs här.${m.generated ? ` Uppdaterad ${esc(m.generated.slice(0, 10))}.` : ""}</p>
      <p><b>Realtid och bussens position:</b> GTFS Regional Realtime med din egen nyckel, annars reseplanerarens beräknade tider.</p>
      <p><b>Karta:</b> © OpenStreetMaps bidragsgivare.</p>
    </div>
    <div class="steps prose"><span class="label">Så räknar appen</span>
      <p>Appen utgår från när du ska vara framme och räknar baklänges. Den frågar SL efter resor som kommer fram i tid och väljer den där du kan gå hemifrån senast, men bara om den hinner fram även en ${st.safety === "vanlig" ? "vanlig" : "sen"} morgon.</p>
      <p><b>Vid hållplatsen:</b> den tidigaste avgång som setts samma sorts dag (vardag, lördag eller söndag) minus 30 s, avrundat nedåt till hel minut. Med färre än ${MIN_DAYS} dagar historik eller ingen alls: 1 min före tidtabellen.</p>
      <p><b>Risk:</b> varje dag i historiken spelas upp med fordonens verkliga tider. Du står vid hållplatsen den tid appen säger, och dagen räknas som missad om bussen gick innan, om den var inställd, om bytet inte höll (minst 1 min marginal efter gången) eller om du kom fram för sent.</p>
      <p><b>Ankomst:</b> med historik används förseningen för vald säkerhetsnivå. Utan historik antas bussar vara ${durMin(UNKNOWN_LATE.bus[st.safety])} sena och spårtrafik ${durMin(UNKNOWN_LATE.rail[st.safety])}.</p>
      <p><b>Larmet</b> ringer bara medan sidan är öppen och skärmen är tänd. Lägg tiden i kalendern som reserv.</p></div>`);
}

// ---------- Sheet ----------
function openSheet(html) { $("sheetPanel").innerHTML = html; $("sheet").hidden = false; ui.sheet = true; $("sheetPanel").querySelector("input,select,button")?.focus(); }
function closeSheet() { $("sheet").hidden = true; ui.sheet = null; ui.confirmReset = false; }

// ---------- Render ----------
function applyTheme() {
  document.documentElement.dataset.appTheme = S.settings.theme;
  const dark = S.settings.theme === "dark" || (S.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#12110f" : "#eeebe4");
}
function render() {
  applyTheme();
  unmountMaps();
  for (const t of ["idag", "vecka", "resa", "platser"]) {
    $("view-" + t).hidden = ui.tab !== t;
    document.querySelector(`.tab[data-tab="${t}"]`).setAttribute("aria-current", ui.tab === t ? "page" : "false");
  }
  const v = $("view-" + ui.tab);
  // Keep tapped-open rows open across re-renders.
  const openRows = [...v.querySelectorAll(".lm li.open .what")].map(x => x.textContent);
  if (ui.tab === "idag") v.innerHTML = viewIdag();
  if (ui.tab === "vecka") v.innerHTML = viewVecka();
  if (ui.tab === "resa") { v.innerHTML = viewResa(); renderResaResults(); }
  if (ui.tab === "platser") v.innerHTML = viewPlatser();
  v.querySelectorAll(".lm li.has").forEach(li => { if (openRows.includes(li.querySelector(".what").textContent)) { li.classList.add("open"); li.querySelector(".lmb").setAttribute("aria-expanded", "true"); } });
  mountMaps();
}
function tick() {
  $("clock").textContent = fmt(nowSec());
  if (ui.armed && !ui.alarm && !ui.armed.rang && !ui.armed.done && Date.now() >= ui.armed.at) { ui.armed.rang = true; showAlarm(); }
  if (ui.tab === "idag") {
    const el = $("armStatus");
    if (el && ui.viewDate) el.textContent = armStatus(ui.viewDate);
  }
}
// While armed, ask SL again every 5 minutes so a cancelled bus moves the alarm.
setInterval(() => { if (ui.armed && !ui.armed.rang) { jpCache.clear(); delete ui.plans[ui.armed.date]?.sig; planFor(ui.armed.date); } }, 5 * 60e3);

// ---------- Events ----------
document.addEventListener("click", ev => {
  const tab = ev.target.closest(".tab");
  if (tab) { ui.tab = tab.dataset.tab; ui.mapEdit = null; render(); window.scrollTo(0, 0); return; }
  if (ev.target === $("sheet")) { closeSheet(); render(); return; }
  const opt = ev.target.closest("button.opt");
  if (opt) {
    const key = opt.dataset.opt;
    if (ui.tab === "idag") {
      const e = ui.plans[ui.viewDate]?.p?.segs[0]?.ev;
      if (e) { e.choice = key; saveState(); render(); }
    } else if (ui.tab === "resa") { ui.resa.open = ui.resa.open === key ? null : key; renderResaResults(); }
    return;
  }
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const a = b.dataset.act, d = b.dataset;
  switch (a) {
    case "day": {
      const i = Math.round((dateOf(ui.viewDate) - dateOf(todayIso())) / 864e5) + Number(d.d);
      ui.viewDate = addDays(todayIso(), Math.max(0, Math.min(6, i)));
      render(); break;
    }
    case "arm": arm(ui.viewDate); break;
    case "ics": downloadIcs(ui.viewDate); break;
    case "alarmoff": closeAlarm(false); break;
    case "snooze": closeAlarm(true); break;
    case "settings": openSettings(); break;
    case "about": loadMeta().then(openAbout); break;
    case "details": ui.details = !ui.details; render(); break;
    case "toggleday": ui.openDay = ui.openDay === d.date ? null : d.date; render(); break;
    case "lmtoggle": { const li = b.closest("li"); const on = !li.classList.contains("open"); li.classList.toggle("open", on); b.setAttribute("aria-expanded", on); break; }
    case "close": closeSheet(); render(); break;
    case "newev": openEventEditor(null, d.date); break;
    case "editev": openEventEditor(d.id); break;
    case "delev": S.events = S.events.filter(e => e.id !== d.id); saveState(); closeSheet(); render(); break;
    case "openday": ui.viewDate = d.date; ui.tab = "idag"; render(); window.scrollTo(0, 0); break;
    case "clearex": S.events = S.events.filter(e => !e.example); saveState(); render(); break;
    case "goplaces": closeSheet(); ui.tab = "platser"; render(); break;
    case "safety": S.settings.safety = d.k; saveState(); render(); if (ui.sheet) openSettings(); break;
    case "speed": S.settings.speed = d.k; saveState(); openSettings(); render(); break;
    case "theme": S.settings.theme = d.k; saveState(); applyTheme(); openSettings(); render(); break;
    case "rtadd": S.settings.routines[d.rt].push(["Nytt moment", 5]); saveState(); openSettings(); break;
    case "rtdel": S.settings.routines[d.rt].splice(Number(d.i), 1); saveState(); openSettings(); break;
    case "keysave": S.settings.rtKey = $("set-key").value.trim(); saveState(); rtTrips = { at: 0, feed: null }; openSettings(); if (S.settings.rtKey) testKey(); break;
    case "keytest": testKey(); break;
    case "keydel": S.settings.rtKey = ""; saveState(); openSettings(); break;
    case "reset": ui.confirmReset = true; openSettings(); break;
    case "resetno": ui.confirmReset = false; openSettings(); break;
    case "resetok": S = seed(); saveState(); ui.confirmReset = false; ui.viewDate = null; ui.armed = null; ui.plans = {}; closeSheet(); render(); break;
    case "movepl": ui.mapEdit = { id: d.id, kind: d.id === "hem" ? "home" : "move" }; render(); document.querySelector(".lmap")?.scrollIntoView({ block: "center" }); break;
    case "editpl": openPlaceEditor(d.id); break;
    case "newpl": openPlaceEditor(null); break;
    case "pickres": { const l = ui.searchList?.[Number(d.i)]; if (l) { ui.pick = l; $("plResults").hidden = true; const n = $("pl-name"); if (n && !n.value.trim()) n.value = l.name; ui.drawPick?.(); } break; }
    case "cancelmap": ui.mapEdit = null; render(); break;
    case "delpl": ui.confirmDel = d.id; render(); break;
    case "delplno": ui.confirmDel = null; render(); break;
    case "delplok": {
      const id = ui.confirmDel;
      S.events.forEach(e => { if (e.place === id) { e.place = "hem"; e.choice = undefined; } });
      S.places = S.places.filter(p => p.id !== id);
      ui.confirmDel = null; saveState(); render(); break;
    }
    case "replan": delete ui.plans[ui.viewDate]; render(); break;
    case "retryresa": ui.resaSig = null; renderResaResults(); break;
    case "addtrip": {
      const r = ui.resa;
      S.events.push({ id: "e" + Date.now().toString(36), title: `Resa till ${placeName(r.to)}`, place: r.to, date: r.date, start: pc(r.time), end: pc(r.time) + 1800, early: 0, routine: "vanlig", repeat: false, choice: d.key });
      saveState(); b.textContent = "Tillagd i veckan"; b.disabled = true; break;
    }
  }
});
document.addEventListener("change", ev => {
  const t = ev.target;
  if (t.id?.startsWith("r-")) {
    const r = ui.resa;
    if (t.id === "r-from") r.from = t.value;
    if (t.id === "r-to") r.to = t.value;
    if (t.id === "r-date") r.date = t.value;
    if (t.id === "r-time") r.time = t.value;
    r.open = null; renderResaResults(); return;
  }
  if (t.id === "set-kmh") { S.settings.customKmh = Math.max(2, Math.min(15, Number(t.value) || 5)); saveState(); openSettings(); render(); return; }
  if (t.id === "set-snooze") { S.settings.snooze = Math.max(1, Math.min(15, Math.round(Number(t.value) || 5))); saveState(); return; }
  if (t.dataset.rt) {
    const row = S.settings.routines[t.dataset.rt][Number(t.dataset.i)];
    if (t.dataset.f === "n") row[0] = t.value.trim() || "Moment";
    else row[1] = Math.max(0, Math.min(120, Math.round(Number(t.value) || 0)));
    saveState();
    const sum = $("rtsum-" + t.dataset.rt);
    if (sum) sum.textContent = durMin(routineSec(t.dataset.rt));
    render();
  }
});
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && ui.sheet) { closeSheet(); render(); }
});
$("openSettings").addEventListener("click", openSettings);
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  if (ui.armed && !wakeLock) { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {} }
  liveLoop();
});

loadMeta().then(() => { if (ui.tab === "idag" && ui.details) render(); });
render();
tick();
setInterval(tick, 1000);
liveLoop();
