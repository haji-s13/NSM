import { isoDate, nextMonday, parseDate } from "./format";

/* HYROX station program (no running: that lives in the run plan).
 * Built from the coach's year of programming: strength first, then station build,
 * then race-specific work, with lighter "absorb" weeks and the Saturday race-week taper. */

export type Station = "ski" | "push" | "pull" | "bbj" | "row" | "farmers" | "lunges" | "wb";
export type Division = "open-w" | "open-m" | "pro-w" | "pro-m";
export type HxSlot = "off" | "aerobic" | "lower" | "upper" | "quality";
export type HxDayType = HxSlot | "test" | "race" | "rest";
export type WeightUnit = "kg" | "lb";

/** Race order, race distance and the unit we count volume in. */
export const STATIONS: { key: Station; label: string; short: string; race: number; unit: "m" | "reps" }[] = [
  { key: "ski", label: "SkiErg", short: "Ski", race: 1000, unit: "m" },
  { key: "push", label: "Sled push", short: "Push", race: 50, unit: "m" },
  { key: "pull", label: "Sled pull", short: "Pull", race: 50, unit: "m" },
  { key: "bbj", label: "Burpee broad jumps", short: "BBJ", race: 80, unit: "m" },
  { key: "row", label: "Row", short: "Row", race: 1000, unit: "m" },
  { key: "farmers", label: "Farmers carry", short: "Farmers", race: 200, unit: "m" },
  { key: "lunges", label: "Sandbag lunges", short: "Lunges", race: 100, unit: "m" },
  { key: "wb", label: "Wall balls", short: "WB", race: 100, unit: "reps" },
];
export const STATION = Object.fromEntries(STATIONS.map((s) => [s.key, s])) as Record<Station, (typeof STATIONS)[number]>;

/** Race weights in kg (sleds include the sled). Doubles and relay use the same weights as their division. */
export const DIVISIONS: Record<Division, { label: string; push: number; pull: number; farmers: number; lunges: number; wb: number; target: string }> = {
  "open-w": { label: "Open women", push: 102, pull: 78, farmers: 16, lunges: 10, wb: 4, target: "2.7 m" },
  "open-m": { label: "Open men", push: 152, pull: 103, farmers: 24, lunges: 20, wb: 6, target: "3 m" },
  "pro-w": { label: "Pro women", push: 152, pull: 103, farmers: 24, lunges: 20, wb: 6, target: "2.7 m" },
  "pro-m": { label: "Pro men", push: 202, pull: 153, farmers: 32, lunges: 30, wb: 9, target: "3 m" },
};

export const SLOT_LABELS: Record<HxSlot, string> = {
  off: "No station session",
  aerobic: "Aerobic stations",
  lower: "Lower + lunges + WB",
  upper: "Upper + sled",
  quality: "HYROX Quality",
};

export interface HyroxSettings {
  division: Division;
  weightUnit: WeightUnit;
  strength: "maintain" | "build";     // in-season maintenance cycle or off-season strength waves
  weaknesses: Station[];
  emphasis: "moderate" | "high";       // +25% or +50% on weak stations
  template: HxSlot[];
  deloads: boolean;                    // absorb weeks 4 and 8
  benchmarks: boolean;                 // tests in week 1, repeated in week 11
  finalWeek: "race" | "test" | "normal";
  raceDay: number;                     // 0 = Mon … 6 = Sun
  runLegs: boolean;                    // short compromised runs inside HYROX Quality, or BikeErg instead
}

export function defaultHyrox(): HyroxSettings {
  return {
    division: "pro-m",
    weightUnit: "kg",
    strength: "maintain",
    weaknesses: ["wb", "lunges", "push"],
    emphasis: "moderate",
    template: ["aerobic", "lower", "off", "upper", "off", "quality", "off"],
    deloads: true,
    benchmarks: true,
    finalWeek: "race",
    raceDay: 5,
    runLegs: false,
  };
}

export function normalizeHyrox(raw: unknown): HyroxSettings {
  const d = defaultHyrox();
  const h = { ...d, ...(raw && typeof raw === "object" ? raw : {}) } as HyroxSettings;
  if (!Array.isArray(h.template) || h.template.length !== 7) h.template = d.template.slice();
  if (!Array.isArray(h.weaknesses)) h.weaknesses = d.weaknesses.slice();
  h.weaknesses = h.weaknesses.filter((w) => w in STATION);
  if (!(h.division in DIVISIONS)) h.division = d.division;
  h.raceDay = Math.min(6, Math.max(0, Math.round(Number(h.raceDay) || 0)));
  return h;
}

