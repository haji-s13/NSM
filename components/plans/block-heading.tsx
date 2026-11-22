import { fmtShortDate } from "@/lib/format";
import type { CalBlock, CalPeriod } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const DOT = ["bg-phase-base", "bg-phase-build", "bg-phase-peak"] as const;

/** "Period 1 · weeks 1–12 · Nov 23 – Feb 14" above a period's blocks. */
export function PeriodHeading({ p }: { p: CalPeriod }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-hero px-4 py-2 text-hero-foreground md:px-6">
      <h3 className="font-display text-[1.25rem] leading-8 font-black">Period {p.i + 1}</h3>
      <span className="num font-extralight text-hero-muted">
        Weeks {p.weeks[0] + 1}–{p.weeks[p.weeks.length - 1] + 1} · {fmtShortDate(p.start)} – {fmtShortDate(p.end)} · {p.blocks.length} block{p.blocks.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/** "Block 2 · Dec 21 – Jan 17 · 4 weeks" above the block's weeks. */
export function BlockHeading({ b }: { b: CalBlock }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b pt-2 pb-2">
      <span className={cn("size-2 self-center rounded-full", DOT[b.pos])} aria-hidden />
      <h4 className="font-black">Block {b.pos + 1}</h4>
      <span className="num font-extralight text-muted-foreground">{fmtShortDate(b.start)} – {fmtShortDate(b.end)} · {b.weeks.length} week{b.weeks.length === 1 ? "" : "s"}</span>
    </div>
  );
}
