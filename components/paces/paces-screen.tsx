"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/components/app-provider";
import { PbForm } from "./pb-form";
import { RaceTable } from "./race-table";
import { PaceTable } from "./pace-table";

/** Predicted Paces: the VDOT is the one hero figure on this screen. */
export function PacesScreen() {
  const { model, settings } = useApp();
  return (
    <div className="flex flex-col gap-8">
      <section className="grid items-end gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-16">
        <div>
          <p className="text-meta uppercase text-muted-foreground">Your VDOT</p>
          <p className="num text-[6rem] leading-[6rem] font-extralight text-signal md:text-hero">
            {model ? model.vdot.toFixed(1) : "–"}
          </p>
        </div>
        <div className="min-w-0 pb-2">
          <h1 className="font-display text-[2rem] leading-10 font-black md:text-display">Predicted paces</h1>
          <p className="max-w-[65ch] text-muted-foreground">
            From your {settings.pbDistance === "10000" ? "10k" : "5k"} PB, using Jack Daniels&apos; VDOT formula. Every pace is a range: the fast end is the most you should push.
          </p>
        </div>
      </section>

      <Card className="gap-4 py-6">
        <CardContent className="px-4 md:px-6"><PbForm /></CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="gap-2 py-6">
          <CardHeader className="px-4 md:px-6"><CardTitle className="text-meta uppercase">Race predictions</CardTitle></CardHeader>
          <CardContent className="px-4 md:px-6"><RaceTable /></CardContent>
        </Card>
        <Card className="gap-2 py-6">
          <CardHeader className="px-4 md:px-6"><CardTitle className="text-meta uppercase">Training paces</CardTitle></CardHeader>
          <CardContent className="px-4 md:px-6">
            <PaceTable />
            <p className="mt-4 max-w-[65ch] font-extralight text-muted-foreground">
              Reps should feel controlled, and you should finish every session feeling you could do one more. Heart rate and lactate matter more than the watch.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