export const WEAK_FACTOR = { moderate: 1.25, high: 1.5 } as const;

/* ---------- Plan shapes ---------- */

export interface HxBlock { label: string; text: string; min: number; weak?: Station }
export interface HxDay {
  type: HxDayType;
  title: string;
  blocks: HxBlock[];
  min: number;
  vol: Partial<Record<Station, number>>;
}
export type HxKind = "bench" | "strength" | "absorb" | "build" | "peak" | "sharpen" | "race" | "test";
export interface HxWeek {
  n: number;
  phase: string;
  phaseKey: "base" | "build" | "peak" | "trial";
  kind: HxKind;
  light: boolean;
  step: number;
  days: HxDay[];
  weekStart: Date;
  totalMin: number;
  sessions: number;
  vol: Partial<Record<Station, number>>;
}
export interface HxPlan { weeks: HxWeek[]; vol: Partial<Record<Station, number>>; totalMin: number }

export const hxDayDate = (wk: HxWeek, i: number) => {
  const d = new Date(wk.weekStart);
  d.setDate(d.getDate() + i);
  return d;
};

/* ---------- Periodisation ---------- */

interface WeekSpec { phase: string; phaseKey: HxWeek["phaseKey"]; kind: HxKind; light: boolean; step: number; vol: number }

function weekSpec(w: number, h: HyroxSettings): WeekSpec {
  if (w === 0 && h.benchmarks) return { phase: "Benchmark", phaseKey: "base", kind: "bench", light: false, step: 0, vol: 0.8 };
  if (w <= 2) return { phase: "Strength", phaseKey: "base", kind: "strength", light: false, step: w, vol: [0.9, 1, 1.1][w] };
  if (w === 3) return h.deloads
    ? { phase: "Absorb", phaseKey: "base", kind: "absorb", light: true, step: 0, vol: 0.65 }
    : { phase: "Strength", phaseKey: "base", kind: "strength", light: false, step: 2, vol: 1.1 };
  if (w <= 6) return { phase: "Station build", phaseKey: "build", kind: "build", light: false, step: w - 4, vol: [1, 1.1, 1.2][w - 4] };
  if (w === 7) return h.deloads
    ? { phase: "Absorb", phaseKey: "build", kind: "absorb", light: true, step: 0, vol: 0.65 }
    : { phase: "Station build", phaseKey: "build", kind: "build", light: false, step: 2, vol: 1.2 };
  if (w <= 9) return { phase: "Race specific", phaseKey: "peak", kind: "peak", light: false, step: w - 8, vol: [1.15, 1.25][w - 8] };
  if (w === 10) return { phase: "Sharpen", phaseKey: "peak", kind: "sharpen", light: false, step: 2, vol: 0.85 };
  if (h.finalWeek === "race") return { phase: "Race week", phaseKey: "trial", kind: "race", light: true, step: 0, vol: 0.5 };
  if (h.finalWeek === "test") return { phase: "Benchmark", phaseKey: "trial", kind: "test", light: true, step: 0, vol: 0.6 };
  return { phase: "Race specific", phaseKey: "peak", kind: "peak", light: false, step: 1, vol: 1.2 };
}

/* ---------- Builders ---------- */

const KG_PER_LB = 0.45359237;

class Ctx {
  vol: Partial<Record<Station, number>> = {};
  constructor(public h: HyroxSettings, public spec: WeekSpec) {}
  get div() { return DIVISIONS[this.h.division]; }
  isWeak(st?: Station) { return !!st && this.h.weaknesses.includes(st); }
  /** Rounds or sets scaled by the week's volume and, for weak stations, the weakness factor. */
  n(base: number, st?: Station, min = 1) {
    const f = this.spec.vol * (this.isWeak(st) ? WEAK_FACTOR[this.h.emphasis] : 1);
    return Math.max(min, Math.round(base * f));
  }
  add(st: Station, amount: number) { this.vol[st] = (this.vol[st] || 0) + amount; }
  /** A weight in the chosen unit; pounds round to 5. */
  w(kg: number) {
    if (this.h.weightUnit === "lb") return `${Math.round(kg / KG_PER_LB / 5) * 5} lb`;
    return `${Number.isInteger(kg) ? kg : Math.round(kg / 2.5) * 2.5} kg`;
  }
  /** "+5 kg" / "+10 lb". */
  inc(kg: number) { return this.h.weightUnit === "lb" ? `${Math.round(kg / KG_PER_LB / 5) * 5} lb` : `${kg} kg`; }
  /** A run leg, or the BikeErg equivalent when run legs are off. */
  leg(m: number, effort: string) {
    if (this.h.runLegs) return `${m >= 1000 ? `${m / 1000} km` : `${m} m`} run @ ${effort}`;
    const min = Math.max(1, Math.round((m / 1000) * 4 * 2) / 2);
    return `${min} min BikeErg @ ${effort}`;
  }
}

