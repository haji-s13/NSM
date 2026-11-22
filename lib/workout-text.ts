import { dist, fmtDuration, fmtTime, pace, rangeOf, type Units } from "./format";
import { STRIDES, type Session, type Week } from "./plan";
import type { Paces } from "./vdot";

/** The main set of a session as one line, in the chosen unit. */
export function mainLine(d: Session, u: Units, p: Paces): string {
  if (d.type === "rest") return "Rest or cross-train";
  if (d.type === "easy") return `${dist(d.km, u)} easy @ ${rangeOf(p.easy, u)}${d.strides ? `, then ${STRIDES}` : ""}`;
  if (d.type === "longrun") return `${dist(d.km, u)} easy @ ${rangeOf(p.easy, u)}`;
  if (d.mainText) return d.mainText;
  if (d.type === "race") return `${d.title} @ current PB pace ${pace(d.racePace!, u)} (${fmtTime(d.raceTime!)})`;
  const r = d.reps!;
  if (d.type === "hills") {
    return `${r.n} × 400 m @ ${rangeOf(r.pace, u)} (${fmtTime(r.pace.lo * 0.4)}–${fmtTime(r.pace.hi * 0.4)}), 30s rest`;
  }
  if (!r.stepKm) return `${r.n} × ${r.stepMin < 1 ? `${Math.round(r.stepMin * 60)} s` : `${r.stepMin} min`} @ ${rangeOf(r.pace, u)}, ${r.recS}s jog`;
  const step = r.stepKm < 1 ? `${Math.round(r.stepKm * 1000)} m` : `${r.stepKm} km`;
  return `${r.n} × ${step} @ ${rangeOf(r.pace, u)} (${fmtTime(r.pace.lo * r.stepKm)}–${fmtTime(r.pace.hi * r.stepKm)}), ${r.recS}s jog`;
}

/** Plain-text workout for a Strava description (the Copy button). */
export function workoutText(wk: Week, d: Session, u: Units, p: Paces): string {
  if (d.pm) {
    const am = workoutText(wk, { ...d, pm: undefined, title: "AM threshold" }, u, p);
    const pm = workoutText(wk, d.pm, u, p);
    return `${am}\n\n${pm}`;
  }
  const name = d.type === "easy" ? (d.strides ? "Easy run + strides" : "Easy run") : d.title;
  const lines = [`${name} – Week ${wk.n} (${wk.phase})`];
  if (d.type === "easy" || d.type === "longrun") {
    lines.push(`${dist(d.km, u)} easy @ ${rangeOf(p.easy, u)}`);
    if (d.strides) lines.push(`Finish with ${STRIDES}, fast but relaxed, full recovery between`);
    lines.push(`Est. time: ~${fmtDuration(d.sec)}`);
    return lines.join("\n");
  }
  if (d.wu) lines.push(`Warm-up: ${dist(d.wu, u)} easy${d.type === "race" ? " + strides" : ""}`);
  lines.push(mainLine(d, u, p));
  if (d.cd) lines.push(`Cool-down: ${dist(d.cd, u)} easy`);
  lines.push(`Total: ${dist(d.km, u)} · est. ~${fmtDuration(d.sec)}`);
  return lines.join("\n");
}

/** Copies inside a click handler; falls back to a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}
