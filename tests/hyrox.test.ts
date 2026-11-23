import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHyrox, moveOffDoubles, defaultHyrox, type HxSlot, type RunDay } from "../lib/hyrox";
import { buildCalendar } from "../lib/calendar";
import { buildPlan } from "../lib/plan";
import { defaultSettings } from "../lib/settings";
import { buildModel } from "../lib/vdot";

const T: HxSlot[] = ["aerobic", "lower", "off", "upper", "off", "quality", "off"];
const days = (...on: number[]) => Array.from({ length: 7 }, (_, i) => on.includes(i));

test("default template with doubles Tue+Thu", () => {
  const want = ["lower", "off", "aerobic", "off", "upper", "quality", "off"];
  assert.deepEqual(moveOffDoubles(T, days(1, 3)), want);
  assert.deepEqual(moveOffDoubles(T, days(1, 3), [], days(1, 3, 5)), want);
});

test("single double moves to nearest rested free day", () => {
  assert.deepEqual(moveOffDoubles(T, days(1), [], days(1, 3, 5)), ["lower", "off", "aerobic", "upper", "off", "quality", "off"]);
});

test("fresh slot prefers a rested day over a nearer post-hard free day", () => {
  const t: HxSlot[] = ["off", "off", "lower", "off", "off", "off", "off"];
  // Wed (2) is a double. Thu (3) follows it and Tue (1) follows hard Mon; Fri (4) follows easy Thu.
  assert.deepEqual(moveOffDoubles(t, days(2), [], days(0, 2)), ["off", "off", "off", "off", "lower", "off", "off"]);
  // Mon not hard: Tue (1) is rested and nearer than Fri.
  assert.deepEqual(moveOffDoubles(t, days(2), [], days(2)), ["off", "lower", "off", "off", "off", "off", "off"]);
});

test("rest rule wraps Sunday to Monday", () => {
  const t: HxSlot[] = ["off", "off", "off", "off", "off", "lower", "off"];
  // Sat (5) double. Mon (0) follows hard Sun so it is not rested; Fri (4) is.
  assert.deepEqual(moveOffDoubles(t, days(5), [], days(5, 6)), ["off", "off", "off", "off", "lower", "off", "off"]);
  // Only Sun (follows the double) and Mon (follows hard Sun) are open: no rested day, nearest free day (Sun).
  const blocked = [false, true, true, true, true, false, false];
  assert.deepEqual(moveOffDoubles(t, days(5), blocked, days(5, 6)), ["off", "off", "off", "off", "off", "off", "lower"]);
  // Sun easy, Sat double: Mon follows easy Sun so it is rested and wins over nearer Sun.
  assert.deepEqual(moveOffDoubles(t, days(5), blocked, days(5)), ["lower", "off", "off", "off", "off", "off", "off"]);
});

test("fresh slot displaces an aerobic session, which is re-placed on the nearest free day", () => {
  const t: HxSlot[] = ["off", "off", "off", "lower", "off", "aerobic", "off"];
  const blocked = [false, false, true, false, false, false, false];
  assert.deepEqual(moveOffDoubles(t, days(3), blocked), ["off", "off", "off", "off", "off", "lower", "aerobic"]);
});

test("fresh slot falls back to a post-hard day when no rested day exists", () => {
  const t: HxSlot[] = ["off", "off", "off", "lower", "off", "off", "off"];
  assert.deepEqual(moveOffDoubles(t, days(3), [], days(0, 1, 2, 3, 4, 5, 6)), ["off", "off", "off", "off", "lower", "off", "off"]);
});