const WARMUP: HxBlock = { label: "Warm-up", text: "10 min easy bike + mobility", min: 10 };

/** Squat, bench and deadlift prescriptions: maintenance cycle in season, strength waves off season. */
function lift(c: Ctx, lift: string): string {
  const { kind, step } = c.spec;
  const waves = ["65/75/85% × 5, 5, 5+", "70/80/90% × 3, 3, 3+", "75/85/95% × 5, 3, 1+"];
  const maint = ["3 × 15 @ 45–65%", "4 × 10 @ 50–70%", "5 × 5 @ 60–80%"];
  if (kind === "absorb") return c.h.strength === "build" ? `${lift} 40/50/60% × 5` : `${lift} 3 × 8 @ 45–65%`;
  if (kind === "sharpen" || kind === "race") return `${lift} 2 × 5 @ 60%, fast`;
  if (kind === "peak") return `${lift} 3 × 5 @ 70–80%, crisp`;
  return `${lift} ${c.h.strength === "build" ? waves[step] : maint[step]}`;
}

/* Extra work for a weak station, by training intent. From the coach's formats. */
function weakBlock(c: Ctx, st: Station): HxBlock | null {
  const { kind, step } = c.spec;
  const d = c.div;
  const intent = kind === "strength" || kind === "absorb" ? "strength" : kind === "build" ? "capacity" : "race";
  const label = `Weak station · ${STATION[st].label}`;
  const light = kind === "absorb";
  let n: number;
  switch (st) {
    case "ski": case "row": {
      const name = st === "ski" ? "SkiErg" : "Row";
      if (intent === "strength") { n = c.n(light ? 3 : 4, st); c.add(st, 500 * n); return { label, weak: st, min: n * 3.5, text: `${n} × 500 m ${name} @ 2k pace + 8 s, 90 s rest` }; }
      if (intent === "capacity") { n = c.n(3, st); c.add(st, 1000 * n); return { label, weak: st, min: n * 6, text: `${n} × 1000 m ${name} @ race pace, 2 min rest` }; }
      n = c.n(3, st); c.add(st, 1000 * n); c.add("wb", 20 * n);
      return { label, weak: st, min: n * 7, text: `${n} × (1000 m ${name} @ race pace + 20 WB @ race weight), 2 min rest` };
    }
    case "push": {
      if (intent === "strength") {
        n = c.n(light ? 4 : 6, st); c.add(st, 12 * n);
        return { label, weak: st, min: n * 2, text: `Sled push E2MOM ${n} × 12 m from ${c.w(d.push)}, adding ${c.inc(5)} a round (finish ${c.w(d.push + 5 * (n - 1))} if form holds)` };
      }
      if (intent === "capacity") { n = c.n(4, st); c.add(st, 25 * n); c.add("ski", 500 * n); return { label, weak: st, min: n * 5, text: `${n} × (500 m ski @ 2k pace + 25 m sled push @ ${c.w(d.push)}), rest 1:1. Break only at 5–6 m.` }; }
      n = c.n(4, st); c.add(st, 25 * n);
      return { label, weak: st, min: n * 2.5, text: `${n} × 25 m @ ${c.w(d.push * 0.65)} (30–40% light), move fast under fatigue` };
    }
    case "pull": {
      if (intent === "strength") { n = c.n(light ? 3 : 4, st); c.add(st, 12.5 * n); return { label, weak: st, min: n * 2.5, text: `${n} × 12.5 m sled pull @ ${c.w(d.pull + 10)}. Big strong pulls, arms and hip drive.` }; }
      if (intent === "capacity") { n = c.n(5, st); c.add(st, 25 * n); return { label, weak: st, min: n * 6, text: `${n} × (4 min easy bike + 2 min sled pulls @ ${c.w(d.pull)})` }; }
      n = c.n(4, st); c.add(st, 25 * n); c.add("row", 250 * n);
      return { label, weak: st, min: n * 3.5, text: `${n} × (250 m row hard + 25 m sled pull @ ${c.w(d.pull)}), 90 s rest` };
    }
    case "bbj": {
      if (intent === "strength") { n = c.n(light ? 6 : 10, st); c.add(st, 10 * n); return { label, weak: st, min: n, text: `EMOM ${n}: 5 burpee broad jumps, longest jump you can repeat` }; }
      if (intent === "capacity") { n = c.n(10, st); c.add(st, 16 * n); return { label, weak: st, min: n, text: `EMOM ${n}: 8 burpee broad jumps (about 16 m)` }; }
      n = c.n(3, st); c.add(st, 40 * n); c.add("row", 500 * n);
      return { label, weak: st, min: n * 5, text: `${n} × (40 m BBJ @ race pace + 500 m row), 2 min rest` };
    }
    case "farmers": {
      if (intent === "strength") { n = c.n(light ? 3 : 4, st); c.add(st, 50 * n); return { label, weak: st, min: n * 2, text: `${n} × 50 m heavy farmers carry @ ${c.w(d.farmers + 8)} per hand, full rest` }; }
      if (intent === "capacity") { n = c.n(4, st); c.add(st, 100 * n); return { label, weak: st, min: n * 6.5, text: `${n} × (5 min bike + 100 m farmers carry @ ${c.w(d.farmers)} per hand)` }; }
      n = c.n(3, st); c.add(st, 100 * n); c.add("row", 500 * n);
      return { label, weak: st, min: n * 4, text: `${n} × (500 m row + 100 m farmers @ ${c.w(d.farmers)} unbroken)` };
    }
    case "lunges": {
      if (intent === "strength") {
        n = c.n(light ? 3 : 4, st); c.add(st, 20 * n);
        return { label, weak: st, min: n * 3, text: `Barbell walking lunges ${n} × 20 m @ ${c.w(d.lunges * 1.5)} (50% over race weight)` };
      }
      if (intent === "capacity") {
        n = Math.min(5, c.n(3 + Math.min(step, 1), st)); c.add(st, 60 * n);
        const loads = [`${c.w(d.lunges - 10)}`, `${c.w(d.lunges - 5)}`, c.w(d.lunges), c.w(d.lunges + 5), c.w(d.lunges + 10)];
        return { label, weak: st, min: n * 4, text: `Lunge Specificity, ${n} rounds: 40 walking lunges ramping ${loads.slice(0, Math.min(n, 5)).join(", ")} + 20 fast bodyweight lunges, rest 1:1` };
      }
      n = c.n(3, st); c.add(st, 30 * n); c.add("wb", 30 * n);
      return { label, weak: st, min: n * 5, text: `Lunges into wall balls: ${n} × (30 m lunges @ ${c.w(d.lunges)} + 30 WB @ ${c.w(d.wb)}), 2 min rest. Transition immediately.` };
    }
    case "wb": {
      const heavy = c.w(d.wb + (d.wb >= 9 ? 3 : 2));
      if (intent === "strength") {
        const sets = Math.min(10, c.n(light ? 6 : [8, 9, 10][step] ?? 8, st)); const reps = light ? 8 : [8, 8, 10][step] ?? 8;
        c.add(st, sets * reps);
        return { label, weak: st, min: sets, text: `Heavy ball EMOM ${sets} × ${reps} with ${heavy} to ${d.target}, best possible form` };
      }
      if (intent === "capacity") {
        const total = Math.round(([150, 175, 200][step] ?? 150) * (c.isWeak("wb") ? WEAK_FACTOR[c.h.emphasis] : 1) / 25) * 25;
        c.add(st, total);
        return { label, weak: st, min: Math.ceil(total / 10 / 2), text: `10 unbroken WB every 30 s to ${total} @ ${c.w(d.wb)}` };
      }
      n = c.n(2, st, 2); c.add(st, 40 * n);
      return { label, weak: st, min: n * 3, text: `Max unbroken WB @ ${c.w(d.wb)}, rest 2 min, ${n} sets. Start conservative and build.` };
    }
  }
}

