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
/** Norwegian Method long run cap: Bakken kept it to 16–18 km, about an hour. */
export const BAKKEN_LONG_RUN_MAX_KM = 18;
export const STRIDES = "6 × 20s strides";

const SUBT = {
  short: { name: "Sub-T short", distKm: 1, min: 3, recS: 60 },
  medium: { name: "Sub-T medium", distKm: 2, min: 6, recS: 60 },
  long: { name: "Sub-T long", distKm: 3, min: 10, recS: 90 },
} as const;

/** Fewest reps a sub-T session can be trimmed to when the week's share is tight. */
const FLOOR = { short: 3, medium: 2, long: 1, hills: 6 } as const;

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
  /** A second set after the first (e.g. 300s after 1000s). */
  reps2?: Reps;
  /** Fewest reps this session may be trimmed to so the week stays within its threshold share. */
  minReps?: number;
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
  if (!d.reps) return d.km * easy;
  const set = (r: Reps) => (r.stepKm ? r.n * r.stepKm * mid(r.pace) : r.n * r.stepMin * 60) + (r.n - 1) * r.recS;
  return t + set(d.reps) + (d.reps2 ? d.reps2.recS + set(d.reps2) : 0);
}

export function buildPlan(s: Settings, m: Model, cal: Calendar): Plan {
  const p = m.paces;
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
    const taper = raceWeek || preTaper || finalTest;
    const bakken = s.runMethod === "bakken";
    // Norwegian Method: flat weeks unless lighter weeks are switched on for it.
    const deload = (bakken ? s.bakkenDeloads : s.deloads) && cw.pos === 3 && cw.role === "load" && !finalTest;
    if (w > 0 && !newPeriod && !taper && !deload && !vacation) {
      if (hold) hold = false;
      else level = Math.min(peakKm, level * (1 + MAX_WEEKLY_INCREASE));
    }
    const targetKm = vacation ? level * VACATION_FACTOR
      : raceWeek || finalTest ? level * TAPER_FACTOR
      : preTaper ? level * PRE_TAPER_FACTOR
      : deload ? level * DELOAD_FACTOR : level;
    if (vacation) { hold = true; level *= 0.95; }
    const atPeak = level >= peakKm - 0.05;
    if (atPeak && !deload && !taper && !vacation && peakWeek === null) peakWeek = w + 1;
    const pp = periods[cw.period];
    if (atPeak && !deload && !taper && !vacation && pp.peakWeek === null) pp.peakWeek = w + 1;
    if (!deload && !taper && !vacation) pp.maxKm = Math.max(pp.maxKm, level);
    const fmt: "distance" | "time" = s.repFormat === "mixed" ? (w % 2 === 0 ? "distance" : "time") : s.repFormat;

    const tmpl: DayType[] = (bakken ? s.bakkenTemplate : s.template).slice();
    if (bakken) {
      // Low mileage: only the first double day stays double. Lighter and taper weeks drop one afternoon session.
      const lowKm = toKm(s.lowMileage, s);
      const doubles = tmpl.map((t, i) => (t === "double" ? i : -1)).filter((i) => i >= 0);
      const keepDoubles = level < lowKm || deload || preTaper ? 1 : doubles.length;
      doubles.slice(keepDoubles).forEach((i) => { tmpl[i] = "single"; });
    }
    const notes: (Partial<Pick<Session, "off" | "note" | "title">> | undefined)[] = Array(7).fill(undefined);
    const isQ = (t: DayType) => QUALITY.includes(t as SessionType) || BAKKEN_HARD.includes(t as BakkenSlot);
    let raceCheck = -1, preRace = -1; // Norwegian Method race-week sessions
    if (raceWeek && bakken) {
      // Bakken: 1000s + 300s near 3k pace 4 days out, a standard threshold run 2 days out, the rest easy.
      const first = Math.min(...cw.races.map((r) => r.day));
      for (let i = 0; i < 7; i++) if (tmpl[i] === "longrun" || isQ(tmpl[i])) tmpl[i] = "easy";
      if (first - 4 >= 0) { raceCheck = first - 4; tmpl[raceCheck] = "x"; }
      if (first - 2 >= 0) { preRace = first - 2; tmpl[preRace] = "single"; }
    }
    if (raceWeek) {
      // Race days, then: no long run, no quality within 2 days of a race or after it, at most one sharpener.
      const raceDays = cw.races.map((r) => r.day);
      const first = Math.min(...raceDays);
      let kept = false;
      for (let i = 0; i < 7; i++) {
        if (tmpl[i] === "longrun") tmpl[i] = "easy";
        if (isQ(tmpl[i])) {
          if (bakken) { if (i !== raceCheck && i !== preRace) tmpl[i] = "easy"; }
          else if (!kept && first - i >= 3 && tmpl[i] !== "x") { kept = true; if (tmpl[i] === "double") tmpl[i] = "single"; }
          else tmpl[i] = "easy";
        }
      }
      for (const { day, race } of cw.races) {
        if (race.kind === "run") { tmpl[day] = "race"; notes[day] = { title: race.name || "Race" }; }
        else { tmpl[day] = "rest"; notes[day] = { off: "hyrox", note: race.name || "HYROX race", title: "HYROX race" }; }
        if (day + 1 < 7 && !raceDays.includes(day + 1)) { tmpl[day + 1] = "rest"; notes[day + 1] = { note: "Recovery after the race" }; }
      }
    } else if (finalTest) {
      // Last week with no race: the last quality session becomes a time trial.
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
    const share = Number(s.subtShare) || 25;
    const budget = (targetKm * share) / 100;
    const counts: Partial<Record<keyof typeof REPS, number>> = {};
    quality.forEach((t) => {
      if (counts[t] != null) return;
      const r = REPS[t];
      const perRepKm = t === "hills" ? r.repKm : fmt === "time" ? (SUBT[t].min * 60) / mid(p[t]) : SUBT[t].distKm;
      counts[t] = Math.min(r.max, Math.max(r.min, Math.round(((budget * r.weight) / totalWeight) / perRepKm)));
    });

    // Bakken: threshold work is the threshold share of the week, split over the sessions (25–40 min of reps each).
    const bk = bakken ? bakkenSessions(tmpl, targetKm, s, p, w, cw.blockInPeriod, raceWeek || preTaper || finalTest, deload || preTaper) : null;

    const days: Session[] = tmpl.map((type, di): Session => {
      if (bk && di === raceCheck && type === "x") return bk.raceCheck();
      if (bk && di === preRace && type === "single") return bk.preRace();
      if (bk && (type === "double" || type === "single" || type === "x")) return bk.day(type);
      if (type === "rest") return { type, title: notes[di]?.title || (notes[di]?.off === "vacation" ? "Vacation" : "Rest"), km: 0, sec: 0, off: notes[di]?.off, note: notes[di]?.note };
      if (type === "easy") return { type, title: "Easy", km: 0, sec: 0, note: notes[di]?.note };
      if (type === "longrun") return { type, title: "Long run", km: 0, sec: 0 };
      if (type === "race") {
        const r = m.races[raceKey];
        const label = raceKey === "10k" ? "10k" : "5k";
        return {
          type, title: notes[di]?.title || `${label} time trial`,
          km: raceKm + 5, sec: 0, wu: 3, cd: 2, raceKm, racePace: r.pace, raceTime: r.time, raceLabel: label,
        };
      }
      if (type === "hills") {
        const n = counts.hills ?? REPS.hills.min;
        return {
          type, title: "400s / hills", sec: 0, wu, cd,
          km: wu + n * 0.4 + (n - 1) * 0.08 + cd, repKm: n * 0.4, minReps: Math.min(n, FLOOR.hills),
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
        type, title: sub.name, sec: 0, wu, cd, repKm, minReps: Math.min(n, FLOOR[type]),
        km: wu + repKm + recKm + cd,
        reps: { n, stepKm: fmt === "time" ? null : sub.distKm, stepMin: sub.min, recS: sub.recS, pace: pc, recLabel: "Jog" },
      };
    });

    fitShare(days, budget, `${share}% of the week`, bakken ? "threshold" : "sub-T");

    const firstEasy = days.find((d) => d.type === "easy");
    if (firstEasy) { firstEasy.title = "Easy + strides"; firstEasy.strides = true; }
    const longRun = days.find((d) => d.type === "longrun");
    if (longRun) longRun.km = Math.min(Math.max(targetKm * 0.22, 8), bakken ? BAKKEN_LONG_RUN_MAX_KM : 32);

    const fixedKm = days.reduce((a, d) => a + dayKm(d), 0);
    const easyDays = days.filter((d) => d.type === "easy");
    let easyEach = easyDays.length ? (targetKm - fixedKm) / easyDays.length : 0;
    const tooLow = easyDays.length > 0 && easyEach < MIN_EASY_KM;
    easyEach = Math.max(easyEach, easyDays.length ? MIN_EASY_KM : 0);
    easyDays.forEach((d) => { d.km = easyEach; });
    days.forEach((d) => { d.sec = sessionSeconds(d, p); if (d.pm) d.pm.sec = sessionSeconds(d.pm, p); });

    const weekStart = cw.start;
    const phase: Phase = vacation ? "Vacation" : raceWeek ? "Race week" : finalTest ? "Time trial" : preTaper ? "Taper" : `Block ${cw.blockInPeriod + 1}`;
    weeks.push({
      n: w + 1, phase, phaseKey: raceWeek || finalTest ? "trial" : cw.phase, deload, taper, atPeak, fmt, days, weekStart, targetKm,
      peakKm, method: bakken ? "bakken" : "singles", period: cw.period, block: cw.block, pos: cw.pos, vacation, raceNames: cw.races.map((r) => r.race.name || "Race"),
      totalKm: days.reduce((a, d) => a + dayKm(d), 0),
      totalSec: days.reduce((a, d) => a + d.sec + (d.pm?.sec || 0), 0),
      subtKm: days.reduce((a, d) => a + (d.repKm || 0) + (d.pm?.repKm || 0), 0),
      tooLow,
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

/* ---------- Keeping threshold work within the share ---------- */

const repTotal = (days: Session[]) => days.reduce((a, d) => a + (d.repKm || 0) + (d.pm?.repKm || 0), 0);
const repStepKm = (d: Session) => d.reps!.stepKm ?? (d.reps!.stepMin * 60) / mid(d.reps!.pace);
const recStepKm = (d: Session) => (d.type === "hills" ? 0.08 : d.reps!.recS / 420); // slow jog ≈ 7:00/km

/** One rep more or fewer: its distance and one recovery jog. */
function changeReps(d: Session, by: 1 | -1) {
  const r = d.reps!;
  const km = (repStepKm(d) + recStepKm(d)) * by;
  d.reps = { ...r, n: r.n + by };
  d.repKm = (d.repKm || 0) + repStepKm(d) * by;
  d.km += km;
}

/**
 * Keeps the week's rep distance within its share of the volume.
 * Trims reps (largest session first) down to each session's floor; if that's not enough, a
 * double threshold day becomes a single session, then the session that frees the most becomes
 * an easy run. Sessions that were trimmed get reps back if a dropped session left room.
 */
function fitShare(days: Session[], budget: number, shareText: string, kind: string) {
  const over = () => repTotal(days) > budget + 1e-6;
  if (!over()) return;
  const sessions = () => days.flatMap((d) => (d.pm ? [d, d.pm] : [d])).filter((x) => x.reps && x.minReps != null);
  const start = new Map(sessions().map((x) => [x, x.reps!.n]));
  let dropped = false;
  for (let guard = 0; over() && guard < 500; guard++) {
    const trim = sessions().filter((x) => x.reps!.n > x.minReps!);
    if (trim.length) { changeReps(trim.reduce((a, b) => ((b.repKm || 0) > (a.repKm || 0) ? b : a)), -1); continue; }
    let i = -1;
    days.forEach((d, j) => { if (d.pm) i = j; });
    if (i >= 0) {
      Object.assign(days[i], { pm: undefined, type: "single", title: "Threshold", note: `Single session, to keep ${kind} within ${shareText}` });
      dropped = true;
      continue;
    }
    // Drop the session that frees the most (its floor), the later one on a tie.
    const floorKm = (d: Session) => (d.reps && d.minReps != null ? d.minReps * repStepKm(d) : d.repKm || 0);
    days.forEach((d, j) => { if ((d.repKm || 0) > 0 && (i < 0 || floorKm(d) >= floorKm(days[i]))) i = j; });
    if (i < 0) break;
    days[i] = { type: "easy", title: "Easy", km: 0, sec: 0, note: `Easy instead of ${kind}, to keep it within ${shareText}` };
    dropped = true;
  }
  if (!dropped) return;
  // Give reps back to the sessions that are left, the most-trimmed first, while they still fit.
  for (let guard = 0; guard < 500; guard++) {
    const grow = sessions().filter((x) => x.reps!.n < (start.get(x) ?? x.reps!.n) && repTotal(days) + repStepKm(x) <= budget + 1e-6);
    if (!grow.length) break;
    changeReps(grow.reduce((a, b) => (b.reps!.n / start.get(b)! < a.reps!.n / start.get(a)! ? b : a)), 1);
  }
}

/** A day's distance including a double day's afternoon session. */
export const dayKm = (d: Session) => d.km + (d.pm?.km || 0);
export const daySec = (d: Session) => d.sec + (d.pm?.sec || 0);

/* ---------- Norwegian Method (Marius Bakken): double threshold days and an X session ---------- */
// Rules and sources: research/norwegian-method-bakken.md.

type Fmt = { lo: number; hi: number; rec: number } & ({ km: number } | { sec: number });
// Morning: long reps, 6–10 min or 2000–3000 m, floating just under threshold.
const AM_FORMATS: Fmt[] = [
  { sec: 360, rec: 60, lo: 3, hi: 8 },
  { km: 2, rec: 60, lo: 3, hi: 8 },
  { sec: 600, rec: 60, lo: 3, hi: 5 },
  { km: 3, rec: 90, lo: 3, hi: 5 },
  { sec: 480, rec: 60, lo: 3, hi: 6 },
];
// Evening: short reps, 400–1000 m, 1 min or 45/15, at threshold. Never longer than 1 km.
const PM_FORMATS: Fmt[] = [
  { km: 1, rec: 60, lo: 6, hi: 12 },
  { km: 0.4, rec: 30, lo: 15, hi: 25 },
  { sec: 60, rec: 30, lo: 10, hi: 20 },
  { sec: 45, rec: 15, lo: 15, hi: 25 },
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
  const jogKm = (reps: number, recS: number) => ((reps - 1) * recS) / 420; // slow jog ≈ 7:00/km

  const thresholdSession = (f: Fmt, pace: Range, title: string, fixedReps?: number): Session => {
    const workSec = workMin(pace) * 60;
    const reps = fixedReps ?? clamp("km" in f ? workSec / mid(pace) / f.km : workSec / f.sec, f.lo, f.hi);
    const repKm = "km" in f ? reps * f.km : (reps * f.sec) / mid(pace);
    const repSec = "km" in f ? f.km * mid(pace) : f.sec;
    const minReps = fixedReps ?? Math.min(reps, Math.max(2, Math.ceil(600 / repSec))); // about 10 min, and always intervals
    return { type: "single", title, sec: 0, wu, cd, repKm, minReps, km: wu + repKm + jogKm(reps, f.rec) + cd,
      reps: "km" in f
        ? { n: reps, stepKm: f.km, stepMin: 0, recS: f.rec, pace, recLabel: "Jog" }
        : { n: reps, stepKm: null, stepMin: f.sec / 60, recS: f.rec, pace, recLabel: "Jog" } };
  };
  const am = (title: string) => thresholdSession(AM_FORMATS[(w + k * 2) % AM_FORMATS.length], amPace, title);
  const pm = () => thresholdSession(PM_FORMATS[(w + k * 2 + 1) % PM_FORMATS.length], pmPace, "PM threshold");

  const x = (): Session => {
    const hp = p.hills;
    // Fewer reps on lighter weeks and at lower volume (full session from about 80 km a week).
    const scale = (light ? 0.7 : 1) * Math.min(1, Math.max(0.5, targetKm / 80));
    // Base blocks: short hill reps. The block before a race and the weeks around races: faster flat reps.
    const hills = blockInPeriod < 2 && !nearRace;
    const kind = hills ? "hills" : (["200s", "300s", "400s"] as const)[w % 3];
    const wuX = 3, cdX = 2;
    if (kind === "hills") {
      const reps = clamp(20 * scale, 8, 20), repSec = 0.2 * mid(hp) * 1.15;
      return { type: "x", title: "X session · hills", sec: 0, wu: wuX, cd: cdX, km: wuX + reps * 0.4 + cdX,
        mainText: `${reps} × 200 m uphill, strong and relaxed (flat-ground effort ${rangeOfPace(hp, s)}), jog down recovery`,
        reps: { n: reps, stepKm: 0.2, stepMin: 0, recS: Math.round(repSec * 2), pace: hp, recLabel: "Jog" } };
    }
    if (kind === "200s") {
      // Bakken's Saturday X: 10 × 200 m, fast but relaxed.
      const reps = clamp(10 * scale, 6, 10);
      return { type: "x", title: "X session · 200s", sec: 0, wu: wuX, cd: cdX, km: wuX + reps * 0.2 + jogKm(reps, 90) + cdX,
        reps: { n: reps, stepKm: 0.2, stepMin: 0, recS: 90, pace: p.speed, recLabel: "Jog" } };
    }
    // Flat reps above threshold (about 5–8 mmol): 3k to 5k pace.
    const km = kind === "300s" ? 0.3 : 0.4;
    const rec = kind === "300s" ? 90 : 120;
    const reps = clamp((kind === "300s" ? 10 : 8) * scale, 5, 10);
    return { type: "x", title: `X session · ${km * 1000}s`, sec: 0, wu: wuX, cd: cdX, km: wuX + reps * km + jogKm(reps, rec) + cdX,
      reps: { n: reps, stepKm: km, stepMin: 0, recS: rec, pace: p.fast, recLabel: "Jog" } };
  };

  /** Race week, 4 days out: 1000s then 300s near 3k pace. A check of shape, not a hard session. */
  const raceCheck = (): Session => {
    const n1 = 4, n2 = 4, wuX = 3, cdX = 2;
    const reps: Reps = { n: n1, stepKm: 1, stepMin: 0, recS: 90, pace: p.fast, recLabel: "Jog" };
    const reps2: Reps = { n: n2, stepKm: 0.3, stepMin: 0, recS: 60, pace: p.fast, recLabel: "Jog" };
    const repKm = n1 + n2 * 0.3;
    return { type: "x", title: "Race check · 1000s + 300s", sec: 0, wu: wuX, cd: cdX, reps, reps2,
      km: wuX + repKm + jogKm(n1, 90) + jogKm(n2, 60) + 90 / 420 + cdX,
      mainText: `${n1} × 1000 m, 90s jog, then ${n2} × 300 m, 60s jog, all @ ${rangeOfPace(p.fast, s)}. Controlled: if it feels harder than it should at this pace, stop early.` };
  };
  /** Race week, 2 days out: a short, standard threshold run. */
  const preRace = (): Session => thresholdSession({ km: 2, rec: 60, lo: 3, hi: 3 }, amPace, "Pre-race threshold", 3);

  const day = (type: DayType): Session => {
    if (type === "x") return x();
    if (type === "single") { const one = { ...am("Threshold"), type: "single" as const }; k++; return one; }
    const morning = am("AM threshold");
    const afternoon = pm();
    k++;
    return { ...morning, type: "double", title: "Double threshold", pm: afternoon };
  };
  return { day, raceCheck, preRace };
}

const rangeOfPace = (r: Range, s: Settings) => {
  const f = (x: number) => { const v = Math.round(s.units === "mi" ? x * KM_PER_MI : x); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
  return `${f(r.lo)}–${f(r.hi)}/${s.units === "mi" ? "mi" : "km"}`;
};
