import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar } from "../lib/calendar";
import { buildPlan } from "../lib/plan";
import { buildModel } from "../lib/vdot";
import { defaultSettings, normalizeSettings, testForPeriod } from "../lib/settings";

const START = "2026-11-23";
const END24 = "2027-05-09";
const END12 = "2027-02-14";

function plan24(opts: { races?: any[]; vacations?: any[]; method?: "singles" | "bakken"; models?: any[] } = {}) {
  const s = defaultSettings();
  s.startDate = START;
  s.endDate = END24;
  s.races = [];
  if (opts.method) s.runMethod = opts.method;
  const cal = buildCalendar(START, END24, opts.races || [], opts.vacations || []);
  const pb = buildModel("5000", "19:45", 0)!;
  return { s, cal, pb, plan: buildPlan(s, pb, cal, opts.models) };
}

const raceDays = (w: { days: { type: string }[] }) => w.days.filter((d) => d.type === "race");

test("24-week plan has 24 weeks", () => {
  assert.equal(plan24().plan.weeks.length, 24);
});

test("week 12 is a 5k test week with one 5k race day", () => {
  const w = plan24().plan.weeks[11];
  assert.equal(w.testWeek, true);
  assert.equal(w.phase, "5k test");
  const r = raceDays(w);
  assert.equal(r.length, 1);
  assert.equal(r[0].title, "5k test");
  assert.equal(r[0].raceKm, 5);
});

test("final week is not a test week", () => {
  const w = plan24().plan.weeks[23];
  assert.equal(w.testWeek, false);
  assert.notEqual(w.phase, "5k test");
});

test("only week 12 is a test week in a 24-week plan", () => {
  const idx = plan24().plan.weeks.map((w, i) => (w.testWeek ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(idx, [11]);
});

test("12-week plan has no test weeks", () => {
  const s = defaultSettings();
  s.startDate = START; s.endDate = END12; s.races = [];
  const cal = buildCalendar(START, END12, [], []);
  const plan = buildPlan(s, buildModel("5000", "19:45", 0)!, cal);
  assert.equal(plan.weeks.length, 12);
  assert.ok(plan.weeks.every((w) => !w.testWeek));
});

test("a race in week 12 means it is not a test week", () => {
  const { plan } = plan24({ races: [{ id: "r", date: "2027-02-13", name: "HYROX", kind: "hyrox" }] });
  assert.equal(plan.weeks[11].testWeek, false);
  assert.notEqual(plan.weeks[11].phase, "5k test");
  assert.ok(!plan.weeks[11].days.some((d) => d.title === "5k test"));
});

test("a vacation in week 12 means it is not a test week", () => {
  const { plan } = plan24({ vacations: [{ id: "v", start: "2027-02-08", end: "2027-02-14" }] });
  assert.equal(plan.weeks[11].testWeek, false);
  assert.ok(!plan.weeks[11].days.some((d) => d.title === "5k test"));
});

test("test week is lighter than the previous full week", () => {
  const w = plan24().plan.weeks;
  assert.ok(w[11].totalKm < w[10].totalKm, `${w[11].totalKm} vs ${w[10].totalKm}`);
});

test("test week is excluded from the period's peak week", () => {
  const { plan } = plan24();
  assert.notEqual(plan.periods[0].peakWeek, 12);
});

test("weekly volume never rises more than 5% week to week", () => {
  const w = plan24().plan.weeks;
  for (let i = 1; i < w.length; i++) {
    if (w[i].totalKm > w[i - 1].totalKm) {
      // compare to last non-reduced week is stricter; here check adjacent with rounding slack
      assert.ok(w[i].targetKm <= w[i - 1].targetKm * 1.05 + 1e-6 || w[i - 1].taper || w[i - 1].deload || i % 12 === 0,
        `week ${i + 1}: ${w[i].targetKm} vs ${w[i - 1].targetKm}`);
    }
  }
});

test("per-period models give each period its own vdot", () => {
  const pb = buildModel("5000", "19:45", 0)!;
  const m2 = buildModel("5000", "18:30", 0)!;
  const { plan } = plan24({ models: [pb, m2] });
  plan.weeks.slice(0, 12).forEach((w) => assert.equal(w.vdot, pb.vdot));
  plan.weeks.slice(12).forEach((w) => assert.equal(w.vdot, m2.vdot));
  assert.ok(m2.vdot > pb.vdot);
});

test("without models all weeks use the base vdot", () => {
  const { plan, pb } = plan24();
  assert.ok(plan.weeks.every((w) => w.vdot === pb.vdot));
});

test("sub-threshold rep pace is faster in period 2 with a faster test", () => {
  const pb = buildModel("5000", "19:45", 0)!;
  const m2 = buildModel("5000", "18:30", 0)!;
  const { plan } = plan24({ models: [pb, m2] });
  const rep = (ws: typeof plan.weeks) => ws.flatMap((w) => w.days).find((d) => d.reps)!.reps!.pace;
  const p1 = rep(plan.weeks.slice(0, 11));
  const p2 = rep(plan.weeks.slice(12, 23));
  assert.ok(p2.lo < p1.lo && p2.hi < p1.hi, `${JSON.stringify(p1)} vs ${JSON.stringify(p2)}`);
});

test("testForPeriod returns the latest valid earlier test", () => {
  const s = defaultSettings();
  s.paceTests = [{ period: 0, time: "18:30" }, { period: 1, time: "xx" }];
  assert.equal(testForPeriod(s, 0), null);
  assert.deepEqual(testForPeriod(s, 1), s.paceTests[0]);
  assert.deepEqual(testForPeriod(s, 2), s.paceTests[0]);
});

test("testForPeriod is null with no paceTests", () => {
  assert.equal(testForPeriod(defaultSettings(), 3), null);
});

test("testForPeriod picks the later valid test", () => {
  const s = defaultSettings();
  s.paceTests = [{ period: 0, time: "19:00" }, { period: 1, time: "18:30" }];
  assert.equal(testForPeriod(s, 2)!.time, "18:30");
});

test("normalizeSettings drops malformed paceTests entries", () => {
  const raw = { ...defaultSettings(), paceTests: [{ period: 0, time: "18:30" }, null, { period: "1", time: "18:00" }, { period: 1 }, { period: NaN, time: "18:00" }, 5] };
  const s = normalizeSettings(raw);
  assert.deepEqual(s.paceTests, [{ period: 0, time: "18:30" }]);
});

test("normalizeSettings turns a non-array paceTests into an empty list", () => {
  const s = normalizeSettings({ ...defaultSettings(), paceTests: "oops" });
  assert.deepEqual(s.paceTests, []);
});

test("Bakken method also gets a 5k test week", () => {
  const w = plan24({ method: "bakken" }).plan.weeks;
  assert.equal(w[11].testWeek, true);
  assert.equal(w[11].phase, "5k test");
  const r = raceDays(w[11]);
  assert.equal(r.length, 1);
  assert.equal(r[0].raceKm, 5);
  assert.equal(w[23].testWeek, false);
});

test("nothing is planned on vacation days in a 24-week plan", () => {
  const { plan, cal } = plan24({ vacations: [{ id: "v", start: "2027-02-08", end: "2027-02-10" }] });
  const cw = cal.weeks[11];
  cw.off.forEach((off, i) => { if (off) assert.ok(plan.weeks[11].days[i].km === 0 && plan.weeks[11].days[i].type !== "race"); });
});
