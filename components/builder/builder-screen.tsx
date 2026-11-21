"use client";

import { useState } from "react";
import { Download, Watch } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/components/app-provider";
import { MyPlans } from "@/components/plans/my-plans";
import { BlockHeading } from "@/components/plans/block-heading";
import { corosSent, dateKey, dayItems } from "@/lib/coros";
import { dist, isoDate } from "@/lib/format";
import { dayDate, MIN_EASY_KM } from "@/lib/plan";
import { templateWarnings, DAYS } from "@/lib/settings";
import { PlanSettings } from "./plan-settings";
import { WeekTemplateCard } from "./week-template";
import { VolumeChart } from "./volume-chart";
import { WeekCard } from "./week-card";
import { useSend } from "./use-send";

/** 12-Week Builder: plans, settings, template, the volume chart, then the weeks. */
export function BuilderScreen() {
  const { plan, settings, model } = useApp();
  const { sendIcu, sendCoros, busy, corosReady } = useSend();
  const [confirmAll, setConfirmAll] = useState(false);
  if (!plan || !model) {
    return <Alert><AlertDescription>Enter a valid PB on Profile to build a plan.</AlertDescription></Alert>;
  }
  const warns = templateWarnings(settings.template);
  if (plan.weeks.some((w) => w.tooLow)) warns.push(`Your volume is too low for this template, so some easy runs were raised to the ${dist(MIN_EASY_KM, settings.units)} minimum. Raise the volume or swap an easy day for rest.`);
  const corosItems = plan.weeks.flatMap(dayItems).filter((it) => !corosSent()[dateKey(it.date)]);
  const icuItems = plan.weeks.flatMap((wk) => wk.days.map((_, i) => ({ wk, i }))).filter(({ wk, i }) => wk.days[i].type !== "rest");

  function csv() {
    const rows = [["Week", "Phase", "Date", "Day", "Session", "Distance (km)", "Est. minutes"]];
    plan!.weeks.forEach((wk) => wk.days.forEach((d, i) => rows.push([String(wk.n), wk.phase, isoDate(dayDate(wk, i)), DAYS[i], d.title, d.km ? d.km.toFixed(1) : "", d.sec ? String(Math.round(d.sec / 60)) : ""])));
    const blob = new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "norwegian-singles-run-plan.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[2rem] leading-10 font-black md:text-display">Run plan</h1>
        <p className="max-w-[65ch] text-muted-foreground">
          {plan.weeks.length} weeks in {plan.blocks.length} blocks, {dist(plan.startKm, settings.units, 0)} to {dist(plan.peakKm, settings.units, 0)} a week, three sub-threshold sessions, one long run. Everything else is easy. Set dates, races and time off on Profile.
        </p>
      </section>

      <MyPlans />
      <PlanSettings />

      <WeekTemplateCard />

      {warns.map((w) => <Alert key={w} variant="destructive"><AlertDescription>{w}</AlertDescription></Alert>)}

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
        <h2 className="font-black">Weekly Volume</h2>
        <VolumeChart />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-black">Weeks</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={csv}><Download aria-hidden /> CSV</Button>
            <Button variant="outline" size="sm" disabled={busy === "all-icu"} onClick={() => sendIcu("all-icu", icuItems, "all weeks")}>All to icu</Button>
            {corosReady && (
              <Button size="sm" disabled={busy === "all-coros" || !corosItems.length} onClick={() => setConfirmAll(true)}>
                <Watch aria-hidden /> {corosItems.length ? "All to COROS" : "All in COROS"}
              </Button>
            )}
          </div>
        </div>
        {plan.blocks.map((b) => (
          <div key={b.i} className="flex flex-col gap-4">
            <BlockHeading b={b} />
            {b.weeks.map((wi) => <WeekCard key={wi} wk={plan.weeks[wi]} weeks={plan.weeks} />)}
          </div>
        ))}
      </section>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {corosItems.length} workouts to COROS?</AlertDialogTitle>
            <AlertDialogDescription>
              Days already sent from this device are skipped, and so are dates more than 90 days ahead. Check one workout on your watch first if you haven&apos;t yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendCoros("all-coros", corosItems, "all weeks")}>Add {corosItems.length} workouts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
