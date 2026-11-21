"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtShortDate } from "@/lib/format";

export const CHART_WEEKS = 12;

/** The weekly volume charts show 12 weeks at a time, stepping a 4-week block at a time.
 *  Opens on the window that holds this week. */
export function useChartWindow(weeks: { weekStart: Date }[]) {
  const n = weeks.length;
  const maxStart = Math.max(0, n - CHART_WEEKS);
  const [start, setStart] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const cur = weeks.findIndex((w) => now < w.weekStart.getTime() + 7 * 86400000);
    setStart(Math.min(maxStart, Math.max(0, Math.floor(Math.max(0, cur) / 4) * 4)));
    // Only when the plan's length or start changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, weeks[0]?.weekStart.getTime()]);
  const s = Math.min(start, maxStart);
  const end = Math.min(n, s + CHART_WEEKS);
  const controls = n > CHART_WEEKS ? (
    <div className="flex items-center justify-between gap-2">
      <Button size="sm" variant="outline" disabled={s === 0} onClick={() => setStart(Math.max(0, s - 4))} aria-label="Earlier weeks">
        <ChevronLeft aria-hidden /> Earlier
      </Button>
      <p className="num text-center text-muted-foreground">
        Weeks {s + 1}–{end} of {n} · {fmtShortDate(weeks[s].weekStart)} – {fmtShortDate(new Date(weeks[end - 1].weekStart.getTime() + 6 * 86400000))}
      </p>
      <Button size="sm" variant="outline" disabled={s >= maxStart} onClick={() => setStart(Math.min(maxStart, s + 4))} aria-label="Later weeks">
        Later <ChevronRight aria-hidden />
      </Button>
    </div>
  ) : null;
  return { start: s, end, count: end - s, controls };
}
