import { KM_PER_MI, mid, nextMonday, parseDate, type Range } from "./format";
import type { Model, Paces } from "./vdot";
import { QUALITY, type Settings, type SessionType } from "./settings";

export const MAX_WEEKLY_INCREASE = 0.05;
export const DELOAD_WEEKS = [3, 7]; // zero-based: weeks 4 and 8
export const DELOAD_FACTOR = 0.8;
export const TAPER_FACTOR = 0.65;
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

export type Phase = "Base" | "Build" | "Peak" | "Taper + race" | "Time trial";
export type PhaseKey = "base" | "build" | "peak" | "trial";
export type DayType = SessionType | "race";

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
}

export interface Plan {
  weeks: Week[];
  startKm: number;
  peakKm: number;
  peakWeek: number | null; // 1-based week the peak is first reached
}

const toKm = (v: number, s: Settings) => (s.units === "mi" ? Number(v) * KM_PER_MI : Number(v));

function phaseFor(w: number, s: Settings): Phase {
  if (w < 4) return "Base";
  if (w < 8) return "Build";
  if (w < 11) return "Peak";
  if (s.finalWeek === "race") return "Taper + race";
  if (s.finalWeek === "test") return "Time trial";
  return "Peak";
}

function phaseKeyFor(w: number, s: Settings): PhaseKey {
  if (w < 4) return "base";
  if (w < 8) return "build";
  if (w === 11 && s.finalWeek !== "normal") return "trial";
  return "peak";
}

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

export function buildPlan(s: Settings, m: Model): Plan {
  const p = m.paces;
  const startKm = Math.max(toKm(s.startVolume, s) || 0, 10);
  const peakKm = Math.max(toKm(s.peakVolume, s) || 0, startKm);
  const wu = Math.max(0, Number(s.subtWarmupKm) || 0);
  const cd = Math.max(0, Number(s.subtCooldownKm) || 0);
  const start = parseDate(s.startDate) || parseDate(nextMonday())!;
  const raceKey = s.pbDistance === "10000" ? "10k" : "5k";
  const raceKm = Number(s.pbDistance) / 1000;
  const weeks: Week[] = [];
  let level = startKm;
  let peakWeek: number | null = null;

  for (let w = 0; w < 12; w++) {
    const taper = w === 11 && s.finalWeek !== "normal";
    const deload = s.deloads && DELOAD_WEEKS.includes(w);
    if (w > 0 && !taper && !deload) level = Math.min(peakKm, level * (1 + MAX_WEEKLY_INCREASE));
    const targetKm = taper ? level * TAPER_FACTOR : deload ? level * DELOAD_FACTOR : level;
    const atPeak = level >= peakKm - 0.05;
    if (atPeak && !deload && !taper && peakWeek === null) peakWeek = w + 1;
    const fmt: "distance" | "time" = s.repFormat === "mixed" ? (w % 2 === 0 ? "distance" : "time") : s.repFormat;

    // Final week: the last quality session becomes the race or time trial.
    const tmpl: DayType[] = s.template.slice();
    if (taper) {
      let last = -1;
      tmpl.forEach((t, i) => { if (QUALITY.includes(t as SessionType)) last = i; });
      if (last === -1) last = 5;
      tmpl[last] = "race";
      for (let i = last + 1; i < 7; i++) {
        if (tmpl[i] === "longrun" || QUALITY.includes(tmpl[i] as SessionType)) tmpl[i] = "easy";
      }
    }

    // Rep counts from the sub-T share of the week's volume, split by weight and clamped.
    const quality = s.template.filter((t) => QUALITY.includes(t)) as (keyof typeof REPS)[];
    const totalWeight = quality.reduce((a, t) => a + REPS[t].weight, 0);
    const budget = (targetKm * (Number(s.subtShare) || 25)) / 100;
    const counts: Partial<Record<keyof typeof REPS, number>> = {};
    quality.forEach((t) => {
      if (counts[t] != null) return;
      const r = REPS[t];
      const perRepKm = t === "hills" ? r.repKm : fmt === "time" ? (SUBT[t].min * 60) / mid(p[t]) : SUBT[t].distKm;
      counts[t] = Math.min(r.max, Math.max(r.min, Math.round(((budget * r.weight) / totalWeight) / perRepKm)));
    });

    const days: Session[] = tmpl.map((type): Session => {
      if (type === "rest") return { type, title: "Rest", km: 0, sec: 0 };
      if (type === "easy") return { type, title: "Easy", km: 0, sec: 0 };
      if (type === "longrun") return { type, title: "Long run", km: 0, sec: 0 };
      if (type === "race") {
        const r = m.races[raceKey];
        const label = raceKey === "10k" ? "10k" : "5k";
        return {
          type, title: s.finalWeek === "race" ? `${label} race` : `${label} time trial`,
          km: raceKm + 5, sec: 0, wu: 3, cd: 2, raceKm, racePace: r.pace, raceTime: r.time, raceLabel: label,
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

    const fixedKm = days.reduce((a, d) => a + d.km, 0);
    const easyDays = days.filter((d) => d.type === "easy");
    let easyEach = easyDays.length ? (targetKm - fixedKm) / easyDays.length : 0;
    const tooLow = easyDays.length > 0 && easyEach < MIN_EASY_KM;
    easyEach = Math.max(easyEach, easyDays.length ? MIN_EASY_KM : 0);
    easyDays.forEach((d) => { d.km = easyEach; });
    days.forEach((d) => { d.sec = sessionSeconds(d, p); });

    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + 7 * w);
    weeks.push({
      n: w + 1, phase: phaseFor(w, s), phaseKey: phaseKeyFor(w, s), deload, taper, atPeak, fmt, days, weekStart, targetKm,
      totalKm: days.reduce((a, d) => a + d.km, 0),
      totalSec: days.reduce((a, d) => a + d.sec, 0),
      subtKm: days.reduce((a, d) => a + (d.repKm || 0), 0),
      tooLow,
    });
  }
  return { weeks, startKm, peakKm, peakWeek };
}

export const dayDate = (wk: Week, i: number) => {
  const d = new Date(wk.weekStart);
  d.setDate(d.getDate() + i);
  return d;
};

/** Change vs the last full week (lighter and taper weeks skipped), as whole %. */
export function changeVsLastFull(weeks: Week[], i: number): number | null {
  const full = (w: Week) => !w.deload && !w.taper;
  if (!full(weeks[i])) return null;
  for (let j = i - 1; j >= 0; j--) {
    if (full(weeks[j])) return Math.round((weeks[i].targetKm / weeks[j].targetKm - 1) * 100);
  }
  return null;
}