/** Where each weak station's extra work goes, in order of preference. */
const HOST: Record<Station, HxSlot[]> = {
  lunges: ["lower", "quality", "upper", "aerobic"],
  wb: ["lower", "quality", "upper", "aerobic"],
  push: ["upper", "quality", "lower", "aerobic"],
  pull: ["upper", "quality", "lower", "aerobic"],
  farmers: ["upper", "aerobic", "quality", "lower"],
  ski: ["aerobic", "quality", "upper", "lower"],
  row: ["aerobic", "quality", "upper", "lower"],
  bbj: ["quality", "upper", "lower", "aerobic"],
};

function aerobic(c: Ctx): HxBlock[] {
  const d = c.div;
  const n = c.spec.kind === "absorb" ? 3 : c.spec.kind === "strength" ? 4 : 5;
  c.add("farmers", 100 * n);
  return [{ label: "Main", min: n * 6.5, text: `${n} × (5 min bike @ 60% FTP + 100 m farmers carry @ ${c.w(d.farmers)} per hand)` }];
}

function lower(c: Ctx): HxBlock[] {
  const d = c.div;
  const k = c.spec.kind;
  if (k === "absorb") {
    c.add("push", 20); c.add("lunges", 30); c.add("wb", 30); c.add("pull", 25);
    return [
      { label: "A", min: 15, text: lift(c, "Squat") },
      { label: "B", min: 28, text: `4 rounds: 4 min easy bike + one station @ race weight, rotating 20 m push / 30 m lunges / 30 WB / 25 m pull. Controlled.` },
    ];
  }
  if (k === "sharpen") {
    c.add("lunges", 120); c.add("push", 150); c.add("wb", 150);
    return [
      { label: "A", min: 15, text: `Barbell walking lunges 4 × 30 m: ${c.w(d.lunges + 10)}, ${c.w(d.lunges + 15)}, ${c.w(d.lunges + 20)}, then ${c.w(d.lunges)} fast` },
      { label: "B", min: 30, text: `3 rounds: ${c.leg(800, "easy to moderate")} + 50 m sled push @ race effort + ${c.leg(800, "moderate")} + 50 WB @ race effort` },
    ];
  }
  const lunge = c.n(3, "lunges"), wbSets = c.n(k === "strength" ? 3 : 4, "wb");
  const wbReps = k === "strength" ? 20 : k === "build" ? 20 : 30;
  c.add("lunges", 20 * lunge); c.add("wb", wbSets * wbReps);
  return [
    { label: "A", min: 18, text: lift(c, k === "peak" ? "Squat" : c.h.strength === "build" ? "Box squat" : "Squat") },
    k === "strength"
      ? { label: "B", min: 12, text: `Bulgarian split squats 3 × 8 per leg, then walking lunges ${lunge} × 20 m @ ${c.w(d.lunges)}` }
      : { label: "B", min: 12, text: `Walking lunges ${lunge} × 20 m @ ${c.w(d.lunges)}, rest 1:1. Stay tall, quick turnover.` },
    { label: "C", min: wbSets * 1.5, text: `Wall balls ${wbSets} × ${wbReps} unbroken @ ${c.w(d.wb)}, 45 s rest` },
  ];
}

