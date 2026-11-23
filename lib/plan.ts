import { KM_PER_MI, mid, nextMonday, parseDate, type Range } from "./format";
import type { Model, Paces } from "./vdot";
import { BAKKEN_HARD, periodVolume, QUALITY, type BakkenSlot, type Settings, type SessionType } from "./settings";
import { type Calendar, type CalBlock } from "./calendar";

export const MAX_WEEKLY_INCREASE = 0.05;
export const DELOAD_FACTOR = 0.8;
export const TAPER_FACTOR = 0.65;
export const PRE_TAPER_FACTOR = 0.85; // the week before a race week
export const VACATION_FACTOR = 0.3;
export const MIN_EASY_KM = 3;
export const STRIDES = "6 × 20s strides";

const SUBT = {
  short: { name: "Sub-T short", distKm: 1, min: 3, recS: 60 },
  medium: { name: "Sub-T medium", distKm: 2, min: 6, recS: 60 },
  long: { name: "Sub-T long", distKm: 3, min: 10, recS: 90 },
} as const;

const REPS = {
  short: { min: 4, max: 12, weight: 1, repKm: 0 },
  medium: { min: 2, max: 6, weight: 1, repKm: 0 },
  long: { min: 2, max: 4, weight: 1, repKm: 0 },
  hills: { min: 8, max: 25, weight: 0.6, repKm: 0.4 },
} as const;

export type Phase = string; // "Block 2", "Taper", "Race week", "Time trial", "Vacation"
export type PhaseKey = "base" | "build" | "peak" | "trial";
export type DayType = SessionType | "race" | "double" | "single" | "x";

export interface Reps {
  n: number;
  stepKm: number | null; // null = time-based reps
  stepMin: number;
  recS: number;
  pace: Range;
  recLabel: "Jog" | "Rest";
}

export interface Session {
  type: DayType;
  title: string;
  km: number;
  sec: number;
  wu?: number;
  cd?: number;
  strides?: boolean;
  reps?: Reps;
  repKm?: number;
  raceKm?: number;
  racePace?: number;
  raceTime?: number;
  raceLabel?: string;
  /** Double threshold days: the afternoon session (this session is the morning one). */
  pm?: Session;
  /** Overrides the generated main line (used for X sessions). */
  mainText?: string;
  /** Why a no-run day isn't a plain rest day. */
  off?: "vacation" | "hyrox";
  note?: string;
}

export interface Week {
  n: number;
  phase: Phase;
  phaseKey: PhaseKey;
  deload: boolean;
  taper: boolean;
  atPeak: boolean;
  fmt: "distance" | "time";
  days: Session[];
  weekStart: Date;
  targetKm: number;
  totalKm: number;
  totalSec: number;
  subtKm: number;
  tooLow: boolean;
  /** The peak volume this week's period is building to. */
  peakKm: number;
  /** Which run method built this week. */
  method: "singles" | "bakken";
  period: number;
  block: number;
  pos: number;
  vacation: boolean;
  raceNames: string[];
  /** Last week of a 12-week period: a 5k test that sets the next period's paces. */
  testWeek: boolean;
  /** The VDOT whose paces this week uses. */
  vdot: number;
  /** The paces this week uses (from its period's model). */
  paces: Paces;
}

export interface Plan {
  weeks: Week[];
  startKm: number;
  peakKm: number;
  peakWeek: number | null; // 1-based week the peak is first reached
  /** Per 12-week period: its start and peak, and when (if) the peak is reached. */
  periods: { startKm: number; peakKm: number; peakWeek: number | null; maxKm: number }[];
  blocks: CalBlock[];
}

const toKm = (v: number, s: Settings) => (s.units === "mi" ? Number(v) * KM_PER_MI : Number(v));

/** Estimated duration: warm-up, reps, recoveries and cool-down at their paces. */
function sessionSeconds(d: Session, p: Paces): number {
  const easy = mid(p.easy);
  if (d.type === "rest") return 0;
  if (d.type === "easy" || d.type === "longrun") return d.km * easy + (d.strides ? 6 * (20 + 60) : 0);
  const t = (d.wu || 0) * easy + (d.cd || 0) * easy;
  if (d.type === "race") return t + (d.raceKm || 0) * (d.racePace || easy);
  const r = d.reps;
  if (!r) return d.km * easy;
  const work = r.stepKm ? r.n * r.stepKm * mid(r.pace) : r.n * r.stepMin * 60;
  return t + work + (r.n - 1) * r.recS;
}

