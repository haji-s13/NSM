import { isoDate, nextMonday, parseDate } from "./format";

/* The season both plans share: build start and end, races, and time off.
 * Weeks run Monday to Sunday and group into 4-week blocks. */

export type RaceKind = "hyrox" | "run";
export interface Race { id: string; date: string; name: string; kind: RaceKind }
export interface Vacation { id: string; start: string; end: string }

export const MIN_WEEKS = 4;
export const MAX_WEEKS = 52;
export const BLOCK_WEEKS = 4;

export type CalPhase = "base" | "build" | "peak";
export type CalRole = "load" | "taper" | "race" | "vacation";

export interface CalWeek {
  i: number;               // 0-based week index
  start: Date;             // Monday
  block: number;           // 0-based block index
  pos: number;             // 0-3, position in its block
  phase: CalPhase;         // the block's phase
  phaseRepeat: number;     // earlier blocks with the same phase
  role: CalRole;
  races: { day: number; race: Race }[];
  off: boolean[];          // vacation days, Mon..Sun
  last: boolean;
  /** The previous week ended with a Sunday race, so Monday is recovery. */
  afterRace: boolean;
  /** The taper week before the last race (or the last week before it), for the benchmark repeat. */
  finalSharpen: boolean;
}

export interface CalBlock { i: number; phase: CalPhase; start: Date; end: Date; weeks: number[] }
export interface Calendar { weeks: CalWeek[]; blocks: CalBlock[]; races: Race[]; outside: Race[] }

export const PHASE_NAMES: Record<CalPhase, string> = { base: "Base", build: "Build", peak: "Peak" };

/** Monday on or before a date. */
export function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setHours(12, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayIndex = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

/** A default end date: Sunday of week 12. */
export function defaultEnd(startDate: string): string {
  const s = mondayOf(parseDate(startDate) || parseDate(nextMonday())!);
  return isoDate(addDays(s, 12 * 7 - 1));
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export function buildCalendar(startDate: string, endDate: string, races: Race[], vacations: Vacation[]): Calendar {
  const start = mondayOf(parseDate(startDate) || parseDate(nextMonday())!);
  const endRaw = parseDate(endDate) || addDays(start, 12 * 7 - 1);
  const n = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.floor(dayIndex(start, endRaw) / 7) + 1));

  const sorted = races.filter((r) => parseDate(r.date)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const inside = sorted.filter((r) => { const d = dayIndex(start, parseDate(r.date)!); return d >= 0 && d < n * 7; });
  const outside = sorted.filter((r) => !inside.includes(r));

  const offDays = new Set<number>();
  for (const v of vacations) {
    const a = parseDate(v.start), b = parseDate(v.end) || a;
    if (!a || !b) continue;
    for (let d = Math.max(0, dayIndex(start, a)); d <= Math.min(n * 7 - 1, dayIndex(start, b)); d++) offDays.add(d);
  }

  const nBlocks = Math.ceil(n / BLOCK_WEEKS);
  const blockPhase = (b: number): CalPhase => {
    const f = (b + 0.5) / nBlocks;
    return f < 1 / 3 ? "base" : f < 2 / 3 ? "build" : "peak";
  };

  const weeks: CalWeek[] = [];
  for (let i = 0; i < n; i++) {
    const block = Math.floor(i / BLOCK_WEEKS);
    const phase = blockPhase(block);
    let phaseRepeat = 0;
    for (let b = 0; b < block; b++) if (blockPhase(b) === phase) phaseRepeat++;
    const off = Array.from({ length: 7 }, (_, d) => offDays.has(i * 7 + d));
    const wkRaces = inside.map((race) => ({ race, d: dayIndex(start, parseDate(race.date)!) }))
      .filter(({ d }) => d >= i * 7 && d < i * 7 + 7).map(({ race, d }) => ({ day: d - i * 7, race }));
    weeks.push({
      i, start: addDays(start, i * 7), block, pos: i % BLOCK_WEEKS, phase, phaseRepeat,
      role: wkRaces.length ? "race" : off.filter(Boolean).length >= 5 ? "vacation" : "load",
      races: wkRaces, off, last: i === n - 1, finalSharpen: false, afterRace: !!weeks[i - 1]?.races.some((r) => r.day === 6),
    });
  }
  // A taper week before each race week (unless it's a race or vacation week itself).
  for (const w of weeks) {
    if (w.role !== "race") continue;
    const prev = weeks[w.i - 1];
    if (prev && prev.role === "load") prev.role = "taper";
  }
  // Benchmark repeat: the taper week before the last race, else the last load week.
  const lastRace = [...weeks].reverse().find((w) => w.role === "race");
  const target = lastRace && weeks[lastRace.i - 1]?.role === "taper" ? weeks[lastRace.i - 1]
    : [...weeks].reverse().find((w) => w.role === "load" && w.i > 0);
  if (target) target.finalSharpen = true;

  const blocks: CalBlock[] = [];
  for (let b = 0; b < nBlocks; b++) {
    const ws = weeks.filter((w) => w.block === b).map((w) => w.i);
    blocks.push({ i: b, phase: blockPhase(b), start: weeks[ws[0]].start, end: addDays(weeks[ws[ws.length - 1]].start, 6), weeks: ws });
  }
  return { weeks, blocks, races: inside, outside };
}