function upper(c: Ctx): HxBlock[] {
  const d = c.div;
  const k = c.spec.kind;
  if (k === "absorb") {
    c.add("pull", 100);
    return [
      { label: "A", min: 12, text: `E4MOM × 3: bench 8 @ 65% + pull-ups 8` },
      { label: "B", min: 30, text: `Sled pull 5 × (4 min easy bike + 2 min pulls @ ${c.w(d.pull)})` },
    ];
  }
  if (k === "sharpen") {
    c.add("ski", 750); c.add("push", 45); c.add("bbj", 30); c.add("row", 750); c.add("farmers", 150); c.add("lunges", 45);
    return [{ label: "Main", min: 40, text: `E2MOM 1:20 on / 0:40 off × 3: ski, sled push, BBJ, row, farmers carry, lunges, then 5 min easy bike between rounds` }];
  }
  const push = c.n(6, "push"), pull = c.n(4, "pull"), carry = c.n(3, "farmers");
  c.add("push", 12 * push); c.add("pull", 12.5 * pull); c.add("farmers", 50 * carry);
  const pushText = k === "peak"
    ? `Sled push ${push} × 12 m @ ${c.w(d.push)}, break only at 5–6 m`
    : `Sled push E2MOM ${push} × 12 m from ${c.w(d.push)}, adding ${c.inc(5)} a round`;
  return [
    { label: "A", min: 14, text: c.h.strength === "build" && k !== "peak" ? `${lift(c, "Bench")}; ${lift(c, "Deadlift")}` : `E4MOM × 3: bench 8 @ 65–70% + pull-ups 8; deadlift 4 @ 75–80% + DB RDL 10` },
    { label: "B", min: push * 2, text: pushText },
    { label: "C", min: pull * 2 + carry * 1.5, text: `Sled pull ${pull} × 12.5 m @ ${c.w(d.pull + 10)}; farmers carry ${carry} × 50 m @ ${c.w(d.farmers)}` },
  ];
}

