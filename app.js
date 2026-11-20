/* Norwegian Singles Planner
 * Pure client-side: no build step, no dependencies.
 * All distances are handled internally in km and paces in seconds per km.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- constants
  const KM_PER_MI = 1.609344;
  const RIEGEL = 1.06;
  const STORAGE_KEY = "nsm-planner-v1";
  const MIN_EASY_KM = 3;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const RACES = [
    { key: "5k", label: "5k", m: 5000 },
    { key: "10k", label: "10k", m: 10000 },
    { key: "15k", label: "15k", m: 15000 },
    { key: "hm", label: "Half marathon", m: 21097.5 },
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

  // 12-week progression. Index 0 = week 1.
  // Weeks 4 and 8 are lighter weeks; week 12 is overridden by the "Week 12" setting.
  const PROG = {
    volume: [0.80, 0.85, 0.90, 0.75, 0.90, 0.95, 1.00, 0.80, 0.95, 1.00, 1.00, 0.95],
    short: [8, 9, 10, 7, 10, 10, 11, 8, 10, 11, 10, 10],
    medium: [4, 4, 5, 3, 5, 5, 5, 4, 5, 5, 5, 5],
    long: [2, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 3],
    hills: [16, 18, 20, 14, 20, 22, 24, 16, 22, 24, 20, 20],
  };
  const DELOAD_WEEKS = [3, 7]; // zero-based
  const TAPER = { volume: 0.65, short: 6, medium: 3, long: 2, hills: 12 };

  const DEFAULTS = {
    pbDistance: "5000",
    pbTime: "19:45",
    units: "km",
    paceAdjust: 0,
    startDate: nextMonday(),
    peakVolume: 75,
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

  function riegel(t1, d1, d2) {
    return t1 * Math.pow(d2 / d1, RIEGEL);
  }

  // ---------------------------------------------------------------- state
  let state = load();

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

    const races = {};
    RACES.forEach((r) => {
      const t = r.m === pbM ? pbSec : riegel(pbSec, pbM, r.m);
      races[r.key] = { ...r, time: t, pace: t / (r.m / 1000), isPB: r.m === pbM };
    });

    const adj = Number(state.paceAdjust) || 0;
    const mp = races.m.pace;
    const paces = {
      easyLo: mp * 1.12,
      easyHi: mp * 1.25,
      short: races["15k"].pace + adj,
      medium: races.hm.pace + adj,
      long: races["30k"].pace + adj,
      hills: races["10k"].pace,
    };
    return { races, paces, pbSec, pbM };
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

    const p = m.paces;
    const repLine = (secPerKm, km, label) => `${label}: ${fmtTime(secPerKm * km)}`;
    const timeLine = (secPerKm, min) => `${min} min ≈ ${Math.round((min * 60) / secPerKm * 1000)} m`;

    const rows = [
      ["Easy / recovery", "Marathon pace + 12–25%", paceRange(p.easyLo, p.easyHi), "Conversational. Go slower if you need to."],
      ["Long run", "Easy pace", paceRange(p.easyLo, p.easyHi), "Easy all the way, typically 20–25% of weekly volume"],
      ["Sub-T short", "≈ 15k race pace", pace(p.short), `${repLine(p.short, 1, "1 km")} · ${timeLine(p.short, 3)} · 60s rest`],
      ["Sub-T medium", "≈ Half marathon pace", pace(p.medium), `${repLine(p.medium, 2, "2 km")} · ${timeLine(p.medium, 6)} · 60s rest`],
      ["Sub-T long", "≈ 30k race pace", pace(p.long), `${repLine(p.long, 3, "3 km")} · ${timeLine(p.long, 10)} · 60–90s rest`],
      ["400s / hills", "≈ 10k race pace / effort", pace(p.hills), `${repLine(p.hills, 0.4, "400 m")} · 30s rest (or 200 m hills, jog down)`],
    ];
    paceBody.innerHTML = rows.map((r) =>
      `<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="reps">${r[3]}</td></tr>`
    ).join("");
  }

  // ---------------------------------------------------------------- tab 2: builder
  function weekValues(w) {
    // w is zero-based
    let i = w;
    if (!state.deloads && DELOAD_WEEKS.includes(w)) i = w - 1; // repeat previous week instead
    const v = {
      volume: PROG.volume[i], short: PROG.short[i], medium: PROG.medium[i],
      long: PROG.long[i], hills: PROG.hills[i],
      deload: state.deloads && DELOAD_WEEKS.includes(w),
    };
    if (w === 11) {
      if (state.finalWeek === "race" || state.finalWeek === "test") {
        Object.assign(v, TAPER);
      } else {
        Object.assign(v, { volume: PROG.volume[10], short: PROG.short[10], medium: PROG.medium[10], long: PROG.long[10], hills: PROG.hills[10] });
      }
    }
    return v;
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
    if (type === "easy") return { type, title: "Easy", detail: paceRange(p.easyLo, p.easyHi), km: null };
    if (type === "longrun") return { type, title: "Long run", detail: `Easy, ${paceRange(p.easyLo, p.easyHi)}`, km: null };

    if (type === "race") {
      const label = state.pbDistance === "10000" ? "10k" : "5k";
      const what = state.finalWeek === "race" ? `${label} race` : `${label} time trial`;
      const target = model().races[state.pbDistance === "10000" ? "10k" : "5k"];
      return {
        type, title: what,
        detail: `Thorough warm-up with strides. Current PB pace ${pace(target.pace)} (${fmtTime(target.time)})`,
        km: raceKm + 5,
      };
    }

    if (type === "hills") {
      const n = wv.hills;
      return {
        type, title: "400s / hills",
        detail: `${n} × 400 m @ ${pace(p.hills)} (${fmtTime(p.hills * 0.4)}), 30s rest, or ${n} × 200 m hills, jog down`,
        km: 3 + n * 0.4 + (n - 1) * 0.08 + 2,
      };
    }

    const s = SUBT[type];
    const n = wv[type];
    const pc = p[type];
    let detail, repKm;
    if (fmt === "time") {
      detail = `${n} × ${s.min} min @ ${pace(pc)}, ${s.recS}s jog`;
      repKm = n * (s.min * 60) / pc;
    } else {
      detail = `${n} × ${s.distLabel} @ ${pace(pc)} (${fmtTime(pc * s.distKm)}), ${s.recS}s jog`;
      repKm = n * s.distKm;
    }
    const recKm = (n - 1) * (s.recS / 420); // slow jog ≈ 7:00/km
    return { type, title: s.name, detail, km: 2 + repKm + recKm + 1.5, wuNote: true };
  }

  function buildPlan(m) {
    const p = m.paces;
    const peakKm = state.units === "mi" ? state.peakVolume * KM_PER_MI : Number(state.peakVolume);
    const start = parseDate(state.startDate) || parseDate(nextMonday());
    const raceKm = Number(state.pbDistance) / 1000;
    const weeks = [];

    for (let w = 0; w < 12; w++) {
      const wv = weekValues(w);
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

      const days = tmpl.map((t) => buildSession(t, w, wv, p, fmt, raceKm));
      const targetKm = peakKm * wv.volume;

      const longRun = days.find((d) => d.type === "longrun");
      if (longRun) longRun.km = Math.min(Math.max(targetKm * 0.22, 8), 32);

      const fixedKm = days.reduce((a, d) => a + (d.km || 0), 0);
      const easyDays = days.filter((d) => d.type === "easy");
      let easyEach = easyDays.length ? (targetKm - fixedKm) / easyDays.length : 0;
      const tooLow = easyDays.length > 0 && easyEach < MIN_EASY_KM;
      easyEach = Math.max(easyEach, easyDays.length ? MIN_EASY_KM : 0);
      easyDays.forEach((d) => { d.km = easyEach; });

      const totalKm = days.reduce((a, d) => a + (d.km || 0), 0);
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + 7 * w);

      weeks.push({
        n: w + 1, phase: phaseFor(w), deload: wv.deload, fmt, days, totalKm, targetKm, tooLow, weekStart,
      });
    }
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

    if (!m) {
      summary.innerHTML = `Enter a valid PB on the <a href="#paces">Predicted Paces</a> tab first.`;
      planEl.innerHTML = "";
      warnEl.innerHTML = "";
      return;
    }
    const pbLabel = m.pbM === 10000 ? "10k" : "5k";
    summary.innerHTML = `Using your <strong>${pbLabel} PB of ${fmtTime(m.pbSec)}</strong>. Sub-T paces: short ${pace(m.paces.short)} · medium ${pace(m.paces.medium)} · long ${pace(m.paces.long)}. <a href="#paces">Change</a>`;

    const weeks = buildPlan(m);
    const warns = templateWarnings();
    if (weeks.some((w) => w.tooLow)) {
      warns.push(`Your peak volume is too low for this template: some easy runs were raised to the ${dist(MIN_EASY_KM)} minimum, so weekly totals are above target. Raise the volume or swap an easy day for rest.`);
    }
    warnEl.innerHTML = warns.map((w) => `<div class="warning">${w}</div>`).join("");

    planEl.innerHTML = weeks.map((wk) => {
      const days = wk.days.map((d, i) => {
        const date = new Date(wk.weekStart);
        date.setDate(date.getDate() + i);
        const cls = d.type === "race" ? "race" : SESSION_TYPES[d.type]?.cls || "easy";
        const kmTxt = d.km ? `${dist(d.km)}${d.wuNote ? " incl. WU/CD" : ""}` : "";
        return `<div class="day ${cls}">
          <div class="day-name">${DAYS[i]} <span class="hint">${fmtShortDate(date)}</span></div>
          <div class="day-title">${d.title}</div>
          <div class="day-detail">${d.detail}</div>
          ${kmTxt ? `<div class="day-dist">${kmTxt}</div>` : ""}
        </div>`;
      }).join("");
      return `<article class="week">
        <div class="week-head">
          <h3>Week ${wk.n} <span class="hint">· ${fmtShortDate(wk.weekStart)}</span></h3>
          <div class="week-meta">
            <span class="pill phase">${wk.phase}</span>
            ${wk.deload ? `<span class="pill phase">Lighter week</span>` : ""}
            <span>${wk.fmt === "time" ? "Time reps" : "Distance reps"}</span>
            <span><strong>${dist(wk.totalKm, 0)}</strong> total</span>
          </div>
        </div>
        <div class="days">${days}</div>
      </article>`;
    }).join("");
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
    const rows = [["Week", "Phase", "Date", "Day", "Session", "Details", `Distance (${unitDist()})`]];
    weeks.forEach((wk) => wk.days.forEach((d, i) => {
      const date = new Date(wk.weekStart);
      date.setDate(date.getDate() + i);
      const km = d.km ? (state.units === "mi" ? d.km / KM_PER_MI : d.km).toFixed(1) : "";
      rows.push([wk.n, wk.phase, isoDate(date), DAYS[i], d.title, d.detail, km]);
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
    "rep-format": "repFormat",
    "final-week": "finalWeek",
  };

  function syncInputs() {
    Object.entries(FIELDS).forEach(([id, key]) => { document.getElementById(id).value = state[key]; });
    document.getElementById("deloads").checked = !!state.deloads;
    renderTemplate();
  }

  function showTab(name) {
    const isBuilder = name === "builder";
    document.getElementById("tab-paces").setAttribute("aria-selected", String(!isBuilder));
    document.getElementById("tab-builder").setAttribute("aria-selected", String(isBuilder));
    document.getElementById("panel-paces").hidden = isBuilder;
    document.getElementById("panel-builder").hidden = !isBuilder;
  }

  function init() {
    syncInputs();

    Object.entries(FIELDS).forEach(([id, key]) => {
      const el = document.getElementById(id);
      const handler = () => {
        let v = el.value;
        if (key === "peakVolume" || key === "paceAdjust") v = Number(v) || 0;
        if (key === "units" && v !== state.units) {
          const conv = v === "mi" ? 1 / KM_PER_MI : KM_PER_MI;
          state.peakVolume = Math.round(Number(state.peakVolume) * conv);
          document.getElementById("peak-volume").value = state.peakVolume;
        }
        state[key] = v;
        save();
        renderAll();
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
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
    document.getElementById("btn-reset").addEventListener("click", () => {
      const keep = { pbDistance: state.pbDistance, pbTime: state.pbTime, units: state.units };
      state = Object.assign({}, DEFAULTS, keep, { template: DEFAULTS.template.slice(), startDate: nextMonday() });
      save();
      syncInputs();
      renderAll();
    });

    document.getElementById("tab-paces").addEventListener("click", () => { location.hash = "paces"; showTab("paces"); });
    document.getElementById("tab-builder").addEventListener("click", () => { location.hash = "builder"; showTab("builder"); });
    window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
    showTab(location.hash.slice(1));

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
