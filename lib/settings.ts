import { nextMonday, type Units } from "./format";
import { defaultHyrox, normalizeHyrox, type HyroxSettings } from "./hyrox";
import { addDays, defaultEnd, mondayOf, newId, type Race, type Vacation } from "./calendar";
import { isoDate, parseDate } from "./format";

export type SessionType = "rest" | "easy" | "short" | "medium" | "long" | "hills" | "longrun";
export type RepFormat = "distance" | "time" | "mixed";
/** Last week when no race falls in it ("race" is from older saves and means the same as "test"). */
export type FinalWeek = "race" | "test" | "normal";

/** Everything a plan is built from. Same shape and storage key as the original site,
 *  so guest settings and plans saved to Supabase carry over unchanged. */
export interface Settings {
  pbDistance: "5000" | "10000";
  pbTime: string;
  units: Units;
  paceAdjust: number;
  startDate: string;
  /** Last day of the build (any day; the plan runs to the end of that week). */
  endDate: string;
  races: Race[];
  vacations: Vacation[];
  startVolume: number;    // display unit per week (period 1)
  peakVolume: number;     // display unit per week (period 1)
  /** Start and peak volume for periods 2, 3, … (index 0 is unused: period 1 uses startVolume/peakVolume). */
  periodVolumes?: ({ start: number; peak: number } | null)[];
  subtShare: number;      // % of weekly volume
  subtWarmupKm: number;   // always km
  subtCooldownKm: number; // always km
  repFormat: RepFormat;
  finalWeek: FinalWeek;
  deloads: boolean;
  template: SessionType[];
  icuAthlete?: string;
  /** HYROX station program. Shares startDate with the run plan and saves with it. */
  hyrox: HyroxSettings;
}

export const SESSION_LABELS: Record<SessionType, string> = {
  rest: "Rest",
  easy: "Easy",
  short: "Sub-T short (1k / 3 min)",
  medium: "Sub-T medium (2k / 6 min)",
  long: "Sub-T long (3k / 10 min)",
  hills: "400s / hills",
  longrun: "Long run",
};

export const QUALITY: SessionType[] = ["short", "medium", "long", "hills"];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function defaultSettings(): Settings {
  const start = nextMonday();
  return {
    endDate: defaultEnd(start),
    races: [{ id: newId(), date: isoDate(addDays(mondayOf(parseDate(start)!), 11 * 7 + 5)), name: "HYROX race", kind: "hyrox" }],
    vacations: [],
    pbDistance: "5000",
    pbTime: "19:45",
    units: "km",
    paceAdjust: 0,
    startDate: start,
    startVolume: 55,
    peakVolume: 75,
    subtShare: 25,
    subtWarmupKm: 2,
    subtCooldownKm: 1.5,
    repFormat: "distance",
    finalWeek: "test",
    deloads: true,
    template: ["easy", "short", "easy", "medium", "easy", "long", "longrun"],
    hyrox: defaultHyrox(),
  };
}

/** Fills gaps in saved or older settings with defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const s = { ...d, ...(raw && typeof raw === "object" ? raw : {}) } as Settings;
  if (!Array.isArray(s.template) || s.template.length !== 7) s.template = d.template.slice();
  s.hyrox = normalizeHyrox(s.hyrox);
  // Older saves were always 12 weeks with the race in week 12.
  const raw0 = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings> & { hyrox?: { finalWeek?: string; raceDay?: number } };
  if (!raw0.endDate) s.endDate = defaultEnd(s.startDate);
  if (!Array.isArray(raw0.races)) {
    const wk12 = mondayOf(parseDate(s.startDate) || new Date());
    s.races = raw0.hyrox?.finalWeek === "race" || raw0.finalWeek === "race" || !raw0.hyrox
      ? [{ id: newId(), date: isoDate(addDays(wk12, 11 * 7 + (raw0.hyrox?.raceDay ?? 5))), name: raw0.hyrox ? "HYROX race" : "Race", kind: raw0.hyrox ? "hyrox" : "run" }]
      : [];
    if (s.finalWeek === "race") s.finalWeek = "test";
  }
  if (!Array.isArray(s.vacations)) s.vacations = [];
  return s;
}

export const STORAGE_KEY = "nsm-planner-v1";

export function loadLocal(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch { /* storage unavailable */ }
  return defaultSettings();
}

export function saveLocal(s: Settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function templateWarnings(t: SessionType[]): string[] {
  const warns: string[] = [];
  const q = t.map((x) => QUALITY.includes(x));
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

/** Start and peak weekly volume (display units) for a 12-week period. Later periods default to
 *  starting about 15% under the previous peak and building back to it. */
export function periodVolume(s: Settings, p: number): { start: number; peak: number } {
  if (p <= 0) return { start: s.startVolume, peak: s.peakVolume };
  const set = s.periodVolumes?.[p];
  if (set) return set;
  const prev = periodVolume(s, p - 1);
  return { start: Math.round(prev.peak * 0.85), peak: prev.peak };
}
