"use client";

import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/components/app-provider";
import { STATIONS, type Station } from "@/lib/hyrox";
import { cn } from "@/lib/utils";

/** Pick weak stations: each gets more volume and one extra block a week. Runs are left to the run plan. */
export function WeakStations() {
  const { settings, updateHyrox } = useApp();
  const h = settings.hyrox;
  const toggle = (st: Station) => updateHyrox({
    weaknesses: h.weaknesses.includes(st) ? h.weaknesses.filter((x) => x !== st) : STATIONS.map((s) => s.key).filter((k) => k === st || h.weaknesses.includes(k)),
  });
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-black">Weak stations</h2>
        <p className="max-w-[65ch] font-extralight text-muted-foreground">
          Each one you pick gets more sets in its regular work and one extra block a week, matched to the phase: strength, then capacity, then race-specific.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Weak stations">
        {STATIONS.map((s, i) => {
          const on = h.weaknesses.includes(s.key);
          return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => toggle(s.key)}
              className={cn("flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring md:min-h-10",
                on ? "border-signal bg-signal-soft text-foreground" : "hover:bg-accent/60")}>
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-sm border", on ? "border-signal bg-signal text-signal-foreground" : "border-muted-foreground")}>
                {on && <Check className="size-4" aria-hidden />}
              </span>
              <span className="min-w-0"><span className="num mr-1 text-muted-foreground">{i + 1}</span>{s.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 sm:max-w-xs">
        <Label htmlFor="hx-emphasis">Extra volume on weak stations</Label>
        <Select value={h.emphasis} onValueChange={(v) => updateHyrox({ emphasis: v as typeof h.emphasis })}>
          <SelectTrigger id="hx-emphasis" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="moderate">Moderate (+25%)</SelectItem>
            <SelectItem value="high">High (+50%)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
