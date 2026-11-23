"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/components/app-provider";
import { addDays } from "@/lib/calendar";
import { fmtShortDate, parseTime } from "@/lib/format";
import { buildModel } from "@/lib/vdot";
import { cn } from "@/lib/utils";

/** One 5k time trial per finished period; the next period's paces use it. */
export function PaceTestsCard() {
  const { settings, update, calendar, currentPeriod } = useApp();
  const periods = calendar.periods;
  const setTest = (period: number, time: string) =>
    update((cur) => {
      const rest = (cur.paceTests || []).filter((t) => t.period !== period);
      return { paceTests: time.trim() ? [...rest, { period, time }] : rest };
    });

  return (
    <Card id="pace-tests" className="scroll-mt-8 gap-4 py-6">
      <CardHeader className="px-4 md:px-6"><CardTitle className="font-black">5k Tests</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 md:px-6">
        {periods.length < 2 ? (
          <p className="max-w-[65ch] text-muted-foreground">
            Your season is one 12-week period. Add a later end date in Season to get a 5k test at the end of each period.
          </p>
        ) : (
          <>
            <p className="max-w-[65ch] text-muted-foreground">
              At the end of each 12-week period, run the 5k test in your plan and enter the time. The next period&apos;s paces use it.
            </p>
            <ul className="divide-y">
              {periods.slice(0, -1).map((p) => {
                const lastWeek = calendar.weeks[p.weeks[p.weeks.length - 1]];
                const entry = (settings.paceTests || []).find((t) => t.period === p.i);
                const value = entry?.time ?? "";
                const m = value.trim() ? buildModel("5000", value, settings.paceAdjust) : null;
                const invalid = value.trim() !== "" && Number.isNaN(parseTime(value));
                const future = p.i >= currentPeriod;
                return (
                  <li key={p.i} className={cn("grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:gap-x-8", future && !value && "text-muted-foreground")}>
                    <div className="min-w-0">
                      <Label htmlFor={`pace-test-${p.i}`} className="font-black">After Period {p.i + 1}</Label>
                      <p className="num text-muted-foreground">{fmtShortDate(lastWeek.start)} – {fmtShortDate(addDays(lastWeek.start, 6))}</p>
                      <p className="font-extralight text-muted-foreground">
                        Sets Period {p.i + 2} paces{m ? <> · <span className="num font-black text-signal">VDOT {m.vdot.toFixed(1)}</span></> : null}
                      </p>
                    </div>
                    <Input id={`pace-test-${p.i}`} className="num" type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                      enterKeyHint="done" value={value} placeholder="19:45" aria-invalid={invalid}
                      onChange={(e) => setTest(p.i, e.target.value)} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
