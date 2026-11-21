"use client";

import { cn } from "@/lib/utils";
import { useApp } from "@/components/app-provider";
import { dist, fmtDuration, fmtShortDate } from "@/lib/format";
import { dayDate, type DayType, type Week } from "@/lib/plan";
import { DAYS } from "@/lib/settings";
import { mainLine } from "@/lib/workout-text";
import { DayActions } from "./day-actions";

const TINT: Record<DayType, string> = {
  easy: "bg-session-easy text-session-easy-ink",
  short: "bg-session-subt text-session-subt-ink",
  medium: "bg-session-subt text-session-subt-ink",
  long: "bg-session-subt text-session-subt-ink",
  hills: "bg-session-subt text-session-subt-ink",
  longrun: "bg-session-long text-session-long-ink",
  rest: "bg-session-rest text-session-rest-ink",
  race: "bg-session-race text-session-race-ink",
};

/** One day: when, what, how far and how long, and its actions. */
export function DayCell({ wk, i }: { wk: Week; i: number }) {
  const { settings, model } = useApp();
  const d = wk.days[i];
  const u = settings.units;
  if (!model) return null;
  return (
    <div className="grid min-w-0 gap-2 bg-card p-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-start md:gap-6 md:px-6">
      <div className="flex items-center justify-between gap-2 md:flex-col md:items-start">
        <p className="text-meta uppercase text-muted-foreground">
          {DAYS[i]} <span className="font-extralight normal-case tracking-normal">{fmtShortDate(dayDate(wk, i))}</span>
        </p>
        <span className={cn("rounded-full px-2 text-meta whitespace-nowrap uppercase", TINT[d.type])}>{d.title}</span>
      </div>
      {d.type === "rest" ? (
        <p className="text-muted-foreground md:col-span-2">Rest or cross-train</p>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-0 tabular-nums">
            {!!d.wu && <p className="font-extralight text-muted-foreground">Warm-up {dist(d.wu, u)} easy{d.type === "race" ? " + strides" : ""}</p>}
            <p className="font-black break-words">{mainLine(d, u, model.paces)}</p>
            {!!d.cd && <p className="font-extralight text-muted-foreground">Cool-down {dist(d.cd, u)} easy</p>}
            <p className="num text-muted-foreground">{dist(d.km, u)} · ~{fmtDuration(d.sec)}</p>
          </div>
          <DayActions wk={wk} i={i} />
        </>
      )}
    </div>
  );
}
