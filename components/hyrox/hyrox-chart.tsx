"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { useApp } from "@/components/app-provider";
import { fmtDuration } from "@/lib/format";
import { fmtVol, STATIONS, type HxWeek } from "@/lib/hyrox";
import { cn } from "@/lib/utils";

const config = {
  base: { label: "Strength", color: "var(--phase-base)" },
  build: { label: "Station build", color: "var(--phase-build)" },
  peak: { label: "Race specific", color: "var(--phase-peak)" },
  trial: { label: "Race / test", color: "var(--phase-trial)" },
} satisfies ChartConfig;

function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

interface Row { label: string; value: number; wk: HxWeek }

/** Weekly station-session hours by phase, then whole-plan volume per station with weak stations marked. */
export function HyroxChart() {
  const { hyrox, settings } = useApp();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const weak = settings.hyrox.weaknesses;
  const rows: Row[] = hyrox.weeks.map((wk) => ({ label: `W${wk.n}`, value: Math.round((wk.totalMin / 60) * 10) / 10, wk }));
  const showTrial = hyrox.weeks.some((w) => w.phaseKey === "trial");
  const nW = hyrox.weeks.length;
  const multiples = STATIONS.map((s) => ({ s, v: hyrox.vol[s.key] || 0, x: (hyrox.vol[s.key] || 0) / s.race }));
  const maxX = Math.max(...multiples.map((m) => m.x), 1);

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground" aria-label="Legend">
        {(["base", "build", "peak", ...(showTrial ? ["trial"] : [])] as (keyof typeof config)[]).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: config[k].color }} aria-hidden />{config[k].label}
          </li>
        ))}
        <li className="flex items-center gap-2"><span className="hatch size-3 rounded-sm border border-muted-foreground" aria-hidden />Absorb or race week</li>
      </ul>

      <ChartContainer config={config} className="aspect-auto h-56 w-full md:h-64">
        <BarChart data={rows} margin={{ top: 24, right: 8, left: -16, bottom: 0 }} accessibilityLayer>
          <defs>
            <pattern id="hatch-hx" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2.5" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <YAxis tickLine={false} axisLine={false} width={40} className="num" unit="h" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0}
            tickFormatter={(v: string, i: number) => (narrow ? String(i + 1) : v)} className="text-meta" />
          <ChartTooltip cursor={{ fill: "var(--accent)" }} content={({ active, payload }) => {
            const r = active && payload?.[0]?.payload as Row | undefined;
            if (!r) return null;
            return (
              <div className="rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                <p className="font-black">Week {r.wk.n} · {r.wk.phase}</p>
                <p className="num">~{fmtDuration(r.wk.totalMin * 60)} · {r.wk.sessions} sessions</p>
              </div>
            );
          }} />
          <Bar dataKey="value" isAnimationActive={false}
            shape={(props: unknown) => {
              const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: Row };
              if (!height || height <= 0) return <g />;
              const d = barPath(x, y, width, height);
              return (
                <g>
                  <path d={d} fill={`var(--phase-${payload.wk.phaseKey})`} />
                  {payload.wk.light && <path d={d} fill="url(#hatch-hx)" />}
                </g>
              );
            }}>
            <LabelList dataKey="value" position="top" className="num fill-foreground" fontSize={11} />
          </Bar>
        </BarChart>
      </ChartContainer>

      <div className="flex flex-col gap-2 border-t pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-meta uppercase text-muted-foreground">{nW}-week station volume</h3>
          <p className="text-meta text-muted-foreground">× race distance</p>
        </div>
        <ul className="flex flex-col gap-2">
          {multiples.map(({ s, v, x }) => {
            const isWeak = weak.includes(s.key);
            return (
              <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[180px_minmax(0,1fr)_200px]">
                <span className={cn("min-w-0 truncate", isWeak && "font-black")}>
                  {s.label}{isWeak && <span className="ml-2 text-meta uppercase text-signal">weak</span>}
                </span>
                <span className="num text-right text-muted-foreground md:order-3">{fmtVol(s.key, v)} · <span className="text-foreground">{x.toFixed(0)}×</span></span>
                <span className="col-span-2 h-2 rounded-full bg-muted md:order-2 md:col-span-1" aria-hidden>
                  <span className={cn("block h-2 rounded-full", isWeak ? "bg-signal" : "bg-primary")} style={{ width: `${(x / maxX) * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4">
        {[
          [`${nW}-week total`, fmtDuration(hyrox.totalMin * 60)],
          ["Avg time / week", fmtDuration((hyrox.totalMin * 60) / nW)],
          ["Sessions", String(hyrox.weeks.reduce((t, w) => t + w.sessions, 0))],
          ["Weak stations", weak.length ? `${weak.length} · +${settings.hyrox.emphasis === "high" ? 50 : 25}%` : "None"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-meta uppercase text-muted-foreground">{k}</dt>
            <dd className="num text-[1.25rem] leading-8 font-black">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
