"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/components/app-provider";
import { KM_PER_MI } from "@/lib/format";

/** Distance, time, units and sub-T adjustment. */
export function PbForm() {
  const { settings: s, update, model } = useApp();
  const changeUnits = (v: string) => {
    if (v === s.units) return;
    const conv = v === "mi" ? 1 / KM_PER_MI : KM_PER_MI;
    update({ units: v as "km" | "mi", startVolume: Math.round(s.startVolume * conv), peakVolume: Math.round(s.peakVolume * conv) });
  };
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="pb-distance">PB distance</Label>
        <Select value={s.pbDistance} onValueChange={(v) => update({ pbDistance: v as "5000" | "10000" })}>
          <SelectTrigger id="pb-distance" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5000">5k</SelectItem>
            <SelectItem value="10000">10k</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pb-time">PB time</Label>
        <Input id="pb-time" className="num" inputMode="numeric" autoComplete="off" value={s.pbTime}
          onChange={(e) => update({ pbTime: e.target.value })} placeholder="19:45" aria-invalid={!model} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="units">Units</Label>
        <Select value={s.units} onValueChange={changeUnits}>
          <SelectTrigger id="units" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="km">Kilometres</SelectItem>
            <SelectItem value="mi">Miles</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pace-adjust">Sub-T adjust (s/km)</Label>
        <Input id="pace-adjust" className="num" type="number" inputMode="numeric" step={1} min={-15} max={30}
          value={s.paceAdjust} onChange={(e) => update({ paceAdjust: Number(e.target.value) || 0 })} />
      </div>
      {!model && (
        <p role="alert" className="col-span-full font-black text-status-error">
          Enter a valid time, for example 19:45 for a 5k or 41:30 for a 10k.
        </p>
      )}
    </div>
  );
}
