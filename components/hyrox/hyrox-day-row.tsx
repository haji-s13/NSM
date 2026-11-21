"use client";

import { Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app-provider";
import { dist, fmtShortDate } from "@/lib/format";
import { hxDayDate, hxDayText, type HxDayType, type HxWeek } from "@/lib/hyrox";
import { DAYS } from "@/lib/settings";
import { copyText } from "@/lib/workout-text";
import { cn } from "@/lib/utils";

/** Same tints as the run plan: easy green for aerobic, blue for strength, orange for quality, red for tests and races. */
export const HX_CARD: Record<HxDayType, string> = {
  off: "bg-session-rest", rest: "bg-session-rest", vacation: "bg-muted",
  aerobic: "bg-session-easy",
  lower: "bg-session-long", upper: "bg-session-long",
  quality: "bg-session-subt",
  test: "bg-session-race", race: "bg-session-race",
};
const HX_INK: Record<HxDayType, string> = {
  off: "text-session-rest-ink", rest: "text-session-rest-ink", vacation: "text-muted-foreground",
  aerobic: "text-session-easy-ink",
  lower: "text-session-long-ink", upper: "text-session-long-ink",
  quality: "text-session-subt-ink",
  test: "text-session-race-ink", race: "text-session-race-ink",
};

/** One day: when, what (block by block), how long, the linked run, and actions. */
export function HyroxDayRow({ wk, i, onIcu, busy, hideRun = false }: { wk: HxWeek; i: number; onIcu: () => void; busy: boolean; hideRun?: boolean }) {
  const { plan, settings } = useApp();
  const d = wk.days[i];
  const run = plan?.weeks[wk.n - 1]?.days[i];
  const runLine = !hideRun && run && run.type !== "rest" && run.km > 0 ? `${run.type === "easy" ? (run.strides ? "Easy + strides" : "Easy") : run.title} ${dist(run.km, settings.units)}` : null;
  const empty = d.type === "off" || !d.blocks.length;

  async function copy() {
    const ok = await copyText(hxDayText(wk, d));
    if (ok) toast.success("Copied. Paste it into your Strava description.");
    else toast.error("Couldn't copy. Select the text and copy it manually.");
  }

  return (
    <div className={cn("grid min-w-0 gap-2 p-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-start md:gap-6 md:px-6", HX_CARD[d.type])}>
      <div className="flex items-center justify-between gap-2 md:flex-col md:items-start">
        <p className="text-meta uppercase text-muted-foreground">
          {DAYS[i]} <span className="font-extralight normal-case tracking-normal">{fmtShortDate(hxDayDate(wk, i))}</span>
        </p>
        <span className={cn("rounded-full bg-card px-2 text-meta uppercase", HX_INK[d.type])}>{d.type === "vacation" ? "Vacation" : empty ? "No stations" : d.title}</span>
      </div>
      {empty ? (
        <p className="text-muted-foreground md:col-span-2">{d.type === "vacation" ? "Time off. Enjoy it." : runLine ? <>Run plan: <span className="text-foreground">{runLine}</span></> : run?.off === "hyrox" ? "HYROX race day" : hideRun ? "No station session today" : "Rest or run plan only"}</p>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-1">
            {d.blocks.map((b, k) => (
              <p key={k} className={cn("break-words", b.label === "Warm-up" ? "font-extralight text-muted-foreground" : b.weak || b.acc ? "" : "font-black")}>
                {b.label === "Warm-up" ? `Warm-up ${b.text}` : (
                  <>
                    <span className={cn("mr-2 text-meta uppercase", b.weak ? "text-signal" : "text-muted-foreground")}>{b.weak ? "Weak · " + b.label.split("· ")[1] : b.acc ? "Accessory · " + b.label.split("· ")[1] : b.label}</span>
                    {b.text}
                  </>
                )}
              </p>
            ))}
            <p className="num text-muted-foreground">{d.type === "race" ? "Race day" : `~${Math.round(d.min)} min`}</p>
            {runLine && <p className="text-meta uppercase text-muted-foreground">Run plan <span className="font-extralight normal-case tracking-normal text-foreground">{runLine}</span></p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy} aria-label={`Copy week ${wk.n} ${DAYS[i]} session`}><Copy aria-hidden /> Copy</Button>
            {d.type !== "rest" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onIcu} aria-label="Send to intervals.icu"><Send aria-hidden /> icu</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
