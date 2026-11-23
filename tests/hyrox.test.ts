import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHyrox, moveOffDoubles, defaultHyrox, type HxSlot } from "../lib/hyrox";
import { buildCalendar } from "../lib/calendar";
import { buildPlan } from "../lib/plan";
import { defaultSettings } from "../lib/settings";
import { buildModel } from "../lib/vdot";

const T: HxSlot[] = ["aerobic", "lower", "off", "upper", "off", "quality", "off"];
const days = (...on: number[]) => Array.from({ length: 7 }, (_, i) => on.includes(i));

test("default template with doubles Tue+Thu", () => {
  assert.deepEqual(moveOffDoubles(T, days(1, 3)), ["aerobic", "off", "lower", "off", "upper", "quality", "off"]);
});

test("single double moves to nearest free day", () => {
  assert.deepEqual(moveOffDoubles(T, days(1)), ["aerobic", "off", "lower", "upper", "off", "quality", "off"]);
});

test("no doubles or doubles on off days leaves template unchanged", () => {
  assert.deepEqual(moveOffDoubles(T, days()), T);
  assert.deepEqual(moveOffDoubles(T, days(2, 4, 6)), T);
});

test("tie goes to the later day", () => {
  const t: HxSlot[] = ["off", "off", "off", "lower", "off", "off", "off"];
  assert.deepEqual(moveOffDoubles(t, days(3)), ["off", "off", "off", "off", "lower", "off", "off"]);
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
const doubleWeeks = cal.weeks.map(() => days(1, 3));

test("buildHyrox keeps sessions off double days", () => {
  const h = defaultHyrox();
  const plan = buildHyrox(h, cal, undefined, doubleWeeks);
  let checked = 0;
  for (const wk of plan.weeks) {
    const cw = cal.weeks[wk.n - 1] ?? cal.weeks.find((c) => c.i === wk.n - 1)!;
    if (cw.role === "race" || cw.role === "vacation") continue;
    wk.days.forEach((d, i) => {
      if (d.type !== "off") { assert.equal(doubleWeeks[cw.i][i], false, `week ${wk.n} day ${i} (${d.type})`); checked++; }
    });
  }
  assert.ok(checked > 0);
});

test("buildHyrox without doubles equals the original template, and empty doubles match it", () => {
  const h = defaultHyrox();
  const base = buildHyrox(h, cal);
  assert.deepEqual(buildHyrox(h, cal, undefined, undefined), base);
  assert.deepEqual(buildHyrox(h, cal, undefined, cal.weeks.map(() => days())), base);
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
  const out = buildHyrox(h, c, undefined, c.weeks.map(() => days(1, 3)));
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
  const doubles = plan.weeks.map((w) => w.days.map((d) => d.type === "double"));
  assert.ok(doubles.some((w) => w.some(Boolean)), "bakken plan should have double days");
  const hx = buildHyrox(s.hyrox, calendar, undefined, doubles);
  let moved = 0;
  hx.weeks.forEach((wk, i) => {
    const cw = calendar.weeks[i];
    if (cw.role === "race" || cw.role === "vacation") return;
    wk.days.forEach((d, j) => { if (d.type !== "off") assert.equal(doubles[i][j], false, `week ${i + 1} day ${j}`); });
    if (wk.days.some((d, j) => doubles[i][j] && s.hyrox.template[j] !== "off")) moved++;
  });
  assert.ok(moved > 0, "at least one week should have had a clash to resolve");
});
