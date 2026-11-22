import { isoDate, nextMonday, parseDate } from "./format";

/* The season both plans share: build start and end, races, and time off.
 * Weeks run Monday to Sunday, group into 4-week blocks, and blocks group into 12-week periods
 * (three blocks each). Inside a period, block 1 lays the foundation, block 2 builds and block 3
 * gets specific; the next period starts the cycle again a little bigger. */

export type RaceKind = "hyrox" | "run";
export interface Race { id: string; date: string; name: string; kind: RaceKind }
export interface Vacation { id: string; start: string; end: string }

export const MIN_WEEKS = 4;
export const MAX_WEEKS = 52;
export const BLOCK_WEEKS = 4;
export const PERIOD_BLOCKS = 3;
export const PERIOD_WEEKS = BLOCK_WEEKS * PERIOD_BLOCKS;

/** Internal: a block's job inside its period (1st, 2nd, 3rd block). Not shown as a name. */
export type CalPhase = "base" | "build" | "peak";
export type CalRole = "load" | "taper" | "race" | "vacation";

export interface CalWeek {
  i: number;               // 0-based week index
  start: Date;             // Monday
  block: number;           // 0-based block index
  period: number;          // 0-based 12-week period
  blockInPeriod: number;   // 0-2
  pos: number;             // 0-3, position in its block
  phase: CalPhase;         // from the block's place in its period
  phaseRepeat: number;     // = period: later periods go a little bigger
  role: CalRole;
  races: { day: number; race: Race }[];
  off: boolean[];          // vacation days, Mon..Sun
  last: boolean;
  /** The previous week ended with a Sunday race, so Monday is recovery. */
  afterRace: boolean;
  /** The taper week before the last race (or the last week before it), for the benchmark repeat. */
  finalSharpen: boolean;
}

export interface CalBlock { i: number; period: number; pos: number; phase: CalPhase; start: Date; end: Date; weeks: number[] }
export interface CalPeriod { i: number; start: Date; end: Date; blocks: number[]; weeks: number[] }
export interface Calendar { weeks: CalWeek[]; blocks: CalBlock[]; periods: CalPeriod[]; races: Race[]; outside: Race[] }

const PHASES: CalPhase[] = ["base", "build", "peak"];
export const blockLabel = (b: { period: number; pos: number }) => `Period ${b.period + 1} · Block ${b.pos + 1}`;

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
  const blockPhase = (b: number): CalPhase => PHASES[b % PERIOD_BLOCKS];

  const weeks: CalWeek[] = [];
  for (let i = 0; i < n; i++) {
    const block = Math.floor(i / BLOCK_WEEKS);
    const phase = blockPhase(block);
    const period = Math.floor(block / PERIOD_BLOCKS);
    const phaseRepeat = period;
    const off = Array.from({ length: 7 }, (_, d) => offDays.has(i * 7 + d));
    const wkRaces = inside.map((race) => ({ race, d: dayIndex(start, parseDate(race.date)!) }))
      .filter(({ d }) => d >= i * 7 && d < i * 7 + 7).map(({ race, d }) => ({ day: d - i * 7, race }));
    weeks.push({
      i, start: addDays(start, i * 7), block, period, blockInPeriod: block % PERIOD_BLOCKS, pos: i % BLOCK_WEEKS, phase, phaseRepeat,
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
    blocks.push({ i: b, period: Math.floor(b / PERIOD_BLOCKS), pos: b % PERIOD_BLOCKS, phase: blockPhase(b), start: weeks[ws[0]].start, end: addDays(weeks[ws[ws.length - 1]].start, 6), weeks: ws });
  }
  const periods: CalPeriod[] = [];
  for (let p = 0; p * PERIOD_BLOCKS < nBlocks; p++) {
    const bs = blocks.filter((b) => b.period === p);
    periods.push({ i: p, start: bs[0].start, end: bs[bs.length - 1].end, blocks: bs.map((b) => b.i), weeks: bs.flatMap((b) => b.weeks) });
  }
  return { weeks, blocks, periods, races: inside, outside };
}
