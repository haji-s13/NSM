"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { useApp } from "@/components/app-provider";
import { KM_PER_MI, dist, fmtDuration, unitDist } from "@/lib/format";
import { changeVsLastFull, type Week } from "@/lib/plan";
import { useChartWindow } from "@/components/plans/chart-window";

const config = {
  base: { label: "Base", color: "var(--phase-base)" },
  build: { label: "Build", color: "var(--phase-build)" },
  peak: { label: "Peak", color: "var(--phase-peak)" },
  trial: { label: "Race / trial", color: "var(--phase-trial)" },
} satisfies ChartConfig;

/** Bar with 4px rounded top corners anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

interface Row { label: string; value: number; hours: string; wk: Week; index: number }

/** Weekly volume by phase, lighter weeks hatched, peak target line, hours under each week. */
export function VolumeChart() {
  const { plan, settings } = useApp();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const win = useChartWindow(plan?.weeks ?? []);
  if (!plan) return null;
  const u = settings.units;
  const toU = (km: number) => (u === "mi" ? km / KM_PER_MI : km);
  const shown = plan.weeks.slice(win.start, win.end);
  const rows: Row[] = shown.map((wk, j) => ({ index: win.start + j,
    label: `W${wk.n}`, value: Math.round(toU(wk.totalKm) * 10) / 10,
    hours: (wk.totalSec / 3600).toFixed(1), wk,
  }));
  const peak = Math.round(toU(plan.peakKm));
  const total = shown.reduce((t, w) => t + w.totalKm, 0);
  const subt = shown.reduce((t, w) => t + w.subtKm, 0);
  const time = shown.reduce((t, w) => t + w.totalSec, 0);
  const showTrial = shown.some((w) => w.phaseKey === "trial");
  const n = shown.length;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground" aria-label="Legend">
        {(["base", "build", "peak", ...(showTrial ? ["trial"] : [])] as (keyof typeof config)[]).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: config[k].color }} aria-hidden />{config[k].label}
          </li>
        ))}
        <li className="flex items-center gap-2"><span className="hatch size-3 rounded-sm border border-muted-foreground" aria-hidden />Lighter or taper week</li>
        <li className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden />Peak target</li>
      </ul>

      {win.controls}
      {narrow && <p className="-mb-2 text-meta uppercase text-muted-foreground">Week · hours under each bar</p>}
      <ChartContainer config={config} className="aspect-auto h-64 w-full md:h-72">
        <BarChart data={rows} margin={{ top: 24, right: 8, left: -16, bottom: 0 }} accessibilityLayer>
          <defs>
            <pattern id="hatch-lighter" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2.5" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <YAxis tickLine={false} axisLine={false} width={40} className="num" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} height={40}
            tick={({ x, y, payload, index }) => (
              <g transform={`translate(${x},${y})`}>
                <text dy={12} textAnchor="middle" className="fill-muted-foreground text-meta">{narrow ? rows[index]?.wk.n : payload.value}</text>
                <text dy={28} textAnchor="middle" className="num fill-muted-foreground" fontSize={narrow ? 9 : 11}>{rows[index]?.hours}{narrow ? "" : "h"}</text>
              </g>
            )} />
          <ReferenceLine y={peak} stroke="var(--muted-foreground)" strokeDasharray="5 4"
            label={{ value: `Peak ${peak} ${unitDist(u)}`, position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }} />
          <ChartTooltip cursor={{ fill: "var(--accent)" }} content={({ active, payload }) => {
            const r = active && payload?.[0]?.payload as Row | undefined;
            if (!r) return null;
            const ch = changeVsLastFull(plan.weeks, r.index);
            return (
              <div className="rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                <p className="font-black">Week {r.wk.n} · {r.wk.phase}</p>
                <p className="num">{dist(r.wk.totalKm, u, 0)} · ~{fmtDuration(r.wk.totalSec)}</p>
                <p className="text-muted-foreground">{r.wk.vacation ? "Vacation week" : r.wk.deload ? "Lighter week" : ch !== null ? `${ch > 0 ? "+" : ""}${ch}% vs last full week` : r.wk.taper ? "Taper week" : "First week"}</p>
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
                  <path d={d} fill={payload.wk.vacation ? "var(--muted-foreground)" : `var(--phase-${payload.wk.phaseKey})`} opacity={payload.wk.vacation ? 0.35 : 1} />
                  {(payload.wk.deload || payload.wk.taper && payload.wk.phaseKey !== "trial") && <path d={d} fill="url(#hatch-lighter)" />}
                </g>
              );
            }}>
            <LabelList dataKey="value" position="top" className="num fill-foreground" fontSize={11}
              formatter={(v: unknown) => Math.round(Number(v))} />
          </Bar>
        </BarChart>
      </ChartContainer>

      <dl className="grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4">
        {[
          [`${n}-week total`, dist(total, u, 0)],
          ["Weekly average", dist(total / n, u, 0)],
          ["Avg time / week", fmtDuration(time / n)],
          ["Sub-T reps", `${dist(subt, u, 0)} · ${Math.round((subt / total) * 100)}%`],
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