function quality(c: Ctx): HxBlock[] {
  const d = c.div;
  const k = c.spec.kind;
  if (k === "absorb") {
    c.add("ski", 1000); c.add("row", 1000); c.add("bbj", 25); c.add("farmers", 50);
    return [{ label: "Main", min: 45, text: `Easy AMRAP 45 min: 1 km ski, 1 km row, 25 burpees, 50 m farmers carry. RPE 4 out of 10.` }];
  }
  if (k === "strength") {
    const r = c.n(3);
    c.add("ski", 250 * 5); c.add("push", 12.5 * 5);
    if (r >= 2) { c.add("bbj", 16 * 5); c.add("row", 250 * 5); }
    if (r >= 3) { c.add("farmers", 50 * 5); c.add("wb", 15 * 5); }
    return [{ label: "Main", min: r * 20, text: `${r} × (${c.leg(2000, "threshold")} + 10 min EMOM alternating). Round 1: 15 cal ski / 12.5 m sled push. Round 2: 8 BBJ / 15 cal row. Round 3: 50 m farmers / 15 WB. Transitions under 30 s.` }];
  }
  if (k === "build") {
    const r = c.n(4);
    c.add("row", 400 * r); c.add("farmers", 100 * r); c.add("lunges", 20 * r); c.add("pull", 12 * r); c.add("ski", 400 * r); c.add("wb", 20 * r);
    return [
      { label: "A", min: r * 5, text: `${r} × (400 m row, 100 m farmers @ ${c.w(d.farmers)}, 20 m lunges @ ${c.w(d.lunges + 5)}, 12 m sled pull from ${c.w(d.pull)} adding ${c.inc(5)} a round)` },
      { label: "B", min: r * 4, text: `${r} × (20 cal bike, 400 m ski, 20 WB)` },
    ];
  }
  if (k === "sharpen" && c.h.benchmarks) {
    c.add("ski", 2000); c.add("push", 100); c.add("pull", 100); c.add("lunges", 100); c.add("wb", 100);
    return [
      { label: "A", min: 25, text: `2 × (${c.leg(1000, "race pace")} + 1 km ski + 50 m sled push + 50 m sled pull)` },
      { label: "Benchmark", min: 15, text: `Repeat week 1: ${c.leg(1000, "race effort")}, then 100 m lunges @ ${c.w(d.lunges)} for time, then 100 WB for time. Compare times and breaks.` },
    ];
  }
  const r = c.n(3);
  c.add("ski", 2000); c.add("push", 100); c.add("pull", 100); c.add("lunges", 30 * r); c.add("wb", 30 * r);
  return [
    { label: "A", min: 25, text: `2 × (${c.leg(1000, "race pace")} + 1 km ski + 50 m sled push + 50 m sled pull)` },
    { label: "B", min: r * 5, text: `Lunge into WB brick: ${r} × (${c.leg(400, "threshold")} + 30 m lunges @ ${c.w(d.lunges)} + 30 WB), 2 min rest` },
  ];
}

const TITLES: Record<HxDayType, string> = {
  off: "No station session", aerobic: "Aerobic stations", lower: "Lower + lunges + WB", upper: "Upper + sled",
  quality: "HYROX Quality", test: "Benchmark", race: "Race", rest: "Rest",
};