export function buildPlan(s: Settings, m: Model, cal: Calendar, models?: (Model | null)[]): Plan {
  const vol = (p: number) => {
    const v = periodVolume(s, p);
    const a = Math.max(toKm(v.start, s) || 0, 10);
    return { startKm: a, peakKm: Math.max(toKm(v.peak, s) || 0, a) };
  };
  const startKm = vol(0).startKm;
  let peakKm = vol(0).peakKm;
  const periods: Plan["periods"] = [];
  const wu = Math.max(0, Number(s.subtWarmupKm) || 0);
  const cd = Math.max(0, Number(s.subtCooldownKm) || 0);
  const raceKey = s.pbDistance === "10000" ? "10k" : "5k";
  const raceKm = Number(s.pbDistance) / 1000;
  const weeks: Week[] = [];
  let level = startKm;
  let peakWeek: number | null = null;

  let hold = false; // no increase in the first week back from a vacation
  for (const cw of cal.weeks) {
    const w = cw.i;
    const pm = models?.[cw.period] ?? m;
    const p = pm.paces;
    // Each 12-week period ramps from its own start volume toward its own peak.
    const newPeriod = cw.pos === 0 && cw.blockInPeriod === 0;
    if (newPeriod) {
      const v = vol(cw.period);
      peakKm = v.peakKm;
      if (cw.period > 0) level = v.startKm;
      periods[cw.period] = { startKm: v.startKm, peakKm: v.peakKm, peakWeek: null, maxKm: 0 };
    }
    const vacation = cw.role === "vacation";
    const raceWeek = cw.role === "race";
    const preTaper = cw.role === "taper";
    const finalTest = cw.last && !raceWeek && s.finalWeek !== "normal";
    // Last week of a non-final 12-week period: a 5k test that sets the next period's paces.
    const testWeek = cw.blockInPeriod === 2 && cw.pos === 3 && !cw.last && cw.role === "load";
    const taper = raceWeek || preTaper || finalTest || testWeek;
    const deload = s.deloads && cw.pos === 3 && cw.role === "load" && !finalTest && !testWeek;
    if (w > 0 && !newPeriod && !taper && !deload && !vacation) {
      if (hold) hold = false;
      else level = Math.min(peakKm, level * (1 + MAX_WEEKLY_INCREASE));
    }
    const targetKm = vacation ? level * VACATION_FACTOR
      : raceWeek || finalTest ? level * TAPER_FACTOR
      : preTaper ? level * PRE_TAPER_FACTOR
      : deload || testWeek ? level * DELOAD_FACTOR : level;
    if (vacation) { hold = true; level *= 0.95; }
    const atPeak = level >= peakKm - 0.05;
    if (atPeak && !deload && !taper && !vacation && peakWeek === null) peakWeek = w + 1;
    const pp = periods[cw.period];
    if (atPeak && !deload && !taper && !vacation && pp.peakWeek === null) pp.peakWeek = w + 1;
    if (!deload && !taper && !vacation) pp.maxKm = Math.max(pp.maxKm, level);
    const fmt: "distance" | "time" = s.repFormat === "mixed" ? (w % 2 === 0 ? "distance" : "time") : s.repFormat;

    const bakken = s.runMethod === "bakken";
    const tmpl: DayType[] = (bakken ? s.bakkenTemplate : s.template).slice();
    if (bakken) {
      // Low mileage: only the first double day stays double. Lighter and taper weeks drop one afternoon session.
      const lowKm = toKm(s.lowMileage, s);
      const doubles = tmpl.map((t, i) => (t === "double" ? i : -1)).filter((i) => i >= 0);
      const keepDoubles = level < lowKm || deload || testWeek || preTaper ? 1 : doubles.length;
      doubles.slice(keepDoubles).forEach((i) => { tmpl[i] = "single"; });
    }
    const notes: (Partial<Pick<Session, "off" | "note" | "title">> | undefined)[] = Array(7).fill(undefined);
    const isQ = (t: DayType) => QUALITY.includes(t as SessionType) || BAKKEN_HARD.includes(t as BakkenSlot);
    if (raceWeek) {
      // Race days, then: no long run, no quality within 2 days of a race or after it, at most one sharpener.
      const raceDays = cw.races.map((r) => r.day);
      const first = Math.min(...raceDays);
      let kept = false;
      for (let i = 0; i < 7; i++) {
        if (tmpl[i] === "longrun") tmpl[i] = "easy";
        if (isQ(tmpl[i])) {
          if (!kept && first - i >= 3 && tmpl[i] !== "x") { kept = true; if (tmpl[i] === "double") tmpl[i] = "single"; }
          else tmpl[i] = "easy";
        }
      }
      for (const { day, race } of cw.races) {
        if (race.kind === "run") { tmpl[day] = "race"; notes[day] = { title: race.name || "Race" }; }
        else { tmpl[day] = "rest"; notes[day] = { off: "hyrox", note: race.name || "HYROX race", title: "HYROX race" }; }
        if (day + 1 < 7 && !raceDays.includes(day + 1)) { tmpl[day + 1] = "rest"; notes[day + 1] = { note: "Recovery after the race" }; }
      }
    } else if (finalTest || testWeek) {
      // Last week with no race (or a 5k test week): the last quality session becomes a time trial.
      let last = -1;
      tmpl.forEach((t, i) => { if (isQ(t)) last = i; });
      if (last === -1) last = 5;
      tmpl[last] = "race";
      for (let i = last + 1; i < 7; i++) if (tmpl[i] === "longrun" || isQ(tmpl[i])) tmpl[i] = "easy";
    }
    if (cw.afterRace && tmpl[0] !== "race") { tmpl[0] = "rest"; notes[0] = { note: "Recovery after yesterday's race" }; }
    cw.off.forEach((off, i) => { if (off && tmpl[i] !== "race" && notes[i]?.off !== "hyrox") { tmpl[i] = "rest"; notes[i] = { off: "vacation", note: "Vacation" }; } });

    // Rep counts from the sub-T share of the week's volume, split by weight and clamped.
    const quality = tmpl.filter((t) => QUALITY.includes(t as SessionType)) as (keyof typeof REPS)[];
    const totalWeight = quality.reduce((a, t) => a + REPS[t].weight, 0);
    const budget = (targetKm * (Number(s.subtShare) || 25)) / 100;
    const counts: Partial<Record<keyof typeof REPS, number>> = {};
    quality.forEach((t) => {
      if (counts[t] != null) return;
      const r = REPS[t];
      const perRepKm = t === "hills" ? r.repKm : fmt === "time" ? (SUBT[t].min * 60) / mid(p[t]) : SUBT[t].distKm;
      counts[t] = Math.min(r.max, Math.max(r.min, Math.round(((budget * r.weight) / totalWeight) / perRepKm)));
    });

    // Bakken: threshold work is the threshold share of the week, split over the sessions (25–40 min of reps each).
    const bk = bakken ? bakkenSessions(tmpl, targetKm, s, p, w, cw.blockInPeriod, raceWeek || preTaper || finalTest, deload || testWeek || preTaper) : null;

    const days: Session[] = tmpl.map((type, di): Session => {
      if (bk && (type === "double" || type === "single" || type === "x")) return bk(type);
      if (type === "rest") return { type, title: notes[di]?.title || (notes[di]?.off === "vacation" ? "Vacation" : "Rest"), km: 0, sec: 0, off: notes[di]?.off, note: notes[di]?.note };
      if (type === "easy") return { type, title: "Easy", km: 0, sec: 0 };
      if (type === "longrun") return { type, title: "Long run", km: 0, sec: 0 };
      if (type === "race") {
        const key = testWeek ? "5k" : raceKey;
        const rKm = testWeek ? 5 : raceKm;
        const r = pm.races[key];
        const label = key === "10k" ? "10k" : "5k";
        return {
          type, title: testWeek ? "5k test" : notes[di]?.title || `${label} time trial`,
          km: rKm + 5, sec: 0, wu: 3, cd: 2, raceKm: rKm, racePace: r.pace, raceTime: r.time, raceLabel: label,
        };
      }
      if (type === "hills") {
        const n = counts.hills ?? REPS.hills.min;
        return {
          type, title: "400s / hills", sec: 0, wu, cd,
          km: wu + n * 0.4 + (n - 1) * 0.08 + cd, repKm: n * 0.4,
          reps: { n, stepKm: 0.4, stepMin: 0, recS: 30, pace: p.hills, recLabel: "Rest" },
        };
      }
      if (type === "double" || type === "single" || type === "x") return { type: "easy", title: "Easy", km: 0, sec: 0 }; // not reached
      const sub = SUBT[type];
      const n = counts[type] ?? REPS[type].min;
      const pc = p[type];
      const repKm = fmt === "time" ? (n * sub.min * 60) / mid(pc) : n * sub.distKm;
      const recKm = (n - 1) * (sub.recS / 420); // slow jog ≈ 7:00/km
      return {
        type, title: sub.name, sec: 0, wu, cd, repKm,
        km: wu + repKm + recKm + cd,
        reps: { n, stepKm: fmt === "time" ? null : sub.distKm, stepMin: sub.min, recS: sub.recS, pace: pc, recLabel: "Jog" },
      };
    });

    const firstEasy = days.find((d) => d.type === "easy");
    if (firstEasy) { firstEasy.title = "Easy + strides"; firstEasy.strides = true; }
    const longRun = days.find((d) => d.type === "longrun");
    if (longRun) longRun.km = Math.min(Math.max(targetKm * 0.22, 8), 32);

    const fixedKm = days.reduce((a, d) => a + dayKm(d), 0);
    const easyDays = days.filter((d) => d.type === "easy");
    let easyEach = easyDays.length ? (targetKm - fixedKm) / easyDays.length : 0;
    const tooLow = easyDays.length > 0 && easyEach < MIN_EASY_KM;
    easyEach = Math.max(easyEach, easyDays.length ? MIN_EASY_KM : 0);
    easyDays.forEach((d) => { d.km = easyEach; });
    days.forEach((d) => { d.sec = sessionSeconds(d, p); if (d.pm) d.pm.sec = sessionSeconds(d.pm, p); });

    const weekStart = cw.start;
    const phase: Phase = vacation ? "Vacation" : raceWeek ? "Race week" : finalTest ? "Time trial" : testWeek ? "5k test" : preTaper ? "Taper" : `Block ${cw.blockInPeriod + 1}`;
    weeks.push({
      n: w + 1, phase, phaseKey: raceWeek || finalTest || testWeek ? "trial" : cw.phase, deload, taper, atPeak, fmt, days, weekStart, targetKm,
      peakKm, method: bakken ? "bakken" : "singles", period: cw.period, block: cw.block, pos: cw.pos, vacation, raceNames: cw.races.map((r) => r.race.name || "Race"),
      totalKm: days.reduce((a, d) => a + dayKm(d), 0),
      totalSec: days.reduce((a, d) => a + d.sec + (d.pm?.sec || 0), 0),
      subtKm: days.reduce((a, d) => a + (d.repKm || 0) + (d.pm?.repKm || 0), 0),
      tooLow, testWeek, vdot: pm.vdot, paces: p,
    });
  }
  return { weeks, startKm, peakKm: Math.max(...periods.map((p) => p.peakKm)), peakWeek, periods, blocks: cal.blocks };
}

