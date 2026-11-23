"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { COROS_TOOL, corosCourse, corosErrorMessage, corosSent, dateKey, inCorosWindow, itemKey, markCorosSent, ymd, type CorosError, type CorosItem } from "@/lib/coros";
import { icuEvents, icuPush } from "@/lib/intervals";
import { copyText, workoutText } from "@/lib/workout-text";
import type { Week } from "@/lib/plan";

/** Copy, intervals.icu and COROS sending, shared by day and week controls. */
export function useSend() {
  const { settings, model, coros, bumpSent } = useApp();
  const [busy, setBusy] = useState<string | null>(null); // key of the control that's sending

  const copy = useCallback(async (wk: Week, i: number) => {
    if (!model) return;
    const ok = await copyText(workoutText(wk, wk.days[i], settings.units, wk.paces));
    if (ok) toast.success("Copied. Paste it into your Strava description.");
    else toast.error("Couldn't copy. Select the text and copy it manually.");
  }, [model, settings.units]);

  const sendIcu = useCallback(async (key: string, items: { wk: Week; i: number }[], label: string) => {
    if (!model || !items.length) return;
    setBusy(key);
    try {
      const n = await icuPush(settings.icuAthlete, items.flatMap(({ wk, i }) => icuEvents(wk, i, settings.units, wk.paces)));
      toast.success(`Sent ${n} workout${n === 1 ? "" : "s"} (${label}) to intervals.icu.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [model, settings.icuAthlete, settings.units]);

  const sendCoros = useCallback(async (key: string, items: CorosItem[], label: string) => {
    if (!model || !coros.client || !items.length) return;
    setBusy(key);
    let sent = 0, skipped = 0;
    const id = toast.loading(`Sending ${label} to COROS…`);
    try {
      for (const it of items) {
        if (!inCorosWindow(it.date)) { skipped++; continue; }
        if (items.length > 1) toast.loading(`Sending ${sent + 1} of ${items.length} to COROS…`, { id });
        await coros.client.callTool(coros.server, COROS_TOOL, { date: ymd(it.date), course: corosCourse(it.wk, it.pm ? it.wk.days[it.i].pm! : it.wk.days[it.i], settings.units, it.wk.paces) });
        markCorosSent(itemKey(it));
        sent++;
      }
      const skip = skipped ? ` ${skipped} skipped: COROS only accepts dates up to 90 days ahead.` : "";
      if (sent) toast.success(`Added ${sent} workout${sent === 1 ? "" : "s"} (${label}) to COROS.${skip}`, { id });
      else toast.error(`Nothing sent.${skip}`, { id });
    } catch (e) {
      toast.error(`${sent ? `Added ${sent} before stopping. ` : ""}${corosErrorMessage(e as CorosError, coros.source)}`, { id });
    } finally {
      setBusy(null);
      bumpSent();
    }
  }, [model, coros, settings.units, bumpSent]);

  const isSent = (d: Date) => !!corosSent()[dateKey(d)];

  return { copy, sendIcu, sendCoros, busy, isSent, corosReady: !!coros.client };
}
