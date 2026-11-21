"use client";

import { useState } from "react";
import { Send, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app-provider";
import { dist, fmtDuration, fmtShortDate } from "@/lib/format";
import { changeVsLastFull, type Week } from "@/lib/plan";
import { corosSent, dateKey, dayItems } from "@/lib/coros";
import { cn } from "@/lib/utils";
import { DayCell } from "./day-cell";
import { useSend } from "./use-send";

const PHASE_DOT: Record<Week["phaseKey"], string> = {
  base: "bg-phase-base", build: "bg-phase-build", peak: "bg-phase-peak", trial: "bg-phase-trial",
};

/** One training week: summary row, then seven days (stacked on phones, a row on wide screens). */
export function WeekCard({ wk, weeks }: { wk: Week; weeks: Week[] }) {
  const { settings, model } = useApp();
  const { sendIcu, sendCoros, busy, corosReady } = useSend();
  const [open, setOpen] = useState(wk.n <= 2);
  const u = settings.units;
  const change = changeVsLastFull(weeks, wk.n - 1);
  if (!model) return null;
  const icuItems = wk.days.map((d, i) => ({ wk, i })).filter(({ i }) => wk.days[i].type !== "rest");
  const corosItems = dayItems(wk).filter((it) => !corosSent()[dateKey(it.date)]);

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 text-left hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring">
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", PHASE_DOT[wk.phaseKey])} aria-hidden />
          <span className="font-black">Week {wk.n}</span>
          <span className="font-extralight text-muted-foreground">{fmtShortDate(wk.weekStart)} · {wk.phase}{wk.deload ? " · lighter" : ""}</span>
        </span>
      </button>
      {open && (
        <div className="border-t">
          {/* Week-level summary and actions, set apart from the days below. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border bg-muted px-4 py-2 md:px-6">
            <div className="min-w-0">
              <p className="text-meta uppercase text-muted-foreground">Week total</p>
              <p className="num font-extralight text-muted-foreground">
                <span className="font-black text-foreground">{dist(wk.totalKm, u, 0)}</span> · ~{fmtDuration(wk.totalSec)}{change !== null ? ` · ${change > 0 ? "+" : ""}${change}% vs last full week` : ""} · Sub-T {dist(wk.subtKm, u, 0)} ({Math.round((wk.subtKm / wk.totalKm) * 100)}%) · {wk.fmt === "time" ? "time reps" : "distance reps"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={busy === `week-${wk.n}-icu`} onClick={() => sendIcu(`week-${wk.n}-icu`, icuItems, `week ${wk.n}`)}>
                <Send aria-hidden /> Week to icu
              </Button>
              {corosReady && (
                <Button size="sm" variant="ghost" disabled={busy === `week-${wk.n}` || !corosItems.length}
                  onClick={() => sendCoros(`week-${wk.n}`, corosItems, `week ${wk.n}`)}>
                  <Watch aria-hidden /> {corosItems.length ? "Week to COROS" : "In COROS"}
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-2 p-2 md:p-4">
            {wk.days.map((_, i) => <DayCell key={i} wk={wk} i={i} />)}
          </div>
        </div>
      )}
    </article>
  );
}