export const dayDate = (wk: Week, i: number) => {
  const d = new Date(wk.weekStart);
  d.setDate(d.getDate() + i);
  return d;
};

/** Change vs the last full week (lighter and taper weeks skipped), as whole %. */
export function changeVsLastFull(weeks: Week[], i: number): number | null {
  const full = (w: Week) => !w.deload && !w.taper && !w.vacation;
  if (!full(weeks[i])) return null;
  for (let j = i - 1; j >= 0; j--) {
    if (full(weeks[j])) return Math.round((weeks[i].targetKm / weeks[j].targetKm - 1) * 100);
  }
  return null;
}

/** A day's distance including a double day's afternoon session. */
export const dayKm = (d: Session) => d.km + (d.pm?.km || 0);
export const daySec = (d: Session) => d.sec + (d.pm?.sec || 0);

/* ---------- Norwegian Method (Marius Bakken): double threshold days and an X session ---------- */

const AM_FORMATS = [6, 8, 10, 5];                    // minutes per rep, 60 s jog
const PM_FORMATS = [                                // rep km, jog s, min and max reps
  { km: 1, rec: 60, lo: 6, hi: 12 },
  { km: 0.4, rec: 30, lo: 15, hi: 25 },
  { km: 2, rec: 60, lo: 3, hi: 6 },
  { km: 1.2, rec: 60, lo: 5, hi: 10 },
];