function bench(c: Ctx, slot: HxSlot): HxDay | null {
  const d = c.div;
  const mk = (title: string, blocks: HxBlock[]): HxDay => ({ type: "test", title, blocks: [WARMUP, ...blocks], min: 10 + blocks.reduce((t, b) => t + b.min, 0), vol: {} });
  if (slot === "lower") { c.add("row", 2000); c.add("push", 50); return mk("Test 1", [{ label: "Test", min: 30, text: `2k row time trial. 20 min later, 50 m sled push for time @ ${c.w(d.push)}. Record the time and number of breaks.` }]); }
  if (slot === "upper") { c.add("ski", 2000); c.add("wb", 120); return mk("Test 2", [{ label: "Test", min: 30, text: `2k ski time trial. Then max unbroken WB @ ${c.w(d.wb)}, rest 2 min, max unbroken again. Record both.` }]); }
  if (slot === "quality") { c.add("lunges", 100); c.add("wb", 100); return mk("Weak station test", [{ label: "Test", min: 25, text: `${c.leg(1000, "race effort")}, then 100 m sandbag lunges @ ${c.w(d.lunges)} for time, then 100 WB @ ${c.w(d.wb)} for time. Record lunge time, WB time and breaks.` }]); }
  return null;
}

/** The coach's Saturday race-week template, placed around the race day. */
function raceWeek(c: Ctx, raceDay: number): HxDay[] {
  const d = c.div;
  const mk = (type: HxDayType, title: string, blocks: HxBlock[], warm = true): HxDay => ({
    type, title, blocks: warm ? [WARMUP, ...blocks] : blocks, min: (warm ? 10 : 0) + blocks.reduce((t, b) => t + b.min, 0), vol: {},
  });
  const days: HxDay[] = Array.from({ length: 7 }, () => mk("off", TITLES.off, [], false));
  const at = (off: number, day: HxDay) => { const i = raceDay + off; if (i >= 0 && i < 7) days[i] = day; };
  at(-5, mk("aerobic", "Recovery machines", [{ label: "Main", min: 45, text: "3 × (5 min bike, 5 min row, 5 min ski), relaxed" }], false));
  at(-4, mk("aerobic", "Easy aerobic", [{ label: "Main", min: 30, text: "30 min machine z2, or uphill walk" }], false));
  at(-3, mk("quality", "Race-week sharpener", [
    { label: "A", min: 20, text: `4 × (${c.leg(400, "threshold")} + 400 m ski or row @ 2k pace + 8 s), 90 s rest. Last set: + 30–40 unbroken WB.` },
    { label: "B", min: 10, text: `10 min reset, then E2MOM × 3: 10 m push + 10 m BBJ / 10 m pull + 10 walking lunges + 50 m farmers, all @ race weight. Just feel the weight.` },
  ]));
  at(-2, mk("aerobic", "Hybrid z2", [{ label: "Main", min: 30, text: "3 × (5 min bike + 5 min ski or row), easy" }], false));
  at(-1, mk("aerobic", "Primer", [{ label: "Main", min: 25, text: `20 min bike z2 + EMOM 9: 10 WB, 10 box step-downs, 5 box jumps. Nothing here should create fatigue.` }], false));
  at(0, mk("race", "HYROX race", [
    { label: "Warm-up", min: 45, text: `45–50 min, finishing 5–10 min before the start: easy bike ~50% FTP, mobility, then touch the stations: sled push 3–4 × 5 m (one slightly heavier), 3–4 sled pulls, BBJ 3–4 × 4, 20 m farmers, 8–10 lunges, 8–10 WB @ ${c.w(d.wb)}.` },
    { label: "Race", min: 0, text: "Pace the first run. Lunges in 2–3 short breaks at most; wall balls in sets of 15–20 with breaks under 5 s." },
  ], false));
  at(1, mk("rest", "Rest", [{ label: "Recover", min: 0, text: "Take 1–2 full rest days after the race." }], false));
  c.add("wb", 40); c.add("push", 30); c.add("pull", 30); c.add("bbj", 20); c.add("lunges", 10); c.add("farmers", 50);
  return days;
}

function dayFor(c: Ctx, slot: HxSlot): HxDay {
  const k = c.spec.kind;
  if ((k === "bench" || k === "test") && slot !== "off") {
    const b = bench(c, slot);
    if (b) return b;
  }
  const blocks = slot === "aerobic" ? aerobic(c) : slot === "lower" ? lower(c) : slot === "upper" ? upper(c) : slot === "quality" ? quality(c) : [];
  return { type: slot, title: TITLES[slot], blocks, min: 0, vol: {} };
}

