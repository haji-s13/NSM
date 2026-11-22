"use client";

import { cn } from "@/lib/utils";
import { useApp } from "@/components/app-provider";
import { dist, fmtDuration, fmtShortDate } from "@/lib/format";
import { dayDate, type DayType, type Session, type Week } from "@/lib/plan";
import { DAYS } from "@/lib/settings";
import { mainLine } from "@/lib/workout-text";
import { DayActions } from "./day-actions";

/** Pale session tint for the whole day card (data colours from DESIGN.md 2.3). */
const CARD: Record<DayType, string> = {
  easy: "bg-session-easy",
  short: "bg-session-subt",
  medium: "bg-session-subt",
  long: "bg-session-subt",
  hills: "bg-session-subt",
  longrun: "bg-session-long",
  rest: "bg-session-rest",
  race: "bg-session-race",
  double: "bg-session-subt",
  single: "bg-session-subt",
  x: "bg-session-long",
};

/** Session label: white pill with the session's ink colour, so it reads on the tint. */
const TINT: Record<DayType, string> = {
  easy: "bg-card text-session-easy-ink",
  short: "bg-card text-session-subt-ink",
  medium: "bg-card text-session-subt-ink",
  long: "bg-card text-session-subt-ink",
  hills: "bg-card text-session-subt-ink",
  longrun: "bg-card text-session-long-ink",
  rest: "bg-card text-session-rest-ink",
  race: "bg-card text-session-race-ink",
  double: "bg-card text-session-subt-ink",
  single: "bg-card text-session-subt-ink",
  x: "bg-card text-session-long-ink",
};

/** One day: when, what, how far and how long, and its actions. */
export function DayCell({ wk, i }: { wk: Week; i: number }) {
  const { settings, model } = useApp();
  const d = wk.days[i];
  const u = settings.units;
  if (!model) return null;
  const look: DayType = d.off === "hyrox" ? "race" : d.type;
  return (
    <div className={cn("grid min-w-0 gap-2 p-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-start md:gap-6 md:px-6", d.off === "vacation" ? "bg-muted" : CARD[look])}>
      <div className="flex items-center justify-between gap-2 md:flex-col md:items-start">
        <p className="text-meta uppercase text-muted-foreground">
          {DAYS[i]} <span className="font-extralight normal-case tracking-normal">{fmtShortDate(dayDate(wk, i))}</span>
        </p>
        <span className={cn("rounded-full px-2 text-meta uppercase", d.off === "vacation" ? "bg-card text-muted-foreground" : TINT[look])}>{d.title}</span>
      </div>
      {d.type === "rest" ? (
        <p className="text-muted-foreground md:col-span-2">{d.off === "vacation" ? "Time off. Enjoy it." : d.off === "hyrox" ? `${d.note}: no run today. Race-day warm-up is on the HYROX tab.` : d.note || "Rest or cross-train"}</p>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-3 tabular-nums">
            <SessionLines d={d} label={d.pm ? "AM" : undefined} />
            {d.pm && <SessionLines d={d.pm} label="PM" />}
          </div>
          <DayActions wk={wk} i={i} />
        </>
      )}
    </div>
  );
}

/** Warm-up, main set, cool-down and totals for one session (a double day shows AM and PM). */
function SessionLines({ d, label }: { d: Session; label?: string }) {
  const { settings, model } = useApp();
  const u = settings.units;
  if (!model) return null;
  return (
    <div className="flex min-w-0 flex-col gap-0">
      {label && <p className="text-meta uppercase text-muted-foreground">{label}</p>}
      {!!d.wu && <p className="font-extralight text-muted-foreground">Warm-up {dist(d.wu, u)} easy{d.type === "race" ? " + strides" : ""}</p>}
      <p className="font-black break-words">{mainLine(d, u, model.paces)}</p>
      {!!d.cd && <p className="font-extralight text-muted-foreground">Cool-down {dist(d.cd, u)} easy</p>}
      <p className="num text-muted-foreground">{dist(d.km, u)} · ~{fmtDuration(d.sec)}</p>
    </div>
  );
}
