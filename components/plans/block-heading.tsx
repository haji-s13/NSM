import { fmtShortDate } from "@/lib/format";
import { PHASE_NAMES, type CalBlock } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const DOT = { base: "bg-phase-base", build: "bg-phase-build", peak: "bg-phase-peak" } as const;

/** "Block 2 · Build · Dec 21 – Jan 17" above the block's weeks. */
export function BlockHeading({ b }: { b: CalBlock }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b pt-4 pb-2 first:pt-0">
      <span className={cn("size-2 self-center rounded-full", DOT[b.phase])} aria-hidden />
      <h3 className="font-black">Block {b.i + 1}</h3>
      <span className="text-meta uppercase text-muted-foreground">{PHASE_NAMES[b.phase]}</span>
      <span className="num font-extralight text-muted-foreground">{fmtShortDate(b.start)} – {fmtShortDate(b.end)} · {b.weeks.length} week{b.weeks.length === 1 ? "" : "s"}</span>
    </div>
  );
}