export function buildHyrox(h: HyroxSettings, startDate: string): HxPlan {
  const start = parseDate(startDate) || parseDate(nextMonday())!;
  const weeks: HxWeek[] = [];
  for (let w = 0; w < 12; w++) {
    const spec = weekSpec(w, h);
    const c = new Ctx(h, spec);
    let days: HxDay[];
    if (spec.kind === "race") days = raceWeek(c, h.raceDay);
    else {
      days = h.template.map((slot) => {
        const before = { ...c.vol };
        const day = dayFor(c, slot);
        day.vol = diff(c.vol, before);
        return day;
      });
      // Extra work for weak stations (not in benchmark weeks).
      if (spec.kind !== "bench" && spec.kind !== "test") {
        for (const st of h.weaknesses) {
          const host = HOST[st].map((s) => days.findIndex((d) => d.type === s)).find((i) => i >= 0);
          if (host === undefined) continue;
          const before = { ...c.vol };
          const b = weakBlock(c, st);
          if (!b) continue;
          days[host].blocks.push(b);
          const add = diff(c.vol, before);
          for (const k of Object.keys(add) as Station[]) days[host].vol[k] = (days[host].vol[k] || 0) + add[k]!;
        }
      }
      for (const d of days) {
        if (d.type === "off" || d.type === "test" || !d.blocks.length) continue;
        d.blocks.unshift(WARMUP);
      }
    }
    for (const d of days) if (!d.min) d.min = d.blocks.reduce((t, b) => t + b.min, 0);
    if (spec.kind === "race") {
      // Race-week volume is mostly the race itself; attribute the touches to race day.
      const r = days.findIndex((d) => d.type === "race");
      if (r >= 0) days[r].vol = { ...c.vol };
    }
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + w * 7);
    weeks.push({
      n: w + 1, phase: spec.phase, phaseKey: spec.phaseKey, kind: spec.kind, light: spec.light, step: spec.step,
      days, weekStart,
      totalMin: days.reduce((t, d) => t + (d.type === "race" ? 0 : d.min), 0),
      sessions: days.filter((d) => d.type !== "off" && d.type !== "rest").length,
      vol: c.vol,
    });
  }
  const vol: Partial<Record<Station, number>> = {};
  for (const wk of weeks) for (const k of Object.keys(wk.vol) as Station[]) vol[k] = (vol[k] || 0) + wk.vol[k]!;
  return { weeks, vol, totalMin: weeks.reduce((t, w) => t + w.totalMin, 0) };
}

function diff(a: Partial<Record<Station, number>>, b: Partial<Record<Station, number>>) {
  const out: Partial<Record<Station, number>> = {};
  for (const k of Object.keys(a) as Station[]) { const v = (a[k] || 0) - (b[k] || 0); if (v) out[k] = v; }
  return out;
}

export const fmtVol = (st: Station, v: number) => `${Math.round(v).toLocaleString()}${STATION[st].unit === "reps" ? " reps" : " m"}`;

/** Plain text for one day (Copy button, intervals.icu description). */
export function hxDayText(wk: HxWeek, d: HxDay): string {
  const lines = [`${d.title} – HYROX week ${wk.n} (${wk.phase})`];
  for (const b of d.blocks) lines.push(`${b.label}: ${b.text}`);
  if (d.min && d.type !== "race") lines.push(`Est. time: ~${Math.round(d.min)} min`);
  return lines.join("\n");
}

export function hxCsv(p: HxPlan): string {
  const rows = [["Week", "Phase", "Date", "Day", "Session", "Est. minutes", "Details"]];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  p.weeks.forEach((wk) => wk.days.forEach((d, i) => {
    if (d.type === "off") return;
    rows.push([String(wk.n), wk.phase, isoDate(hxDayDate(wk, i)), DAYS[i], d.title, d.min ? String(Math.round(d.min)) : "", d.blocks.map((b) => `${b.label}: ${b.text}`).join(" | ")]);
  }));
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

/** Run-plan conflicts: the coach keeps hard runs off the day before lower and HYROX Quality sessions. */
export function linkWarnings(hx: HxSlot[], run: string[], quality: string[], days: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (hx[i] !== "lower" && hx[i] !== "quality") continue;
    const prev = (i + 6) % 7;
    if (quality.includes(run[prev])) out.push(`Your run plan has a sub-threshold session on ${days[prev]}, the day before ${SLOT_LABELS[hx[i]]} on ${days[i]}. Keep hard runs off the day before lower and HYROX Quality sessions.`);
  }
  return out;
}
