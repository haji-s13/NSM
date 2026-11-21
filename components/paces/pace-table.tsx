"use client";

import { useApp } from "@/components/app-provider";
import { fmtTime, rangeOf, type Range } from "@/lib/format";

const rep = (r: Range, km: number, label: string) => `${label} ${fmtTime(r.lo * km)}–${fmtTime(r.hi * km)}`;

/** Training paces as ranges, as a list that reads well on a phone. */
export function PaceTable() {
  const { model, settings } = useApp();
  if (!model) return null;
  const p = model.paces;
  const u = settings.units;
  const rows: { name: string; basis: string; range: string; detail: string; key?: boolean }[] = [
    { name: "Sub-T short", basis: "15k → half marathon pace", range: rangeOf(p.short, u), detail: `${rep(p.short, 1, "1 km")} · 60s rest`, key: true },
    { name: "Sub-T medium", basis: "Half marathon → 25k pace", range: rangeOf(p.medium, u), detail: `${rep(p.medium, 2, "2 km")} · 60s rest`, key: true },
    { name: "Sub-T long", basis: "25k → 30k pace", range: rangeOf(p.long, u), detail: `${rep(p.long, 3, "3 km")} · 60–90s rest`, key: true },
    { name: "400s / hills", basis: "10k → 15k pace", range: rangeOf(p.hills, u), detail: `${rep(p.hills, 0.4, "400 m")} · 30s rest` },
    { name: "Easy and long runs", basis: "Daniels E, 62–74% VDOT", range: rangeOf(p.easy, u), detail: "Conversational. Go slower if you need to." },
    { name: "Reference: Daniels T", basis: "83–88% VDOT", range: rangeOf(p.threshold, u), detail: "Don't run sub-T reps faster than its fast end." },
  ];
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-1 gap-0 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-8">
          <div className="min-w-0">
            <p className="font-black">{r.name}</p>
            <p className="text-muted-foreground">{r.basis}</p>
          </div>
          <p className={`num text-[1.25rem] leading-8 sm:text-right ${r.key ? "font-black" : ""}`}>{r.range}</p>
          <p className="num font-extralight text-muted-foreground sm:col-span-2">{r.detail}</p>
        </li>
      ))}
    </ul>
  );
}
