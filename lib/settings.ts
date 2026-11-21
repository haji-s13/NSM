import { nextMonday, type Units } from "./format";
import { defaultHyrox, normalizeHyrox, type HyroxSettings } from "./hyrox";

export type SessionType = "rest" | "easy" | "short" | "medium" | "long" | "hills" | "longrun";
export type RepFormat = "distance" | "time" | "mixed";
export type FinalWeek = "race" | "test" | "normal";

/** Everything a plan is built from. Same shape and storage key as the original site,
 *  so guest settings and plans saved to Supabase carry over unchanged. */
export interface Settings {
  pbDistance: "5000" | "10000";
  pbTime: string;
  units: Units;
  paceAdjust: number;
  startDate: string;
  startVolume: number;    // display unit per week
  peakVolume: number;     // display unit per week
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
  return {
    pbDistance: "5000",
    pbTime: "19:45",
    units: "km",
    paceAdjust: 0,
    startDate: nextMonday(),
    startVolume: 55,
    peakVolume: 75,
    subtShare: 25,
    subtWarmupKm: 2,
    subtCooldownKm: 1.5,
    repFormat: "distance",
    finalWeek: "race",
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
