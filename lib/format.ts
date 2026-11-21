export const KM_PER_MI = 1.609344;
export type Units = "km" | "mi";

/** "19:45" → 1185, "1:05:30" → 3930. NaN when invalid. */
export function parseTime(str: string): number {
  const parts = String(str).trim().split(":");
  if (parts.length < 2 || parts.length > 3) return NaN;
  if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return NaN;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return NaN;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function fmtTime(sec: number): string {
  const s0 = Math.round(sec);
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = String(s0 % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** 2700 → "45 min", 4500 → "1 h 15 min". */
export function fmtDuration(sec: number): string {
  const mins = Math.round(sec / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
}

export const unitDist = (u: Units) => (u === "mi" ? "mi" : "km");
export const unitPace = (u: Units) => (u === "mi" ? "/mi" : "/km");

/** sec/km → "4:12/km" in the chosen unit. */
export const pace = (secPerKm: number, u: Units) =>
  fmtTime(u === "mi" ? secPerKm * KM_PER_MI : secPerKm) + unitPace(u);

export interface Range { lo: number; hi: number } // sec/km, lo = fast end

export function rangeOf(r: Range, u: Units): string {
  const f = (x: number) => fmtTime(u === "mi" ? x * KM_PER_MI : x);
  return `${f(r.lo)}–${f(r.hi)}${unitPace(u)}`;
}

export const mid = (r: Range) => (r.lo + r.hi) / 2;

export function dist(km: number, u: Units, digits = 1): string {
  const v = u === "mi" ? km / KM_PER_MI : km;
  return `${v.toFixed(digits)} ${unitDist(u)}`;
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}

export const fmtShortDate = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function nextMonday(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const add = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + add);
  return isoDate(d);
}
