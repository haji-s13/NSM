/* Norwegian Singles Planner
 * Pure client-side: no build step, no dependencies.
 * All distances are handled internally in km and paces in seconds per km.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- constants
  const KM_PER_MI = 1.609344;
  const STORAGE_KEY = "nsm-planner-v1";
  const MIN_EASY_KM = 3;
  const STRIDES = "6 × 20s strides";
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const RACES = [
    { key: "5k", label: "5k", m: 5000 },
    { key: "10k", label: "10k", m: 10000 },
    { key: "15k", label: "15k", m: 15000 },
    { key: "hm", label: "Half marathon", m: 21097.5 },
    { key: "25k", label: "25k", m: 25000 },
    { key: "30k", label: "30k", m: 30000 },
    { key: "m", label: "Marathon", m: 42195 },
  ];

  const SESSION_TYPES = {
    rest: { label: "Rest", cls: "rest" },
    easy: { label: "Easy", cls: "easy" },
    short: { label: "Sub-T short (1k / 3 min)", cls: "subt", quality: true },
    medium: { label: "Sub-T medium (2k / 6 min)", cls: "subt", quality: true },
    long: { label: "Sub-T long (3k / 10 min)", cls: "subt", quality: true },
    hills: { label: "400s / hills", cls: "subt", quality: true },
    longrun: { label: "Long run", cls: "long" },
  };

  // Rep structure for each sub-threshold session.
  const SUBT = {
    short: { name: "Sub-T short", distKm: 1, distLabel: "1 km", min: 3, recS: 60, race: "15k" },
    medium: { name: "Sub-T medium", distKm: 2, distLabel: "2 km", min: 6, recS: 60, race: "hm" },
    long: { name: "Sub-T long", distKm: 3, distLabel: "3 km", min: 10, recS: 90, race: "30k" },
  };

  // Volume progression: week 1 starts at the starting volume and each full week
  // rises by at most MAX_WEEKLY_INCREASE until the peak is reached.
  const MAX_WEEKLY_INCREASE = 0.05;
  const DELOAD_WEEKS = [3, 7]; // zero-based: weeks 4 and 8
  const DELOAD_FACTOR = 0.8;   // lighter week = 80% of the current build level
  const TAPER_FACTOR = 0.65;   // race / time-trial week

  // Sub-T rep counts are sized from the week's volume: the sub-T share of weekly
  // volume is split across the week's quality sessions by weight, then clamped.
  const REPS = {
    short: { min: 4, max: 12, weight: 1 },
    medium: { min: 2, max: 6, weight: 1 },
    long: { min: 2, max: 4, weight: 1 },
    hills: { min: 8, max: 25, weight: 0.6, repKm: 0.4 },
  };

  const DEFAULTS = {
    pbDistance: "5000",
    pbTime: "19:45",
    units: "km",
    paceAdjust: 0,
    startDate: nextMonday(),
    startVolume: 55,
    peakVolume: 75,
    subtShare: 25,
    subtWarmupKm: 2,     // always stored in km
    subtCooldownKm: 1.5, // always stored in km
    repFormat: "distance",
    finalWeek: "race",
    deloads: true,
    template: ["easy", "short", "easy", "medium", "easy", "long", "longrun"],
  };

  // ---------------------------------------------------------------- helpers
  function nextMonday() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    const add = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + add);
    return isoDate(d);
  }
  function isoDate(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], 12);
  }
  function fmtShortDate(d) {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  /** "19:45" → 1185, "1:05:30" → 3930. Returns NaN when invalid. */
  function parseTime(str) {
    const parts = String(str).trim().split(":");
    if (parts.length < 2 || parts.length > 3) return NaN;
    if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return NaN;
    const nums = parts.map(Number);
    if (nums.slice(1).some((n) => n >= 60)) return NaN;
    return nums.reduce((acc, n) => acc * 60 + n, 0);
  }

  function fmtTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }

  // ---------------------------------------------------------------- Daniels VDOT
  // Daniels & Gilbert (1979): the equations behind the VDOT tables.
  // v = velocity in metres/min, t = race duration in minutes.
  function vo2AtVelocity(v) {
    return -4.60 + 0.182258 * v + 0.000104 * v * v;
  }
  function fractionSustainable(t) {
    return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  }
  function vdotFromRace(metres, seconds) {
    const t = seconds / 60;
    return vo2AtVelocity(metres / t) / fractionSustainable(t);
  }
  /** Predicted race time (seconds) for a distance at a given VDOT. */
  function raceTimeForVdot(vdot, metres) {
    let lo = metres / 600, hi = metres / 50; // minutes: 600 m/min down to 50 m/min
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (vdotFromRace(metres, mid * 60) > vdot) lo = mid; else hi = mid;
    }
    return ((lo + hi) / 2) * 60;
  }
  /** Seconds per km at a given fraction of VDOT (Daniels training intensities). */
  function paceAtPercent(vdot, pct) {
    const target = vdot * pct;
    const a = 0.000104, b = 0.182258, c = -4.60 - target;
    const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    return 60000 / v;
  }

  // ---------------------------------------------------------------- state
  let state = load();
  let lastWeeks = [];
  let lastPaces = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const merged = Object.assign({}, DEFAULTS, saved);
        if (!Array.isArray(merged.template) || merged.template.length !== 7) merged.template = DEFAULTS.template.slice();
        return merged;
      }
    } catch (e) { /* storage unavailable; use defaults */ }
    return Object.assign({}, DEFAULTS, { template: DEFAULTS.template.slice() });
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- unit helpers
  const unitPace = () => (state.units === "mi" ? "/mi" : "/km");
  const unitDist = () => (state.units === "mi" ? "mi" : "km");
  /** Seconds-per-km → formatted pace in the chosen unit. */
  function pace(secPerKm) {
    return fmtTime(state.units === "mi" ? secPerKm * KM_PER_MI : secPerKm) + unitPace();
  }
  function paceRange(a, b) {
    const f = (x) => fmtTime(state.units === "mi" ? x * KM_PER_MI : x);
    return `${f(a)}–${f(b)}${unitPace()}`;
  }
  /** Range object {lo, hi} (sec/km) → "4:10–4:16/km". */
  function rangeOf(r) { return paceRange(r.lo, r.hi); }
  const mid = (r) => (r.lo + r.hi) / 2;
  function repRange(r, km, label) {
    return `${label}: ${fmtTime(r.lo * km)}–${fmtTime(r.hi * km)}`;
  }
  function timeRange(r, min) {
    const m = (p) => Math.round((min * 60) / p * 1000 / 10) * 10;
    return `${min} min ≈ ${m(r.hi)}–${m(r.lo)} m`;
  }
  function dist(km, digits = 1) {
    const v = state.units === "mi" ? km / KM_PER_MI : km;
    return `${v.toFixed(digits)} ${unitDist()}`;
  }

  // ---------------------------------------------------------------- core model
  /** Returns { races, paces } or null when the PB is invalid. */
  function model() {
    const pbSec = parseTime(state.pbTime);
    const pbM = Number(state.pbDistance);
    if (!isFinite(pbSec) || pbSec <= 0) return null;
    const minPace = pbSec / (pbM / 1000);
    if (minPace < 150 || minPace > 600) return null; // 2:30–10:00 per km sanity range

    const vdot = vdotFromRace(pbM, pbSec);
    const races = {};
    RACES.forEach((r) => {
      const t = r.m === pbM ? pbSec : raceTimeForVdot(vdot, r.m);
      races[r.key] = { ...r, time: t, pace: t / (r.m / 1000), isPB: r.m === pbM };
    });

    // Every pace is a range: fast end (lo) and slow end (hi), in sec/km.
    const adj = Number(state.paceAdjust) || 0;
    const band = (fast, slow, a = 0) => ({ lo: fast + a, hi: slow + a });
    const rp = (k) => races[k].pace;
    const paces = {
      easy: band(paceAtPercent(vdot, 0.74), paceAtPercent(vdot, 0.62)),
      marathon: band(rp("m") - 3, rp("m") + 3),
      threshold: band(paceAtPercent(vdot, 0.88), paceAtPercent(vdot, 0.83)),
      short: band(rp("15k"), rp("hm"), adj),
      medium: band(rp("hm"), rp("25k"), adj),
      long: band(rp("25k"), rp("30k"), adj),
      hills: band(rp("10k"), rp("15k")),
    };
    return { races, paces, pbSec, pbM, vdot };
  }

  // ---------------------------------------------------------------- tab 1: paces
  function renderPaces(m) {
    const err = document.getElementById("pb-error");
    const raceBody = document.getElementById("race-table");
    const paceBody = document.getElementById("pace-table");
    if (!m) {
      err.hidden = false;
      err.textContent = "Enter a valid time, e.g. 19:45 for a 5k or 41:30 for a 10k.";
      raceBody.innerHTML = "";
      paceBody.innerHTML = "";
      return;
    }
    err.hidden = true;

    raceBody.innerHTML = RACES.map((r) => {
      const x = m.races[r.key];
      return `<tr class="${x.isPB ? "pb-row" : ""}"><td>${r.label}${x.isPB ? " (PB)" : ""}</td>
        <td class="num">${fmtTime(x.time)}</td><td class="num">${pace(x.pace)}</td></tr>`;
    }).join("");

    document.getElementById("vdot-value").textContent = m.vdot.toFixed(1);

    const p = m.paces;
    const rows = [
      ["Easy / recovery", "Daniels E (62–74% VDOT)", rangeOf(p.easy), "Conversational. Go slower if you need to."],
      ["Long run", "Daniels E", rangeOf(p.easy), "Easy all the way, typically 20–25% of weekly volume"],
      ["Sub-T short", "15k → half marathon pace", rangeOf(p.short), `${repRange(p.short, 1, "1 km")} · ${timeRange(p.short, 3)} · 60s rest`],
      ["Sub-T medium", "Half marathon → 25k pace", rangeOf(p.medium), `${repRange(p.medium, 2, "2 km")} · ${timeRange(p.medium, 6)} · 60s rest`],
      ["Sub-T long", "25k → 30k pace", rangeOf(p.long), `${repRange(p.long, 3, "3 km")} · ${timeRange(p.long, 10)} · 60–90s rest`],
      ["400s / hills", "10k → 15k pace", rangeOf(p.hills), `${repRange(p.hills, 0.4, "400 m")} · 30s rest (or 200 m hills, jog down)`],
      ["For reference: Daniels T", "83–88% VDOT", rangeOf(p.threshold), "Classic Daniels threshold. Don't run sub-T reps faster than its fast end."],
      ["For reference: marathon", "VDOT marathon prediction ± 3 s/km", rangeOf(p.marathon), ""],
    ];
    paceBody.innerHTML = rows.map((r) =>
      `<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="reps">${r[3]}</td></tr>`
    ).join("");
  }

  // ---------------------------------------------------------------- tab 2: builder
  /** Weekly volume targets (km) for all 12 weeks. */
  function volumePlan() {
    const toKm = (v) => (state.units === "mi" ? Number(v) * KM_PER_MI : Number(v));
    const startKm = Math.max(toKm(state.startVolume) || 0, 10);
    const peakKm = Math.max(toKm(state.peakVolume) || 0, startKm);
    const out = [];
    let level = startKm; // current build level
    for (let w = 0; w < 12; w++) {
      const taper = w === 11 && (state.finalWeek === "race" || state.finalWeek === "test");
      const deload = state.deloads && DELOAD_WEEKS.includes(w);
      if (w > 0 && !taper && !deload) level = Math.min(peakKm, level * (1 + MAX_WEEKLY_INCREASE));
      const km = taper ? level * TAPER_FACTOR : deload ? level * DELOAD_FACTOR : level;
      out.push({ km, deload, taper, atPeak: level >= peakKm - 0.05 });
    }
    return { weeks: out, startKm, peakKm };
  }

  /** Rep counts for the week's quality sessions, sized from weekly volume. */
  function repCounts(tmpl, weekKm, p, fmt) {
    const quality = tmpl.filter((t) => REPS[t]);
    const totalWeight = quality.reduce((a, t) => a + REPS[t].weight, 0);
    const budget = weekKm * (Number(state.subtShare) || 25) / 100;
    const counts = {};
    quality.forEach((t) => {
      if (counts[t] != null) return;
      const r = REPS[t];
      const perRepKm = t === "hills" ? r.repKm
        : fmt === "time" ? (SUBT[t].min * 60) / mid(p[t]) : SUBT[t].distKm;
      const raw = (budget * r.weight / totalWeight) / perRepKm;
      counts[t] = Math.min(r.max, Math.max(r.min, Math.round(raw)));
    });
    return counts;
  }

  function phaseFor(w) {
    if (w < 4) return "Base";
    if (w < 8) return "Build";
    if (w < 11) return "Peak";
    if (state.finalWeek === "race") return "Taper + race";
    if (state.finalWeek === "test") return "Time trial";
    return "Peak";
  }

  function repFormatFor(w) {
    if (state.repFormat === "mixed") return w % 2 === 0 ? "distance" : "time";
    return state.repFormat;
  }

  /** Builds a session object for one day (without easy-day distances, filled later). */
  function buildSession(type, w, wv, p, fmt, raceKm) {
    if (type === "rest") return { type, title: "Rest", detail: "Rest or cross-train", km: 0 };
    if (type === "easy") return { type, title: "Easy", detail: rangeOf(p.easy), km: null };
    if (type === "longrun") return { type, title: "Long run", detail: `Easy, ${rangeOf(p.easy)}`, km: null };

    if (type === "race") {
      const label = state.pbDistance === "10000" ? "10k" : "5k";
      const what = state.finalWeek === "race" ? `${label} race` : `${label} time trial`;
      const target = model().races[state.pbDistance === "10000" ? "10k" : "5k"];
      return {
        type, title: what,
        detail: `Thorough warm-up with strides. Current PB pace ${pace(target.pace)} (${fmtTime(target.time)})`,
        km: raceKm + 5,
        wu: 3, cd: 2, wuExtra: " + strides",
        raceKm, racePace: target.pace,
        main: `${what} @ current PB pace ${pace(target.pace)} (${fmtTime(target.time)})`,
      };
    }

    if (type === "hills") {
      const n = wv.hills;
      return {
        type, title: "400s / hills",
        detail: `${n} × 400 m @ ${rangeOf(p.hills)} (${fmtTime(p.hills.lo * 0.4)}–${fmtTime(p.hills.hi * 0.4)}), 30s rest, or ${n} × 200 m hills, jog down`,
        km: wuCd().wu + n * 0.4 + (n - 1) * 0.08 + wuCd().cd,
        repKm: n * 0.4,
        wu: wuCd().wu, cd: wuCd().cd,
        reps: { n, stepKm: 0.4, recS: 30, pace: p.hills, recLabel: "Rest" },
      };
    }

    const s = SUBT[type];
    const n = wv[type];
    const pc = p[type];
    let detail, repKm;
    if (fmt === "time") {
      detail = `${n} × ${s.min} min @ ${rangeOf(pc)}, ${s.recS}s jog`;
      repKm = n * (s.min * 60) / mid(pc);
    } else {
      detail = `${n} × ${s.distLabel} @ ${rangeOf(pc)} (${fmtTime(pc.lo * s.distKm)}–${fmtTime(pc.hi * s.distKm)}), ${s.recS}s jog`;
      repKm = n * s.distKm;
    }
    const recKm = (n - 1) * (s.recS / 420); // slow jog ≈ 7:00/km
    return {
      type, title: s.name, detail, km: wuCd().wu + repKm + recKm + wuCd().cd, repKm, wuNote: true, wu: wuCd().wu, cd: wuCd().cd,
      reps: { n, stepKm: fmt === "time" ? null : s.distKm, stepMin: s.min, recS: s.recS, pace: pc, recLabel: "Jog" },
    };
  }

  /** Estimated duration of a session in seconds: warm-up, reps, recoveries and cool-down at their paces. */
  function sessionSeconds(d, p) {
    const easy = mid(p.easy);
    if (d.type === "rest") return 0;
    if (d.type === "easy" || d.type === "longrun") {
      return d.km * easy + (d.strides ? 6 * (20 + 60) : 0);
    }
    let t = (d.wu || 0) * easy + (d.cd || 0) * easy;
    if (d.type === "race") return t + d.raceKm * d.racePace;
    const r = d.reps;
    if (!r) return d.km * easy;
    const work = r.stepKm ? r.n * r.stepKm * mid(r.pace) : r.n * r.stepMin * 60;
    return t + work + (r.n - 1) * r.recS;
  }

  /** 2700 → "45 min", 4500 → "1 h 15 min". */
  function fmtDuration(sec) {
    const mins = Math.round(sec / 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
  }
  /** 18600 → "5.2h" for compact chart labels. */
  const fmtHours = (sec) => `${(sec / 3600).toFixed(1)}h`;

  /** Sub-T warm-up and cool-down distances in km, from the Plan settings. */
  function wuCd() {
    const km = (v) => Math.max(0, Number(v) || 0);
    return { wu: km(state.subtWarmupKm), cd: km(state.subtCooldownKm) };
  }

  function buildPlan(m) {
    const p = m.paces;
    const vp = volumePlan();
    const start = parseDate(state.startDate) || parseDate(nextMonday());
    const raceKm = Number(state.pbDistance) / 1000;
    const weeks = [];

    for (let w = 0; w < 12; w++) {
      const vw = vp.weeks[w];
      const fmt = repFormatFor(w);
      let tmpl = state.template.slice();

      // Final week: replace the last quality session with a race or time trial.
      if (w === 11 && (state.finalWeek === "race" || state.finalWeek === "test")) {
        let last = -1;
        tmpl.forEach((t, i) => { if (SESSION_TYPES[t] && SESSION_TYPES[t].quality) last = i; });
        if (last === -1) last = 5;
        tmpl[last] = "race";
        // Anything after the race that is a long run becomes an easy run.
        for (let i = last + 1; i < 7; i++) if (tmpl[i] === "longrun" || SESSION_TYPES[tmpl[i]]?.quality) tmpl[i] = "easy";
      }

      const targetKm = vw.km;
      // Size reps from the normal template so a race week tapers the remaining sessions.
      const wv = repCounts(state.template, targetKm, p, fmt);
      const days = tmpl.map((t) => buildSession(t, w, wv, p, fmt, raceKm));

      // Strides on the first easy run of the week.
      const firstEasy = days.find((d) => d.type === "easy");
      if (firstEasy) {
        firstEasy.title = "Easy + strides";
        firstEasy.strides = STRIDES;
        firstEasy.detail = `${rangeOf(p.easy)}, then ${STRIDES}`;
      }

      const longRun = days.find((d) => d.type === "longrun");
      if (longRun) longRun.km = Math.min(Math.max(targetKm * 0.22, 8), 32);

      const fixedKm = days.reduce((a, d) => a + (d.km || 0), 0);
      const easyDays = days.filter((d) => d.type === "easy");
      let easyEach = easyDays.length ? (targetKm - fixedKm) / easyDays.length : 0;
      const tooLow = easyDays.length > 0 && easyEach < MIN_EASY_KM;
      easyEach = Math.max(easyEach, easyDays.length ? MIN_EASY_KM : 0);
      easyDays.forEach((d) => { d.km = easyEach; });

      const totalKm = days.reduce((a, d) => a + (d.km || 0), 0);
      days.forEach((d) => { d.sec = sessionSeconds(d, p); });
      const totalSec = days.reduce((a, d) => a + d.sec, 0);
      const subtKm = days.filter((d) => d.repKm).reduce((a, d) => a + d.repKm, 0);
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + 7 * w);

      weeks.push({
        n: w + 1, phase: phaseFor(w), deload: vw.deload, atPeak: vw.atPeak, fmt, days, totalKm, totalSec, targetKm, subtKm, tooLow, weekStart,
      });
    }
    weeks.volume = vp;
    return weeks;
  }

  function templateWarnings() {
    const t = state.template;
    const warns = [];
    const q = t.map((x) => !!SESSION_TYPES[x]?.quality);
    const nQ = q.filter(Boolean).length;
    if (nQ === 0) warns.push("Your template has no sub-threshold sessions.");
    if (nQ > 3) warns.push("More than 3 sub-threshold sessions a week is more than the method calls for. Keep it to 2–3.");
    for (let i = 0; i < 7; i++) {
      if (q[i] && q[(i + 1) % 7]) {
        warns.push(`${DAYS[i]} and ${DAYS[(i + 1) % 7]} are back-to-back quality days. The method puts an easy day between sessions.`);
      }
    }
    if (t.filter((x) => x === "longrun").length > 1) warns.push("More than one long run per week.");
    return warns;
  }

  function renderBuilder(m) {
    const summary = document.getElementById("pb-summary");
    const planEl = document.getElementById("plan");
    const warnEl = document.getElementById("plan-warnings");
    document.getElementById("vol-unit").textContent = unitDist() + " / week";
    document.getElementById("start-unit").textContent = unitDist() + " / week";
    document.getElementById("wu-unit").textContent = unitDist() + " · sub-T days";
    document.getElementById("cd-unit").textContent = unitDist() + " · sub-T days";
    const wc = wuCd();
    document.getElementById("settings-summary").textContent =
      `${dist(volumePlan().startKm, 0)} → ${dist(volumePlan().peakKm, 0)} · ${Number(state.subtShare) || 25}% sub-T · ` +
      `warm-up ${dist(wc.wu)} · cool-down ${dist(wc.cd)}`;

    if (!m) {
      summary.innerHTML = `Enter a valid PB on the <a href="#paces">Predicted Paces</a> tab first.`;
      planEl.innerHTML = "";
      warnEl.innerHTML = "";
      return;
    }
    const pbLabel = m.pbM === 10000 ? "10k" : "5k";
    summary.innerHTML = `Using your <strong>${pbLabel} PB of ${fmtTime(m.pbSec)}</strong>. VDOT ${m.vdot.toFixed(1)}. Sub-T paces: short ${rangeOf(m.paces.short)} · medium ${rangeOf(m.paces.medium)} · long ${rangeOf(m.paces.long)}. <a href="#paces">Change</a>`;

    const weeks = buildPlan(m);
    lastWeeks = weeks;
    lastPaces = m.paces;
    const warns = templateWarnings();
    if (weeks.some((w) => w.tooLow)) {
      warns.push(`Your peak volume is too low for this template: some easy runs were raised to the ${dist(MIN_EASY_KM)} minimum, so weekly totals are above target. Raise the volume or swap an easy day for rest.`);
    }
    const sv = Number(state.startVolume), pv = Number(state.peakVolume);
    if (sv > pv) warns.push(`Your starting volume is above your peak, so the plan holds at ${dist(weeks.volume.startKm, 0)}.`);
    warnEl.innerHTML = warns.map((w) => `<div class="warning">${w}</div>`).join("");

    // Change vs the last full week (lighter and taper weeks are skipped).
    const full = (x) => !x.deload && !weeks.volume.weeks[x.n - 1].taper;
    const changeTxt = (wk, all) => {
      if (!full(wk)) return "";
      const prev = all.slice(0, wk.n - 1).reverse().find(full);
      if (!prev) return "";
      const pct = Math.round((wk.targetKm / prev.targetKm - 1) * 100);
      return ` <span class="hint">(${pct > 0 ? "+" : ""}${pct}% vs last full week)</span>`;
    };
    renderVolumeSummary(weeks);
    renderVolumeChart(weeks);
    planEl.innerHTML = weeks.map((wk) => {
      const days = wk.days.map((d, i) => {
        const date = new Date(wk.weekStart);
        date.setDate(date.getDate() + i);
        const cls = d.type === "race" ? "race" : SESSION_TYPES[d.type]?.cls || "easy";
        const kmTxt = d.km ? `${dist(d.km)}${d.wu != null ? " total" : ""} · ~${fmtDuration(d.sec)}` : "";
        const detailHtml = d.wu != null
          ? (d.wu > 0 ? `<div class="seg seg-easy">Warm-up ${dist(d.wu)} easy${d.wuExtra || ""}</div>` : "") +
            `<div class="seg seg-main">${d.main || d.detail}</div>` +
            (d.cd > 0 ? `<div class="seg seg-easy">Cool-down ${dist(d.cd)} easy</div>` : "")
          : d.detail;
        return `<div class="day ${cls}">
          <div class="day-name">${DAYS[i]} <span class="hint">${fmtShortDate(date)}</span></div>
          <div class="day-title">${d.title}</div>
          <div class="day-detail">${detailHtml}</div>
          ${kmTxt ? `<div class="day-dist">${kmTxt}</div>` : ""}
          ${d.type !== "rest" ? `<div class="day-actions"><button type="button" class="copy-btn" data-week="${wk.n - 1}" data-day="${i}" aria-label="Copy ${DAYS[i]} week ${wk.n} workout">Copy</button>${PUSH_ENABLED ? `<button type="button" class="copy-btn push-day" data-week="${wk.n - 1}" data-day="${i}" aria-label="Send ${DAYS[i]} week ${wk.n} workout to intervals.icu">Send</button>` : ""}</div>` : ""}
        </div>`;
      }).join("");
      return `<article class="week">
        <div class="week-head">
          <h3>Week ${wk.n} <span class="hint">· ${fmtShortDate(wk.weekStart)}</span>${PUSH_ENABLED ? ` <button type="button" class="copy-btn push-week" data-week="${wk.n - 1}">Send week</button>` : ""}</h3>
          <div class="week-meta">
            <span class="pill phase">${wk.phase}</span>
            ${wk.deload ? `<span class="pill phase">Lighter week</span>` : ""}
            <span>${wk.fmt === "time" ? "Time reps" : "Distance reps"}</span>
            <span>Sub-T ${dist(wk.subtKm, 0)} (${Math.round(wk.subtKm / wk.totalKm * 100)}%)</span>
            <span><strong>${dist(wk.totalKm, 0)}</strong> total${changeTxt(wk, weeks)}</span>
            <span>~${fmtDuration(wk.totalSec)}</span>
          </div>
        </div>
        <div class="days">${days}</div>
      </article>`;
    }).join("");
  }

  function renderVolumeSummary(weeks) {
    const el = document.getElementById("volume-summary");
    const vp = weeks.volume;
    const peakWeek = vp.weeks.findIndex((w) => w.atPeak && !w.deload && !w.taper);
    const reach = peakWeek >= 0
      ? `reaches your ${dist(vp.peakKm, 0)} peak in week ${peakWeek + 1}`
      : `reaches ${dist(Math.max(...vp.weeks.filter((w) => !w.deload && !w.taper).map((w) => w.km)), 0)} by week 11 (peak of ${dist(vp.peakKm, 0)} not reached at 5% a week)`;
    el.innerHTML = `Starts at <strong>${dist(vp.startKm, 0)}</strong> and ${reach}. ` +
      `Planned weeks: ${vp.weeks.map((w) => dist(w.km, 0).split(" ")[0]).join(" · ")} ${unitDist()}.`;
  }

  /** Plain-text version of one day's workout, for pasting into a Strava description. */
  function workoutText(wk, d) {
    const name = d.type === "easy" ? (d.strides ? "Easy run + strides" : "Easy run") : d.title;
    const head = `${name} – Week ${wk.n} (${wk.phase})`;
    if (d.type === "easy" || d.type === "longrun") {
      const lines = [head, `${dist(d.km)} easy @ ${rangeOf(lastPaces.easy)}`];
      if (d.strides) lines.push(`Finish with ${d.strides}, fast but relaxed, full recovery between`);
      lines.push(`Est. time: ~${fmtDuration(d.sec)}`);
      return lines.join("\n");
    }
    const lines = [head];
    if (d.wu) lines.push(`Warm-up: ${dist(d.wu)} easy${d.wuExtra || ""}`);
    lines.push(d.main || d.detail);
    if (d.cd) lines.push(`Cool-down: ${dist(d.cd)} easy`);
    lines.push(`Total: ${dist(d.km)} · est. ~${fmtDuration(d.sec)}`);
    return lines.join("\n");
  }

  // ---------------------------------------------------------------- intervals.icu
  // Set to false by the single-file build, whose sandbox cannot reach other sites.
  const PUSH_ENABLED = true;
  const ICU_BASE = "https://intervals.icu/api/v1/athlete/";
  let icuKeyMemory = "";

  function icuKey() {
    if (icuKeyMemory) return icuKeyMemory;
    try { return localStorage.getItem("nsm-icu-key") || ""; } catch (e) { return ""; }
  }
  function setIcuKey(key, remember) {
    icuKeyMemory = key;
    try {
      if (remember && key) localStorage.setItem("nsm-icu-key", key);
      else localStorage.removeItem("nsm-icu-key");
    } catch (e) { /* ignore */ }
  }

  /** "4:12/km" style pace for the intervals.icu workout builder. */
  function icuPace(secPerKm) {
    const mi = state.units === "mi";
    return `${fmtTime(mi ? secPerKm * KM_PER_MI : secPerKm)}/${mi ? "mi" : "km"}`;
  }
  const icuRange = (r) => `${icuPace(r.lo)}-${icuPace(r.hi)} Pace`;
  const icuKm = (km) => `${Math.round(km * 10) / 10}km`;

  /** Workout text in intervals.icu workout-builder syntax. */
  function icuDescription(wk, d) {
    const easy = icuRange(lastPaces.easy);
    const out = [`Norwegian Singles · Week ${wk.n} (${wk.phase})`, ""];
    if (d.type === "easy" || d.type === "longrun") {
      out.push(`- ${d.type === "longrun" ? "Long run" : "Easy"} ${icuKm(d.km)} ${easy}`);
      if (d.strides) {
        const fast = lastPaces.hills.lo - 15;
        out.push("", "Strides 6x", `- Stride 20s ${icuPace(fast)} Pace`, `- Walk/jog 60s ${easy}`, "");
      }
      return out.join("\n");
    }
    if (d.wu) out.push(`- Warmup ${icuKm(d.wu)} ${easy}`, "");
    if (d.type === "race") {
      out.push(`- ${d.title} ${icuKm(d.raceKm)} ${icuPace(d.racePace)} Pace`, "");
    } else if (d.reps) {
      const r = d.reps;
      const step = r.stepKm ? (r.stepKm < 1 ? `${Math.round(r.stepKm * 1000)}mtr` : `${r.stepKm}km`) : `${r.stepMin}m`;
      out.push(`Main Set ${r.n}x`, `- ${step} ${icuRange(r.pace)}`, `- ${r.recLabel} ${r.recS}s ${easy}`, "");
    }
    if (d.cd) out.push(`- Cooldown ${icuKm(d.cd)} ${easy}`);
    return out.join("\n");
  }

  function icuEvent(wk, d, i) {
    const date = new Date(wk.weekStart);
    date.setDate(date.getDate() + i);
    const day = isoDate(date);
    return {
      category: "WORKOUT",
      type: "Run",
      start_date_local: `${day}T00:00:00`,
      name: d.title,
      description: icuDescription(wk, d),
      external_id: `nsm-${day}`,
      moving_time: Math.round(d.sec),
    };
  }

  /** Authenticated call to the intervals.icu API for the configured athlete. */
  async function icuCall(path, method, body) {
    const key = icuKey();
    if (!key) throw new Error("Add your API key on the intervals.icu tab first.");
    const athlete = encodeURIComponent((state.icuAthlete || "").trim() || "0");
    const headers = { Authorization: "Basic " + btoa("API_KEY:" + key) };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(ICU_BASE + athlete + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new Error("Couldn't reach intervals.icu. Check your connection and try again.");
    }
    if (res.status === 401 || res.status === 403) throw new Error("intervals.icu rejected the API key or athlete ID. Check them on the intervals.icu tab.");
    if (res.status === 404) throw new Error("intervals.icu couldn't find that athlete ID. Leave it blank to use your own account.");
    if (!res.ok) throw new Error(`intervals.icu returned an error (${res.status}).`);
    return res;
  }

  /** Returns the connected athlete's name. */
  async function icuCheck() {
    const res = await icuCall("", "GET");
    const data = await res.json().catch(() => ({}));
    return data.name || [data.firstname, data.lastname].filter(Boolean).join(" ") || data.id || "";
  }

  /** Replaces this planner's workouts on the given dates, then creates them. */
  async function icuPush(events) {
    await icuCall("/events/bulk-delete", "PUT", events.map((e) => ({ external_id: e.external_id })));
    await icuCall("/events/bulk", "POST", events);
    return events.length;
  }

  function pushStatus(text, isError) {
    const el = document.getElementById("push-msg");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", !!isError);
  }

  async function runPush(btn, events, label) {
    if (!events.length) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const n = await icuPush(events);
      btn.textContent = "Sent";
      btn.classList.add("done");
      pushStatus(`Sent ${n} workout${n === 1 ? "" : "s"} (${label}) to intervals.icu.`);
    } catch (e) {
      btn.textContent = "Failed";
      pushStatus(e.message, true);
    } finally {
      setTimeout(() => { btn.textContent = original; btn.disabled = false; btn.classList.remove("done"); }, 2000);
    }
  }

  const weekEvents = (wk) => wk.days.map((d, i) => (d.type === "rest" ? null : icuEvent(wk, d, i))).filter(Boolean);

  /** Copies text inside a click handler; falls back to a hidden textarea. */
  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      return Promise.resolve(ok);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true, fallback);
      }
    } catch (e) { /* fall through */ }
    return fallback();
  }

  // ---------------------------------------------------------------- volume chart
  const SVG_NS = "http://www.w3.org/2000/svg";
  function niceStep(range, ticks) {
    const raw = range / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  /** Bar with 4px rounded top corners anchored to the baseline. */
  function barPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /** Phase colour key for week index i: base, build, peak or trial. */
  function phaseKey(i) {
    if (i < 4) return "base";
    if (i < 8) return "build";
    if (i === 11 && (state.finalWeek === "race" || state.finalWeek === "test")) return "trial";
    return "peak";
  }

  function renderVolumeChart(weeks) {
    const host = document.getElementById("volume-chart");
    if (!host) return;
    const trialLegend = document.getElementById("legend-trial");
    if (trialLegend) trialLegend.hidden = phaseKey(11) !== "trial";
    const toUnit = (km) => (state.units === "mi" ? km / KM_PER_MI : km);
    const W = Math.max(host.clientWidth || 0, 300);
    const H = 244;
    const M = { top: 20, right: 8, bottom: 40, left: 38 };
    const pw = W - M.left - M.right;
    const ph = H - M.top - M.bottom;

    const vals = weeks.map((w) => toUnit(w.totalKm));
    const peak = toUnit(weeks.volume.peakKm);
    const step = niceStep(Math.max(...vals, peak) * 1.08, 4);
    const yMax = Math.ceil((Math.max(...vals, peak) * 1.08) / step) * step;
    const y = (v) => M.top + ph - (v / yMax) * ph;
    const band = pw / weeks.length;
    const gap = Math.max(2, band * 0.28);
    const bw = band - gap;
    const compactTime = band < 36; // narrow screens: drop the "h" so labels don't touch

    const full = (i) => !weeks[i].deload && !weeks.volume.weeks[i].taper;
    const peakIdx = vals.indexOf(Math.max(...vals));
    // Label first, highest and last bars; skip the highest when the peak line already names it.
    const labelled = new Set([0, weeks.length - 1]);
    if (Math.abs(vals[peakIdx] - peak) >= 1) labelled.add(peakIdx);

    let svg = `<svg xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly volume for weeks 1 to 12: ${vals.map((v) => Math.round(v)).join(", ")} ${unitDist()}">`;
    svg += `<defs><pattern id="hatch-lighter" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line class="hatch-line" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>`;
    // grid + y labels
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      svg += `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${yy}" y2="${yy}"/>`;
      svg += `<text class="axis" x="${M.left - 6}" y="${yy + 4}" text-anchor="end">${Math.round(v)}</text>`;
    }
    // row captions: units for the bars and the estimated-time row
    svg += `<text class="axis" x="${M.left - 6}" y="${M.top - 8}" text-anchor="end">${unitDist()}</text>`;
    svg += `<text class="axis time-label" x="${M.left - 6}" y="${H - 6}" text-anchor="end">${compactTime ? "Hrs" : "Time"}</text>`;
    // peak target
    const py = Math.round(y(peak)) + 0.5;
    svg += `<line class="peak-line" x1="${M.left}" x2="${W - M.right}" y1="${py}" y2="${py}"/>`;
    svg += `<text class="peak-label" x="${M.left + 4}" y="${py - 5}" text-anchor="start">Peak ${Math.round(peak)} ${unitDist()}</text>`;
    // bars
    weeks.forEach((wk, i) => {
      const x = M.left + i * band + gap / 2;
      const top = y(vals[i]);
      const h = M.top + ph - top;
      svg += `<rect class="hover-col" data-i="${i}" x="${M.left + i * band}" y="${M.top}" width="${band}" height="${ph}"/>`;
      const d = barPath(x, top, bw, h);
      svg += `<path class="bar ph-${phaseKey(i)}" d="${d}"/>`;
      if (wk.deload) svg += `<path class="bar-hatch" d="${d}" fill="url(#hatch-lighter)"/>`;
      if (labelled.has(i)) {
        svg += `<text class="bar-label" x="${x + bw / 2}" y="${top - 5}" text-anchor="middle">${Math.round(vals[i])}</text>`;
      }
      svg += `<text class="axis" x="${x + bw / 2}" y="${H - 22}" text-anchor="middle">${band < 30 ? i + 1 : "W" + (i + 1)}</text>`;
      svg += `<text class="axis time-label" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${compactTime ? (wk.totalSec / 3600).toFixed(1) : fmtHours(wk.totalSec)}</text>`;
    });
    // hit targets on top (full column height)
    weeks.forEach((wk, i) => {
      svg += `<rect class="hit" tabindex="0" data-i="${i}" x="${M.left + i * band}" y="${M.top}" width="${band}" height="${ph + M.bottom}" aria-label="Week ${i + 1}: ${Math.round(vals[i])} ${unitDist()}, about ${fmtDuration(wk.totalSec)}"/>`;
    });
    svg += `</svg><div class="chart-tip" hidden></div>`;
    host.innerHTML = svg;

    // 12-week totals below the chart.
    const total = weeks.reduce((t, w) => t + w.totalKm, 0);
    const subt = weeks.reduce((t, w) => t + w.subtKm, 0);
    const totalTime = weeks.reduce((t, w) => t + w.totalSec, 0);
    const totalEl = document.getElementById("volume-total");
    if (totalEl) {
      totalEl.innerHTML =
        `<div class="stat"><span class="stat-label">12-week total</span><span class="stat-value">${dist(total, 0)}</span></div>` +
        `<div class="stat"><span class="stat-label">Weekly average</span><span class="stat-value">${dist(total / weeks.length, 0)}</span></div>` +
        `<div class="stat"><span class="stat-label">Avg time / week</span><span class="stat-value">${fmtDuration(totalTime / weeks.length)}</span></div>` +
        `<div class="stat"><span class="stat-label">Sub-T reps</span><span class="stat-value">${dist(subt, 0)} <small>(${Math.round(subt / total * 100)}%)</small></span></div>`;
    }

    const tip = host.querySelector(".chart-tip");
    const cols = host.querySelectorAll(".hover-col");
    const show = (i, evt) => {
      const wk = weeks[i];
      const prevFull = weeks.slice(0, i).map((_, j) => j).reverse().find(full);
      let change = "";
      if (full(i) && prevFull != null) {
        const pct = Math.round((wk.targetKm / weeks[prevFull].targetKm - 1) * 100);
        change = `${pct > 0 ? "+" : ""}${pct}% vs last full week`;
      } else if (wk.deload) change = "Lighter week";
      else if (weeks.volume.weeks[i].taper) change = state.finalWeek === "race" ? "Taper + race" : "Time trial week";
      tip.innerHTML = `<i class="sw ph-${phaseKey(i)}"></i> <strong>Week ${wk.n}</strong> · ${wk.phase}<br>` +
        `<span class="tip-val">${dist(wk.totalKm, 0)}</span> · ~${fmtDuration(wk.totalSec)}${change ? `<br>${change}` : ""}<br>` +
        `Sub-T ${dist(wk.subtKm, 0)}`;
      tip.hidden = false;
      cols.forEach((c) => c.classList.toggle("on", Number(c.dataset.i) === i));
      const colX = M.left + (i + 0.5) * band;
      const tw = tip.offsetWidth;
      let left = colX - tw / 2;
      left = Math.max(0, Math.min(W - tw, left));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, y(vals[i]) - tip.offsetHeight - 10)}px`;
    };
    const hide = () => { tip.hidden = true; cols.forEach((c) => c.classList.remove("on")); };
    host.querySelectorAll(".hit").forEach((r) => {
      const i = Number(r.dataset.i);
      r.addEventListener("pointerenter", () => show(i));
      r.addEventListener("focus", () => show(i));
      r.addEventListener("pointerleave", hide);
      r.addEventListener("blur", hide);
    });
  }

  function renderTemplate() {
    const el = document.getElementById("week-template");
    el.innerHTML = DAYS.map((d, i) => {
      const opts = Object.entries(SESSION_TYPES).map(([k, v]) =>
        `<option value="${k}"${state.template[i] === k ? " selected" : ""}>${v.label}</option>`).join("");
      return `<label>${d}<select data-day="${i}">${opts}</select></label>`;
    }).join("");
  }

  // ---------------------------------------------------------------- export
  function exportCSV() {
    const m = model();
    if (!m) return;
    const weeks = buildPlan(m);
    const rows = [["Week", "Phase", "Date", "Day", "Session", "Details", `Distance (${unitDist()})`, "Est. time (min)"]];
    weeks.forEach((wk) => wk.days.forEach((d, i) => {
      const date = new Date(wk.weekStart);
      date.setDate(date.getDate() + i);
      const km = d.km ? (state.units === "mi" ? d.km / KM_PER_MI : d.km).toFixed(1) : "";
      rows.push([wk.n, wk.phase, isoDate(date), DAYS[i], d.title, d.detail, km, d.sec ? Math.round(d.sec / 60) : ""]);
    }));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "norwegian-singles-12-week-plan.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- wiring
  function renderAll() {
    const m = model();
    renderPaces(m);
    renderBuilder(m);
  }

  const FIELDS = {
    "pb-distance": "pbDistance",
    "pb-time": "pbTime",
    "units": "units",
    "pace-adjust": "paceAdjust",
    "start-date": "startDate",
    "peak-volume": "peakVolume",
    "start-volume": "startVolume",
    "subt-share": "subtShare",
    "rep-format": "repFormat",
    "final-week": "finalWeek",
  };

  /** Warm-up / cool-down inputs show the display unit; state keeps km. */
  const WUCD = { "subt-warmup": "subtWarmupKm", "subt-cooldown": "subtCooldownKm" };
  function syncWuCdInputs() {
    const f = state.units === "mi" ? 1 / KM_PER_MI : 1;
    Object.entries(WUCD).forEach(([id, key]) => {
      document.getElementById(id).value = Math.round(Number(state[key]) * f * 10) / 10;
    });
  }

  function syncInputs() {
    syncWuCdInputs();
    Object.entries(FIELDS).forEach(([id, key]) => { document.getElementById(id).value = state[key]; });
    document.getElementById("deloads").checked = !!state.deloads;
    renderTemplate();
  }

  const TABS = ["paces", "builder", "intervals"];
  function showTab(name) {
    if (!TABS.includes(name)) name = "paces";
    TABS.forEach((t) => {
      document.getElementById(`tab-${t}`).setAttribute("aria-selected", String(t === name));
      document.getElementById(`panel-${t}`).hidden = t !== name;
    });
    if (name === "builder" && lastWeeks.length) renderVolumeChart(lastWeeks);
  }

  function init() {
    syncInputs();

    Object.entries(FIELDS).forEach(([id, key]) => {
      const el = document.getElementById(id);
      const handler = () => {
        let v = el.value;
        if (["peakVolume", "startVolume", "paceAdjust", "subtShare"].includes(key)) v = Number(v) || 0;
        if (key === "units" && v !== state.units) {
          const conv = v === "mi" ? 1 / KM_PER_MI : KM_PER_MI;
          state.peakVolume = Math.round(Number(state.peakVolume) * conv);
          state.startVolume = Math.round(Number(state.startVolume) * conv);
          document.getElementById("peak-volume").value = state.peakVolume;
          document.getElementById("start-volume").value = state.startVolume;
          state.units = v;
          syncWuCdInputs();
        }
        state[key] = v;
        save();
        renderAll();
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    });

    Object.entries(WUCD).forEach(([id, key]) => {
      document.getElementById(id).addEventListener("input", (e) => {
        const v = Math.max(0, Number(e.target.value) || 0);
        state[key] = state.units === "mi" ? v * KM_PER_MI : v;
        save();
        renderAll();
      });
    });

    // Remember whether Plan settings is collapsed (per device; harmless if storage is blocked).
    const settingsEl = document.getElementById("plan-settings");
    try { if (localStorage.getItem("nsm-settings-collapsed") === "1") settingsEl.open = false; } catch (e) { /* ignore */ }
    settingsEl.addEventListener("toggle", () => {
      try { localStorage.setItem("nsm-settings-collapsed", settingsEl.open ? "0" : "1"); } catch (e) { /* ignore */ }
    });

    document.getElementById("deloads").addEventListener("change", (e) => {
      state.deloads = e.target.checked; save(); renderAll();
    });

    document.getElementById("week-template").addEventListener("change", (e) => {
      const i = e.target.dataset.day;
      if (i == null) return;
      state.template[Number(i)] = e.target.value;
      save();
      renderAll();
    });

    document.getElementById("btn-print").addEventListener("click", () => window.print());
    document.getElementById("btn-csv").addEventListener("click", exportCSV);

    const pushAll = document.getElementById("btn-push-all");
    if (!PUSH_ENABLED) {
      document.getElementById("icu-form").hidden = true;
      document.getElementById("icu-unavailable").hidden = false;
      if (pushAll) pushAll.hidden = true;
    } else {
      const keyEl = document.getElementById("icu-key");
      const rememberEl = document.getElementById("icu-remember");
      const athleteEl = document.getElementById("icu-athlete");
      keyEl.value = icuKey();
      rememberEl.checked = !!keyEl.value;
      athleteEl.value = state.icuAthlete || "";
      const updateKey = () => setIcuKey(keyEl.value.trim(), rememberEl.checked);
      keyEl.addEventListener("input", updateKey);
      rememberEl.addEventListener("change", updateKey);
      athleteEl.addEventListener("input", () => { state.icuAthlete = athleteEl.value.trim(); save(); });
      pushAll.addEventListener("click", () => runPush(pushAll, lastWeeks.flatMap(weekEvents), "all 12 weeks"));

      const checkBtn = document.getElementById("btn-icu-check");
      const checkMsg = document.getElementById("icu-check-msg");
      checkBtn.addEventListener("click", async () => {
        checkMsg.classList.remove("error", "ok");
        checkBtn.disabled = true;
        checkMsg.textContent = "Checking…";
        try {
          const who = await icuCheck();
          checkMsg.textContent = `Connected${who ? ` as ${who}` : ""}.`;
          checkMsg.classList.add("ok");
        } catch (e) {
          checkMsg.textContent = e.message;
          checkMsg.classList.add("error");
        } finally {
          checkBtn.disabled = false;
        }
      });
    }

    document.getElementById("plan").addEventListener("click", (e) => {
      const btn = e.target.closest(".copy-btn");
      if (!btn) return;
      if (btn.classList.contains("push-week")) {
        const wk = lastWeeks[Number(btn.dataset.week)];
        if (wk) runPush(btn, weekEvents(wk), `week ${wk.n}`);
        return;
      }
      if (btn.classList.contains("push-day")) {
        const wk = lastWeeks[Number(btn.dataset.week)];
        const i = Number(btn.dataset.day);
        if (wk && wk.days[i]) runPush(btn, [icuEvent(wk, wk.days[i], i)], `week ${wk.n} ${DAYS[i]}`);
        return;
      }
      const wk = lastWeeks[Number(btn.dataset.week)];
      const d = wk && wk.days[Number(btn.dataset.day)];
      if (!d) return;
      copyText(workoutText(wk, d)).then((ok) => {
        btn.textContent = ok ? "Copied" : "Copy failed";
        btn.classList.toggle("done", ok);
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1600);
      });
    });
    document.getElementById("btn-reset").addEventListener("click", () => {
      const keep = { pbDistance: state.pbDistance, pbTime: state.pbTime, units: state.units };
      state = Object.assign({}, DEFAULTS, keep, { template: DEFAULTS.template.slice(), startDate: nextMonday() });
      save();
      syncInputs();
      renderAll();
    });

    document.getElementById("tab-paces").addEventListener("click", () => { location.hash = "paces"; showTab("paces"); });
    document.getElementById("tab-builder").addEventListener("click", () => { location.hash = "builder"; showTab("builder"); });
    document.getElementById("tab-intervals").addEventListener("click", () => { location.hash = "intervals"; showTab("intervals"); });
    window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (lastWeeks.length) renderVolumeChart(lastWeeks); }, 120);
    });
    showTab(location.hash.slice(1));

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
