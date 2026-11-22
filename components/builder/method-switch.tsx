"use client";

import { useApp } from "@/components/app-provider";
import type { RunMethod } from "@/lib/settings";
import { cn } from "@/lib/utils";

const OPTIONS: { value: RunMethod; label: string; hint: string }[] = [
  { value: "singles", label: "Norwegian Singles", hint: "Three sub-threshold sessions" },
  { value: "bakken", label: "Norwegian Method", hint: "Marius Bakken · double threshold + X" },
];

/** Slide switch between the two run plan methods. The whole plan follows the choice. */
export function MethodSwitch() {
  const { settings, update } = useApp();
  const idx = OPTIONS.findIndex((o) => o.value === settings.runMethod);
  return (
    <div className="relative grid grid-cols-2 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Run plan method">
      <span aria-hidden className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-card transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${idx * 100}%)` }} />
      {OPTIONS.map((o) => {
        const on = o.value === settings.runMethod;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => update({ runMethod: o.value })}
            className={cn("relative z-10 flex min-h-14 flex-col items-center justify-center rounded-md px-2 py-1 text-center focus-visible:outline-2 focus-visible:outline-ring",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <span className={on ? "font-black" : ""}>{o.label}</span>
            <span className="text-meta">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
