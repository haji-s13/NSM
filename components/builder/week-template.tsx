"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/components/app-provider";
import { DAYS, SESSION_LABELS, type SessionType } from "@/lib/settings";

/** Which session goes on which day. */
export function WeekTemplate() {
  const { settings, update } = useApp();
  const set = (i: number, v: SessionType) => {
    const t = settings.template.slice();
    t[i] = v;
    update({ template: t });
  };
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7 lg:gap-4">
      {DAYS.map((d, i) => (
        <div key={d} className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2 lg:flex lg:flex-col lg:items-stretch">
          <Label htmlFor={`tmpl-${i}`} className="text-meta uppercase text-muted-foreground">{d}</Label>
          <Select value={settings.template[i]} onValueChange={(v) => set(i, v as SessionType)}>
            <SelectTrigger id={`tmpl-${i}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SESSION_LABELS) as SessionType[]).map((k) => (
                <SelectItem key={k} value={k}>{SESSION_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