function bakkenSessions(tmpl: DayType[], targetKm: number, s: Settings, p: Paces, w: number, blockInPeriod: number, nearRace: boolean, light: boolean) {
  const wu = Math.max(0, Number(s.subtWarmupKm) || 0);
  const cd = Math.max(0, Number(s.subtCooldownKm) || 0);
  // Morning: controlled, half-marathon to 30k pace. Afternoon: 15k to half pace, never faster than threshold.
  const amPace: Range = { lo: p.medium.lo, hi: p.long.hi };
  const pmPace: Range = { lo: Math.max(p.short.lo, p.threshold.lo), hi: p.short.hi };
  const n = tmpl.reduce((a, t) => a + (t === "double" ? 2 : t === "single" ? 1 : 0), 0) || 1;
  const perKm = (targetKm * (Number(s.subtShare) || 25)) / 100 / n;
  const workMin = (pace: Range) => Math.min(40, Math.max(15, (perKm * mid(pace)) / 60));
  let k = 0; // threshold sessions so far this week: rotates the formats so no two are the same
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(v)));

  const am = (title: string): Session => {
    const step = AM_FORMATS[(w + k * 2) % AM_FORMATS.length];
    const reps = clamp(workMin(amPace) / step, 3, 8);
    const repKm = (reps * step * 60) / mid(amPace);
    return { type: "single", title, sec: 0, wu, cd, repKm, km: wu + repKm + ((reps - 1) * 60) / 420 + cd,
      reps: { n: reps, stepKm: null, stepMin: step, recS: 60, pace: amPace, recLabel: "Jog" } };
  };
  const pm = (): Session => {
    const f = PM_FORMATS[(w + k * 2 + 1) % PM_FORMATS.length];
    const reps = clamp((workMin(pmPace) * 60) / mid(pmPace) / f.km, f.lo, f.hi);
    const repKm = reps * f.km;
    return { type: "single", title: "PM threshold", sec: 0, wu, cd, repKm, km: wu + repKm + ((reps - 1) * f.rec) / 420 + cd,
      reps: { n: reps, stepKm: f.km, stepMin: 0, recS: f.rec, pace: pmPace, recLabel: "Jog" } };
  };
  const x = (): Session => {
    const hp = p.hills;
    // Fewer reps on lighter weeks and at lower volume (full session from about 80 km a week).
    const scale = (light ? 0.7 : 1) * Math.min(1, Math.max(0.5, targetKm / 80));
    // Base blocks: short hill reps. The block before a race and the weeks around races: faster flat reps.
    const hills = blockInPeriod < 2 && !nearRace;
    const kind = hills ? "hills" : (["300s", "45/15", "400s"] as const)[w % 3];
    const wuX = 3, cdX = 2;
    if (kind === "hills") {
      const reps = clamp(20 * scale, 8, 20), repSec = 0.2 * mid(hp) * 1.15;
      return { type: "x", title: "X session · hills", sec: 0, wu: wuX, cd: cdX, km: wuX + reps * 0.4 + cdX,
        mainText: `${reps} × 200 m uphill, strong and relaxed (flat-ground effort ${rangeOfPace(hp, s)}), jog down recovery`,
        reps: { n: reps, stepKm: 0.2, stepMin: 0, recS: Math.round(repSec * 2), pace: hp, recLabel: "Jog" } };
    }
    if (kind === "45/15") {
      const reps = clamp(20 * scale, 12, 20);
      return { type: "x", title: "X session · 45/15", sec: 0, wu: wuX, cd: cdX, km: wuX + (reps * 45) / mid(hp) + (reps * 15) / 420 + cdX,
        mainText: `${reps} × (45 s fast @ ${rangeOfPace(hp, s)} / 15 s jog), continuous`,
        reps: { n: reps, stepKm: null, stepMin: 0.75, recS: 15, pace: hp, recLabel: "Jog" } };
    }
    const km = kind === "300s" ? 0.3 : 0.4;
    const reps = clamp((kind === "300s" ? 10 : 8) * scale, 5, 10);
    return { type: "x", title: `X session · ${km * 1000}s`, sec: 0, wu: wuX, cd: cdX, km: wuX + reps * km + (reps * (kind === "300s" ? 120 : 90)) / 420 + cdX,
      reps: { n: reps, stepKm: km, stepMin: 0, recS: kind === "300s" ? 120 : 90, pace: hp, recLabel: "Jog" } };
  };
  return (type: DayType): Session => {
    if (type === "x") return x();
    if (type === "single") { const one = { ...am("Threshold"), type: "single" as const }; k++; return one; }
    const morning = am("AM threshold");
    const afternoon = pm();
    k++;
    return { ...morning, type: "double", title: "Double threshold", pm: afternoon };
  };
}

const rangeOfPace = (r: Range, s: Settings) => {
  const f = (x: number) => { const v = Math.round(s.units === "mi" ? x * KM_PER_MI : x); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
  return `${f(r.lo)}–${f(r.hi)}/${s.units === "mi" ? "mi" : "km"}`;
};
