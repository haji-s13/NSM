import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar } from "../lib/calendar";
import { buildHyrox, defaultHyrox, type Station, type HxBlock } from "../lib/hyrox";

const ALL: Station[] = ["ski", "push", "pull", "bbj", "row", "farmers", "lunges", "wb"];
const NORMAL = ["strength", "build", "peak", "sharpen", "absorb"];
const SHORT = buildCalendar("2026-01-05", "2026-03-29", [], []);
const LONG = buildCalendar("2026-01-05", "2026-12-27", [], []);

function plan(weak: Station[], cal = SHORT, emphasis: "moderate" | "high" = "moderate") {
  const h = { ...defaultHyrox(), weaknesses: weak, emphasis };
  return buildHyrox(h, cal);
}
const blocksOf = (w: { days: { blocks: HxBlock[] }[] }) => w.days.flatMap((d) => d.blocks);

test("1. weak lunges: changed blocks mention lunges and carry boost", () => {
  for (const cal of [SHORT, LONG]) {
    const a = plan([], cal), b = plan(["lunges"], cal);
    assert.equal(a.weeks.length, b.weeks.length);
    a.weeks.forEach((wa, wi) => {
      const wb = b.weeks[wi];
      if (wa.kind === "bench" || wa.kind === "test") return;
      assert.equal(wa.days.length, wb.days.length);
      wa.days.forEach((da, di) => {
        const db = wb.days[di];
        const pa = da.blocks.filter((x) => !x.weak && !x.acc);
        const pb = db.blocks.filter((x) => !x.weak && !x.acc);
        assert.equal(pa.length, pb.length, `week ${wa.n} day ${di} block count`);
        pa.forEach((x, k) => {
          const y = pb[k];
          if (x.text !== y.text) {
            assert.match(y.text, /lunge/i, `week ${wa.n} day ${di} ${y.label}`);
            assert.ok(y.boost?.includes("lunges"), `week ${wa.n} day ${di} ${y.label} boost`);
          } else assert.ok(!y.boost?.includes("lunges") || /lunge/i.test(y.text));
        });
      });
    });
  }
});

test("2. bench and test weeks identical with and without weaknesses", () => {
  const a = plan([], LONG), b = plan(["lunges", "wb", "push"], LONG);
  let seen = 0;
  a.weeks.forEach((w, i) => {
    if (w.kind !== "bench" && w.kind !== "test") return;
    seen++;
    assert.equal(JSON.stringify(w.days), JSON.stringify(b.weeks[i].days), `week ${w.n}`);
  });
  assert.ok(seen > 0, "no bench/test weeks found");
});

test("3. each weak station is boosted or topped up, never both, per normal week", () => {
  for (const st of ALL) {
    for (const cal of [SHORT, LONG]) {
      for (const w of plan([st], cal).weeks) {
        if (!NORMAL.includes(w.kind)) continue;
        const bl = blocksOf(w);
        const boosted = bl.some((b) => b.boost?.includes(st));
        const topped = bl.some((b) => b.weak === st);
        assert.ok(boosted || topped, `${st} week ${w.n} (${w.kind}) neither`);
        assert.ok(!(boosted && topped), `${st} week ${w.n} (${w.kind}) both`);
      }
    }
  }
});

test("4. at most one top-up block per station per normal week", () => {
  for (const weak of [ALL, ["wb", "lunges", "push"] as Station[]]) {
    for (const w of plan(weak, LONG).weeks) {
      if (!NORMAL.includes(w.kind)) continue;
      for (const st of ALL) {
        const n = blocksOf(w).filter((b) => b.weak === st).length;
        assert.ok(n <= 1, `${st} week ${w.n}: ${n} top-ups`);
      }
    }
  }
});

test("5. boost lists only weak stations", () => {
  for (const weak of [[], ["lunges"], ["wb", "push"], ALL] as Station[][]) {
    for (const w of plan(weak, LONG).weeks)
      for (const b of blocksOf(w))
        for (const s of b.boost ?? []) assert.ok(weak.includes(s), `week ${w.n} ${b.label}: ${s} not weak`);
  }
});

test("6. high emphasis >= moderate >= none for weak station volume", () => {
  for (const st of ALL) {
    const sum = (weak: Station[], e: "moderate" | "high") => plan(weak, LONG, e).weeks.reduce((t, w) => t + (w.vol[st] ?? 0), 0);
    const none = sum([], "moderate"), mod = sum([st], "moderate"), high = sum([st], "high");
    assert.ok(high >= mod, `${st}: high ${high} < moderate ${mod}`);
    assert.ok(mod >= none, `${st}: moderate ${mod} < none ${none}`);
  }
});