test("non-fresh slots (upper, aerobic) ignore the rest rule", () => {
  for (const slot of ["upper", "aerobic"] as const) {
    const t: HxSlot[] = ["off", "off", "off", slot, "off", "off", "off"];
    // Fri (4) follows the double but is still the nearest free day (later on tie).
    assert.deepEqual(moveOffDoubles(t, days(3), [], days(3)), ["off", "off", "off", "off", slot, "off", "off"]);
  }
  // A fresh slot in the same spot goes to Tue (2) is not rested? Tue follows easy Mon, so it is rested; Fri is not.
  const t: HxSlot[] = ["off", "off", "off", "lower", "off", "off", "off"];
  assert.deepEqual(moveOffDoubles(t, days(3), [], days(3)), ["off", "off", "lower", "off", "off", "off", "off"]);
});

test("no doubles or doubles on off days leaves template unchanged", () => {
  assert.deepEqual(moveOffDoubles(T, days()), T);
  assert.deepEqual(moveOffDoubles(T, days(2, 4, 6)), T);
});

test("tie goes to the later day", () => {
  const t: HxSlot[] = ["off", "off", "off", "upper", "off", "off", "off"];
  assert.deepEqual(moveOffDoubles(t, days(3)), ["off", "off", "off", "off", "upper", "off", "off"]);
});

test("blocked days are skipped", () => {
  const t: HxSlot[] = ["off", "off", "off", "lower", "off", "off", "off"];
  const blocked = [false, false, false, false, true, false, false];
  assert.deepEqual(moveOffDoubles(t, days(3), blocked), ["off", "off", "lower", "off", "off", "off", "off"]);
});

test("session is dropped when nowhere to go", () => {
  const t: HxSlot[] = ["off", "off", "off", "lower", "off", "off", "off"];
  const all = days(0, 1, 2, 3, 4, 5, 6);
  assert.deepEqual(moveOffDoubles(t, all), Array(7).fill("off"));
  const blocked = [true, true, true, false, true, true, true];
  assert.deepEqual(moveOffDoubles(t, days(3), blocked), Array(7).fill("off"));
});

test("does not mutate inputs and returns a new array", () => {
  const t = T.slice(), d = days(1, 3), b = days(0);
  const out = moveOffDoubles(t, d, b);
  assert.notEqual(out, t);
  assert.deepEqual(t, T);
  assert.deepEqual(d, days(1, 3));
  assert.deepEqual(b, days(0));
});

const cal = buildCalendar("2026-01-05", "2026-03-29", [{ id: "r", date: "2026-02-08", name: "Race", kind: "hyrox" }], [{ id: "v", start: "2026-02-16", end: "2026-02-22" }]);
const runDay = (...d: number[]): RunDay[] => Array.from({ length: 7 }, (_, i) => (d.includes(i) ? "double" : "easy"));
const doubleWeeks = cal.weeks.map(() => runDay(1, 3));

test("buildHyrox keeps sessions off double days", () => {
  const h = defaultHyrox();
  const plan = buildHyrox(h, cal, undefined, doubleWeeks);
  let checked = 0;
  for (const wk of plan.weeks) {
    const cw = cal.weeks[wk.n - 1] ?? cal.weeks.find((c) => c.i === wk.n - 1)!;
    if (cw.role === "race" || cw.role === "vacation") continue;
    wk.days.forEach((d, i) => {
      if (d.type !== "off") { assert.notEqual(doubleWeeks[cw.i][i], "double", `week ${wk.n} day ${i} (${d.type})`); checked++; }
    });
  }
  assert.ok(checked > 0);
});

test("buildHyrox without doubles equals the original template, and empty doubles match it", () => {
  const h = defaultHyrox();
  const base = buildHyrox(h, cal);
  assert.deepEqual(buildHyrox(h, cal, undefined, undefined), base);
  assert.deepEqual(buildHyrox(h, cal, undefined, cal.weeks.map(() => runDay())), base);
  for (const wk of base.weeks) {
    const cw = cal.weeks[wk.n - 1];
    if (cw.role !== "load" && cw.role !== "taper") continue;
    const types = wk.days.map((d) => d.type);
    h.template.forEach((s, i) => { if (!cw.off[i] && !(i === 0 && cw.afterRace) && s === "off") assert.equal(types[i], "off"); });
  }
});

