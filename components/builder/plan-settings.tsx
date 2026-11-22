"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/components/app-provider";
import { KM_PER_MI, dist, fmtShortDate, unitDist } from "@/lib/format";
import { periodVolume } from "@/lib/settings";

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
  const { settings: s, update, plan, calendar } = useApp();
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
            {calendar.periods.map((p) => { const v = periodVolume(s, p.i); return v.ramp ? `${v.start}→${v.peak}` : `${v.start}`; }).join(" · ")} {unitDist(u)} · {s.subtShare}% sub-T · WU {dist(s.subtWarmupKm, u)} · CD {dist(s.subtCooldownKm, u)}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-6 border-t p-4 md:p-6">
        <section className="flex flex-col gap-2">
          <h3 className="font-black">Mileage by period</h3>
          <p className="max-w-[65ch] font-extralight text-muted-foreground">
            Switch on Ramp up for the periods you want to build mileage in: they go from start to peak at most 5% a week. Other periods hold a steady volume.
          </p>
          <ul className="flex flex-col gap-2">
            {calendar.periods.map((p) => {
              const v = periodVolume(s, p.i);
              const info = plan?.periods[p.i];
              const setP = (patch: { ramp?: boolean; start?: number; peak?: number }) => {
                // Built from the latest settings, so quick edits can't overwrite each other.
                update((cur) => {
                  const pv = (cur.periodVolumes || []).slice();
                  if (p.i === 0) {
                    if (patch.ramp !== undefined) pv[0] = { ...(pv[0] || {}), ramp: patch.ramp };
                    return { periodVolumes: pv, ...(patch.start !== undefined && { startVolume: patch.start }), ...(patch.peak !== undefined && { peakVolume: patch.peak }) };
                  }
                  const now = periodVolume(cur, p.i);
                  pv[p.i] = { ...(pv[p.i] || {}), ...(patch.ramp !== undefined && { ramp: patch.ramp, start: now.start, peak: now.peak }), ...(patch.start !== undefined && { start: patch.start }), ...(patch.peak !== undefined && { peak: patch.peak }) };
                  return { periodVolumes: pv };
                });
              };
              return (
                <li key={p.i} className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-2 md:grid-cols-[200px_140px_140px_minmax(0,1fr)] md:items-end md:p-3">
                  <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 md:col-span-4">
                    <p>
                      <span className="font-black">Period {p.i + 1}</span>{" "}
                      <span className="num font-extralight text-muted-foreground">{fmtShortDate(p.start)} – {fmtShortDate(p.end)}</span>
                    </p>
                    <label htmlFor={`pv-ramp-${p.i}`} className="flex min-h-12 items-center gap-2 md:min-h-10">
                      <Switch id={`pv-ramp-${p.i}`} checked={v.ramp} onCheckedChange={(on) => setP({ ramp: on })} />
                      <span>Ramp up</span>
                    </label>
                  </div>
                  {v.ramp ? (
                    <>
                      <Field id={`pv-start-${p.i}`} label="Start" hint={`${unitDist(u)}/wk`}>
                        <Input id={`pv-start-${p.i}`} className="num" type="number" inputMode="numeric" min={10} max={250} value={v.start} onChange={(e) => setP({ start: num(e.target.value) })} />
                      </Field>
                      <Field id={`pv-peak-${p.i}`} label="Peak" hint={`${unitDist(u)}/wk`}>
                        <Input id={`pv-peak-${p.i}`} className="num" type="number" inputMode="numeric" min={15} max={250} value={v.peak} onChange={(e) => setP({ peak: num(e.target.value) })} />
                      </Field>
                    </>
                  ) : (
                    <Field id={`pv-hold-${p.i}`} label="Hold at" hint={`${unitDist(u)}/wk`}>
                      <Input id={`pv-hold-${p.i}`} className="num" type="number" inputMode="numeric" min={10} max={250} value={v.start} onChange={(e) => setP({ start: num(e.target.value) })} />
                    </Field>
                  )}
                  {info && (
                    <p className="col-span-2 font-extralight text-muted-foreground md:col-span-1 md:self-center">
                      {!v.ramp ? "Steady volume, lighter every 4th week" : info.peakWeek ? `Peak in week ${info.peakWeek}` : info.maxKm ? `Reaches ${dist(info.maxKm, u, 0)}, short of the peak at 5% a week` : "Only taper, race or lighter weeks"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
          <Field id="final-week" label="Last week" hint="if no race">
            <Select value={s.finalWeek === "race" ? "test" : s.finalWeek} onValueChange={(v) => update({ finalWeek: v as typeof s.finalWeek })}>
              <SelectTrigger id="final-week" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Taper + time trial</SelectItem>
                <SelectItem value="normal">Normal week</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <label htmlFor="deloads" className="flex min-h-12 items-center gap-4">
          <Switch id="deloads" checked={s.deloads} onCheckedChange={(v) => update({ deloads: v })} />
          <span>Lighter week at the end of each 4-week block</span>
        </label>
        {plan && (
          <p className="max-w-[65ch] font-extralight text-muted-foreground">
            Volume rises at most 5% a week over the last full week; lighter weeks drop to 80%, the week before a race to 85% and race weeks to 65%. The first week back from a vacation holds instead of rising.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
