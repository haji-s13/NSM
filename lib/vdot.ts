import { parseTime, type Range } from "./format";

// Daniels & Gilbert (1979): the equations behind the VDOT tables.
// v = velocity in metres/min, t = race duration in minutes.
const vo2AtVelocity = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
const fractionSustainable = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

export function vdotFromRace(metres: number, seconds: number): number {
  const t = seconds / 60;
  return vo2AtVelocity(metres / t) / fractionSustainable(t);
}

/** Predicted race time (seconds) for a distance at a given VDOT. */
export function raceTimeForVdot(vdot: number, metres: number): number {
  let lo = metres / 600, hi = metres / 50;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (vdotFromRace(metres, m * 60) > vdot) lo = m; else hi = m;
  }
  return ((lo + hi) / 2) * 60;
}

/** Seconds per km at a given fraction of VDOT. */
export function paceAtPercent(vdot: number, pct: number): number {
  const a = 0.000104, b = 0.182258, c = -4.6 - vdot * pct;
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return 60000 / v;
}

export const RACES = [
  { key: "5k", label: "5k", m: 5000 },
  { key: "10k", label: "10k", m: 10000 },
  { key: "15k", label: "15k", m: 15000 },
  { key: "hm", label: "Half marathon", m: 21097.5 },
  { key: "25k", label: "25k", m: 25000 },
  { key: "30k", label: "30k", m: 30000 },
  { key: "m", label: "Marathon", m: 42195 },
] as const;

export type RaceKey = (typeof RACES)[number]["key"];
export interface RaceResult { key: RaceKey; label: string; m: number; time: number; pace: number; isPB: boolean }

export interface Paces {
  easy: Range; marathon: Range; threshold: Range;
  short: Range; medium: Range; long: Range; hills: Range;
  /** 3k to 5k pace: Norwegian Method X reps (about 5–8 mmol) and race-week checks. */
  fast: Range;
  /** Mile to 1500 m pace: short, fast X reps (200s). */
  speed: Range;
}

export interface Model {
  vdot: number; pbSec: number; pbM: number;
  races: Record<RaceKey, RaceResult>;
  paces: Paces;
}

/** Predictions and pace ranges from a PB, or null when the PB is invalid. */
export function buildModel(pbDistance: string, pbTime: string, paceAdjust: number): Model | null {
  const pbSec = parseTime(pbTime);
  const pbM = Number(pbDistance);
  if (!isFinite(pbSec) || pbSec <= 0) return null;
  const p = pbSec / (pbM / 1000);
  if (p < 150 || p > 600) return null; // 2:30–10:00 per km

  const vdot = vdotFromRace(pbM, pbSec);
  const races = {} as Record<RaceKey, RaceResult>;
  RACES.forEach((r) => {
    const time = r.m === pbM ? pbSec : raceTimeForVdot(vdot, r.m);
    races[r.key] = { ...r, time, pace: time / (r.m / 1000), isPB: r.m === pbM };
  });
  const adj = Number(paceAdjust) || 0;
  const band = (fast: number, slow: number, a = 0): Range => ({ lo: fast + a, hi: slow + a });
  const rp = (k: RaceKey) => races[k].pace;
  const at = (m: number) => raceTimeForVdot(vdot, m) / (m / 1000);
  return {
    vdot, pbSec, pbM, races,
    paces: {
      easy: band(paceAtPercent(vdot, 0.74), paceAtPercent(vdot, 0.62)),
      marathon: band(rp("m") - 3, rp("m") + 3),
      threshold: band(paceAtPercent(vdot, 0.88), paceAtPercent(vdot, 0.83)),
      short: band(rp("15k"), rp("hm"), adj),
      medium: band(rp("hm"), rp("25k"), adj),
      long: band(rp("25k"), rp("30k"), adj),
      hills: band(rp("10k"), rp("15k")),
      fast: band(at(3000), rp("5k")),
      speed: band(at(1500), at(1609.344)),
    },
  };
}