test("race and vacation weeks are unaffected by doubles", () => {
  const h = defaultHyrox();
  const a = buildHyrox(h, cal), b = buildHyrox(h, cal, undefined, doubleWeeks);
  cal.weeks.forEach((cw, i) => {
    if (cw.role === "race" || cw.role === "vacation") assert.deepEqual(b.weeks[i].days, a.weeks[i].days);
  });
});

test("vacation days and the day after a race are not used as destinations", () => {
  const c = buildCalendar("2026-01-05", "2026-03-29", [{ id: "r", date: "2026-01-18", name: "Race", kind: "hyrox" }], [{ id: "v", start: "2026-02-04", end: "2026-02-04" }]);
  const h = defaultHyrox();
  const out = buildHyrox(h, c, undefined, c.weeks.map(() => runDay(1, 3)));
  const after = c.weeks.find((w) => w.afterRace)!;
  const sessions = ["aerobic", "lower", "upper", "quality", "quality_short"];
  assert.ok(!sessions.includes(out.weeks[after.i].days[0].type), out.weeks[after.i].days[0].type);
  const vw = c.weeks.find((w) => w.role === "load" && w.off[2])!;
  assert.ok(!sessions.includes(out.weeks[vw.i].days[2].type), out.weeks[vw.i].days[2].type);
});

test("Bakken run plan doubles drive HYROX placement", () => {
  const s = defaultSettings();
  s.startDate = "2026-01-05";
  s.endDate = "2026-03-29";
  s.runMethod = "bakken";
  s.races = [{ id: "r", date: "2026-03-28", name: "Race", kind: "hyrox" }];
  const calendar = buildCalendar(s.startDate, s.endDate, s.races, s.vacations);
  const model = buildModel(s.pbDistance, s.pbTime, s.paceAdjust);
  assert.ok(model);
  const plan = buildPlan(s, model, calendar);
  const HARD_RUN = ["double", "single", "x", "race"];
  const runDays = plan.weeks.map((w) => w.days.map((d): RunDay => (d.type === "double" ? "double" : HARD_RUN.includes(d.type) ? "hard" : "easy")));
  const doubles = runDays.map((w) => w.map((r) => r === "double"));
  assert.ok(doubles.some((w) => w.some(Boolean)), "bakken plan should have double days");
  const hx = buildHyrox(s.hyrox, calendar, undefined, runDays);
  let moved = 0;
  hx.weeks.forEach((wk, i) => {
    const cw = calendar.weeks[i];
    if (cw.role === "race" || cw.role === "vacation") return;
    wk.days.forEach((d, j) => { if (d.type !== "off") assert.equal(doubles[i][j], false, `week ${i + 1} day ${j}`); });
    if (wk.days.some((d, j) => doubles[i][j] && s.hyrox.template[j] !== "off")) moved++;
  });
  assert.ok(moved > 0, "at least one week should have had a clash to resolve");
  // Rest rule: a lower/quality day that follows a hard run day only happens if no rested open day was available.
  let restedChecked = 0;
  hx.weeks.forEach((wk, i) => {
    const cw = calendar.weeks[i];
    if (cw.role === "race" || cw.role === "vacation") return;
    const prevHard = (j: number) => runDays[i][(j + 6) % 7] !== "easy";
    wk.days.forEach((d, j) => {
      if (!["lower", "quality", "quality_short"].includes(d.type)) return;
      restedChecked++;
      if (!prevHard(j)) return;
      const blocked = cw.off[j] || false;
      assert.ok(!blocked);
      const alt = wk.days.some((o, k) => !doubles[i][k] && !cw.off[k] && !(k === 0 && cw.afterRace) && !prevHard(k) && (o.type === "off" || o.type === "aerobic"));
      assert.ok(!alt, `week ${i + 1} day ${j} (${d.type}) follows a hard run although a rested day was free`);
    });
  });
  assert.ok(restedChecked > 0);
});
