"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

const SHORT: Record<SessionType, string> = {
  rest: "Rest", easy: "Easy", short: "Sub-T short", medium: "Sub-T medium",
  long: "Sub-T long", hills: "Hills", longrun: "Long run",
};
const OPEN_KEY = "nsm-template-collapsed";

/** Weekly template in a collapsible card, with a one-line week summary when closed. */
export function WeekTemplateCard() {
  const { settings } = useApp();
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem(OPEN_KEY) !== "1"); } catch { /* ignore */ } }, []);
  const toggle = (o: boolean) => { setOpen(o); try { localStorage.setItem(OPEN_KEY, o ? "0" : "1"); } catch { /* ignore */ } };
  return (
    <Collapsible open={open} onOpenChange={toggle} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-2 p-4 text-left hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring md:px-6">
        <span className="flex items-center gap-2 font-black">
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden /> Weekly template
        </span>
        {!open && (
          <span className="flex flex-wrap gap-x-2 font-extralight text-muted-foreground">
            {DAYS.map((d, i) => (
              <span key={d} className="whitespace-nowrap">{d} {SHORT[settings.template[i]]}{i < 6 ? " ·" : ""}</span>
            ))}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 border-t p-4 md:p-6">
        <WeekTemplate />
        <p className="font-extralight text-muted-foreground">Put an easy day between sub-threshold sessions. Most of your volume should be easy running.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
