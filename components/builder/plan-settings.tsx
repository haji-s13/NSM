"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/components/app-provider";
import { KM_PER_MI, dist, unitDist } from "@/lib/format";

const OPEN_KEY = "nsm-settings-collapsed";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2">
        {label}{hint && <span className="font-extralight text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

/** Collapsible settings with a one-line summary when closed. */
export function PlanSettings() {
  const { settings: s, update, plan } = useApp();
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem(OPEN_KEY) !== "1"); } catch { /* ignore */ } }, []);
  const toggle = (o: boolean) => { setOpen(o); try { localStorage.setItem(OPEN_KEY, o ? "0" : "1"); } catch { /* ignore */ } };
  const u = s.units;
  const f = u === "mi" ? 1 / KM_PER_MI : 1;
  const show = (km: number) => Math.round(km * f * 10) / 10;
  const toKm = (v: string) => Math.max(0, Number(v) || 0) / f;
  const num = (v: string) => Number(v) || 0;

  return (
    <Collapsible open={open} onOpenChange={toggle} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-2 p-4 text-left hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring md:px-6">
        <span className="flex items-center gap-2 font-black">
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden /> Plan settings
        </span>
        {!open && (
          <span className="num font-extralight text-muted-foreground">
            {s.startVolume} → {s.peakVolume} {unitDist(u)} · {s.subtShare}% sub-T · WU {dist(s.subtWarmupKm, u)} · CD {dist(s.subtCooldownKm, u)}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-6 border-t p-4 md:p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Field id="start-date" label="Start" hint="week 1 Monday">
              <Input id="start-date" type="date" value={s.startDate} onChange={(e) => update({ startDate: e.target.value })} />
            </Field>
          </div>
          <Field id="start-volume" label="Start volume" hint={`${unitDist(u)}/wk`}>
            <Input id="start-volume" className="num" type="number" inputMode="numeric" min={10} max={250} value={s.startVolume} onChange={(e) => update({ startVolume: num(e.target.value) })} />
          </Field>
          <Field id="peak-volume" label="Peak volume" hint={`${unitDist(u)}/wk`}>
            <Input id="peak-volume" className="num" type="number" inputMode="numeric" min={15} max={250} value={s.peakVolume} onChange={(e) => update({ peakVolume: num(e.target.value) })} />
          </Field>
          <Field id="subt-share" label="Sub-T share" hint="% of volume">
            <Input id="subt-share" className="num" type="number" inputMode="numeric" min={10} max={35} value={s.subtShare} onChange={(e) => update({ subtShare: num(e.target.value) })} />
          </Field>
          <Field id="warmup" label="Warm-up" hint={`${unitDist(u)} · sub-T days`}>
            <Input id="warmup" className="num" type="number" inputMode="decimal" min={0} max={10} step={0.5} value={show(s.subtWarmupKm)} onChange={(e) => update({ subtWarmupKm: toKm(e.target.value) })} />
          </Field>
          <Field id="cooldown" label="Cool-down" hint={`${unitDist(u)} · sub-T days`}>
            <Input id="cooldown" className="num" type="number" inputMode="decimal" min={0} max={10} step={0.5} value={show(s.subtCooldownKm)} onChange={(e) => update({ subtCooldownKm: toKm(e.target.value) })} />
          </Field>
          <Field id="rep-format" label="Rep format">
            <Select value={s.repFormat} onValueChange={(v) => update({ repFormat: v as typeof s.repFormat })}>
              <SelectTrigger id="rep-format" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="distance">Distance (1k / 2k / 3k)</SelectItem>
                <SelectItem value="time">Time (3 / 6 / 10 min)</SelectItem>
                <SelectItem value="mixed">Alternate each week</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="final-week" label="Week 12">
            <Select value={s.finalWeek} onValueChange={(v) => update({ finalWeek: v as typeof s.finalWeek })}>
              <SelectTrigger id="final-week" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="race">Taper + race</SelectItem>
                <SelectItem value="test">Time trial</SelectItem>
                <SelectItem value="normal">Normal week</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <label htmlFor="deloads" className="flex min-h-12 items-center gap-4">
          <Switch id="deloads" checked={s.deloads} onCheckedChange={(v) => update({ deloads: v })} />
          <span>Lighter week every 4th week</span>
        </label>
        {plan && (
          <p className="max-w-[65ch] font-extralight text-muted-foreground">
            Starts at {dist(plan.startKm, u, 0)} and {plan.peakWeek ? `reaches your ${dist(plan.peakKm, u, 0)} peak in week ${plan.peakWeek}` : `reaches ${dist(Math.max(...plan.weeks.filter((w) => !w.deload && !w.taper).map((w) => w.targetKm)), u, 0)} by week 11, short of your ${dist(plan.peakKm, u, 0)} peak at 5% a week`}. Volume rises at most 5% a week over the last full week; lighter weeks drop to 80%.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
