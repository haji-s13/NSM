import type { Station } from "./hyrox";

/* The HYROX session library: long and short quality sessions and aerobic sessions, taken from the
 * coach's year of programming (the Strivee year review). Each one is tagged with the phases it
 * suits; the plan picks from the matching sessions and rotates them week to week.
 *
 * The same list seeds the Supabase table `hyrox_sessions` (see supabase/hyrox_sessions.sql) and is
 * the fallback when the database can't be reached. Signed-in users can add their own sessions.
 *
 * Placeholders in the text are filled in for each athlete:
 *   {w:push} {w:pull} {w:farmers} {w:lunges} {w:wb}   race weight (kg or lb), e.g. {w:push+20}, {w:lunges*1.5}
 *   {w:heavyball}                                     wall ball 2–3 kg over race weight
 *   {target}                                          wall ball target height
 *   {leg:1000:threshold}                              a run leg, or BikeErg if run legs are off
 *   {n:4}                                             rounds or sets, scaled with the week's volume
 *   {inc:5}                                           a load step, e.g. "5 kg" / "10 lb"
 */

export type LibKind = "quality_long" | "quality_short" | "aerobic";
export type LibPhase = "strength" | "build" | "peak" | "sharpen" | "absorb";

export interface LibSession {
  id: string;
  kind: LibKind;
  name: string;
  phases: LibPhase[];
  minutes: number;
  blocks: { label: string; text: string }[];
  /** Approximate station volume for the whole session (m, or reps for wall balls). */
  vol?: Partial<Record<Station, number>>;
  source?: string;
  /** Null for the built-in sessions; set for sessions a user added. */
  user_id?: string | null;
  sort?: number;
}

export const LIB_KINDS: Record<LibKind, string> = {
  quality_long: "Quality (long)",
  quality_short: "Quality (short)",
  aerobic: "Aerobic",
};
export const LIB_PHASES: Record<LibPhase, string> = {
  strength: "Strength", build: "Station build", peak: "Race specific", sharpen: "Sharpen", absorb: "Absorb",
};

const S = (id: string, kind: LibKind, name: string, phases: LibPhase[], minutes: number, blocks: [string, string][], vol: LibSession["vol"], source: string): LibSession =>
  ({ id, kind, name, phases, minutes, blocks: blocks.map(([label, text]) => ({ label, text })), vol, source, user_id: null });

export const BUILTIN_SESSIONS: LibSession[] = [
  /* ---------- Quality (long): 45–90 min, the Saturday session ---------- */
  S("ql-emom-pairs", "quality_long", "Compromised EMOM pairs", ["strength", "build"], 60, [
    ["Main", "{n:3} × ({leg:2000:threshold} + 10 min EMOM alternating). Round 1: 15 cal ski / 12.5 m sled push. Round 2: 8 BBJ / 15 cal row. Round 3: 50 m farmers / 15 WB. Transitions under 30 s."],
  ], { ski: 1250, push: 62, bbj: 80, row: 1250, farmers: 250, wb: 75 }, "Week 7 plan, Ryan's HYROX Quality"),
  S("ql-station-amraps", "quality_long", "Station AMRAPs", ["strength", "build"], 35, [
    ["Main", "Station AMRAPs: {n:3} × AMRAP 8 min (500 m row, 20 m BBJ, 25 m sled push @ {w:push}, 20 walking lunges @ {w:lunges}), 3 min easy bike between. Push hard on the stations, use the bike to reset."],
  ], { row: 3000, bbj: 120, push: 150, lunges: 120 }, "May 12, Station AMRAPs"),
  S("ql-threshold-wb", "quality_long", "Threshold endurance with wall balls", ["strength", "build"], 45, [
    ["Main", "Threshold endurance: {n:4} × ({leg:1000:threshold} + 25 WB @ {w:wb} + 5 min easy bike)"],
  ], { wb: 100 }, "Nov 7, threshold endurance"),
  S("ql-run-stations", "quality_long", "Run + stations", ["build"], 40, [
    ["A", "{n:4} × (400 m row, 100 m farmers @ {w:farmers}, 20 m lunges @ {w:lunges+5}, 12 m sled pull from {w:pull} adding {inc:5} a round)"],
    ["B", "{n:4} × (20 cal bike, 400 m ski, 20 WB)"],
  ], { row: 1600, farmers: 400, lunges: 80, pull: 48, ski: 1600, wb: 80 }, "May 23, Run + Stations"),
  S("ql-descending-ladder", "quality_long", "Descending ladder", ["build", "peak"], 45, [
    ["Main", "Descending ladder: {leg:2000:threshold}, 1 km row, 50 m lunges @ {w:lunges}, 50 WB; rest 3 min; then {leg:1000:threshold}, 500 m row, 25 m lunges, 25 WB. Transition immediately."],
  ], { row: 1500, lunges: 75, wb: 75 }, "Oct 24, descending ladder"),
  S("ql-wb-bike-ladder", "quality_long", "Bike and wall ball ladder", ["build"], 40, [
    ["Main", "Ladder up: 10-20-30-40-50 WB @ {w:wb}, with 15 cal bike before each set. Then 3 min easy and 4 × 250 m ski @ 2k pace, 1 min rest."],
  ], { wb: 150, ski: 1000 }, "Apr 18, bike and WB ladders"),
  S("ql-machine-tempo", "quality_long", "Run + machine tempo", ["build", "peak"], 50, [
    ["Main", "{n:4} × ({leg:1000:threshold} + 500 m row @ 2k pace + 8 s + 25 m sled push @ {w:push}), 2 min rest. Break the push only at 5–6 m."],
  ], { row: 2000, push: 100 }, "Apr 11, Run + Machine Tempo"),
  S("ql-quality-brick", "quality_long", "HYROX Quality + lunge into WB brick", ["peak"], 55, [
    ["A", "2 × ({leg:1000:race pace} + 1 km ski + 50 m sled push + 50 m sled pull)"],
    ["B", "Lunge into WB brick: {n:3} × ({leg:400:threshold} + 30 m lunges @ {w:lunges} + 30 WB), 2 min rest"],
  ], { ski: 2000, push: 100, pull: 100, lunges: 90, wb: 90 }, "Week 9 plan"),
  S("ql-half-sim", "quality_long", "First-half race simulation", ["peak"], 50, [
    ["A", "First half race simulation: {leg:1000:race pace} + 1 km ski, {leg:1000:race pace} + 50 m push, {leg:1000:race pace} + 50 m pull, {leg:1000:race pace} + 80 m BBJ"],
    ["B", "Then 4 × ({leg:400:threshold} + 25 WB @ {w:wb}): 100 WB for time after 400s"],
  ], { ski: 1000, push: 50, pull: 50, bbj: 80, wb: 100 }, "Nov 11, 100 WB after 400s"),
  S("ql-second-half-sim", "quality_long", "Second-half race simulation", ["peak"], 50, [
    ["Main", "Second half race simulation: {leg:1000:race pace} + 1 km row, {leg:1000:race pace} + 200 m farmers @ {w:farmers}, {leg:1000:race pace} + 100 m lunges @ {w:lunges}, {leg:1000:race pace} + 100 WB. Agree the wall ball and lunge split with your partner if racing doubles."],
  ], { row: 1000, farmers: 200, lunges: 100, wb: 100 }, "Boston splits, lunges and wall balls last"),
  S("ql-easy-amrap", "quality_long", "Easy AMRAP", ["absorb"], 45, [
    ["Main", "Easy AMRAP 45 min: 1 km ski, 1 km row, 25 burpees, 50 m farmers carry. RPE 4 out of 10."],
  ], { ski: 1000, row: 1000, bbj: 25, farmers: 50 }, "Week 10 plan, Aerobic AMRAP"),
  S("ql-station-touch", "quality_long", "Easy station touch", ["absorb"], 45, [
    ["Main", "Station touch, easy: 2 rounds (5 BBJ + 10 walking lunges, 5 BBJ + 10 WB), 4 × 12 m push, 4 × 12 m pull, 2 × 100 m farmers. Not a suffer fest."],
  ], { bbj: 40, lunges: 40, wb: 20, push: 48, pull: 48, farmers: 200 }, "Week 13 plan, station touch"),

  /* ---------- Quality (short): 25–40 min, a midweek touch or sharpener ---------- */
  S("qs-solo-sharpener", "quality_short", "Solo sharpener", ["build", "peak"], 40, [
    ["A", "{n:5} × ({leg:600:threshold} + one station @ race weight: 400 m ski / 40 m BBJ / 25 WB / 25 m sled push / 50 m farmers), 75 s rest"],
    ["B", "EMOM 10: odd 30 s bike @ RPE 8, even 12 WB, best form"],
  ], { ski: 400, bbj: 40, wb: 85, push: 25, farmers: 50 }, "Lisbon and Ottawa sharpener"),
  S("qs-race-week-sharpener", "quality_short", "Race-week sharpener", ["sharpen"], 35, [
    ["A", "4 × ({leg:400:threshold} + 400 m ski or row @ 2k pace + 8 s), 90 s rest. Last set: + 30–40 unbroken WB."],
    ["B", "10 min reset, then E2MOM × 3: 10 m push + 10 m BBJ / 10 m pull + 10 walking lunges + 50 m farmers, all @ race weight. Just feel the weight."],
  ], { ski: 800, row: 800, wb: 35, push: 30, bbj: 30, pull: 30, lunges: 30, farmers: 150 }, "Ryan's Wednesday sharpener"),
  S("qs-e2mom-circuit", "quality_short", "Compromised station circuit", ["peak", "sharpen"], 40, [
    ["Main", "E2MOM 1:20 on / 0:40 off × 3: ski, sled push, BBJ, row, farmers carry, lunges, then 5 min easy bike between rounds"],
  ], { ski: 750, push: 45, bbj: 30, row: 750, farmers: 150, lunges: 45 }, "Week 11 plan, compromised station conditioning"),
  S("qs-lunge-specificity", "quality_short", "Lunge Specificity", ["build"], 30, [
    ["Main", "Lunge Specificity, {n:4} rounds: 40 walking lunges ramping {w:lunges-10} → {w:lunges-5} → {w:lunges} → {w:lunges+5} + 20 fast bodyweight lunges, rest 1:1"],
  ], { lunges: 240 }, "Apr 15 and May 20, Lunge Specificity"),
  S("qs-wb-density", "quality_short", "Wall ball density", ["build"], 25, [
    ["A", "10 unbroken WB every 30 s to 150 @ {w:wb}"],
    ["B", "Then 3 × 500 m row @ 2k pace + 8 s, 90 s rest"],
  ], { wb: 150, row: 1500 }, "Mar 1, 10 unbroken every 30 s"),
  S("qs-sled-contrast", "quality_short", "Sled push contrast", ["build", "peak"], 30, [
    ["Main", "{n:4} × (500 m ski @ 2k pace + 25 m sled push @ {w:push}), rest 1:1. Break only at 5–6 m."],
  ], { ski: 2000, push: 100 }, "Oct 28 and Nov 17, push after ski"),
  S("qs-ski-wb", "quality_short", "Ski into wall balls", ["strength", "build"], 30, [
    ["Main", "{n:3} × (500 m ski @ 2k pace + 8 s + 25 WB unbroken @ {w:wb}), 90 s rest"],
  ], { ski: 1500, wb: 75 }, "Week 1 plan, light lunge specificity day"),
  S("qs-max-unbroken", "quality_short", "Max unbroken wall balls", ["peak"], 25, [
    ["A", "Max unbroken WB @ {w:wb}, rest 2 min, max unbroken again, 3 sets. Start conservative and build."],
    ["B", "Then 3 × 500 m row hard, 2 min rest"],
  ], { wb: 120, row: 1500 }, "Aug 16 and Aug 22, max unbroken"),
  S("qs-bike-sled-emom", "quality_short", "Bike and sled EMOM", ["strength"], 25, [
    ["Main", "EMOM 18: minute 1 30 s bike @ RPE 8, minute 2 12.5 m sled push @ {w:push}, minute 3 12.5 m sled pull @ {w:pull}"],
  ], { push: 75, pull: 75 }, "Solo primer, bike plus sled push and pull EMOM"),
  S("qs-bbj-fartlek", "quality_short", "Fartlek with BBJs", ["peak"], 30, [
    ["Main", "6 × ({leg:400:hard} + 10 BBJ), 90 s easy between"],
  ], { bbj: 120 }, "May 11, fartlek run with BBJs"),

  /* ---------- Aerobic: easy machine work and station carries ---------- */
  S("ae-bike-farmers", "aerobic", "Bike + farmers carry", ["strength", "build", "peak"], 35, [
    ["Main", "{n:5} × (5 min bike @ 60% FTP + 100 m farmers carry @ {w:farmers} per hand)"],
  ], { farmers: 500 }, "Aerobic stations, in-season Mondays"),
  S("ae-recovery-machines", "aerobic", "Recovery machines", ["strength", "build", "peak", "sharpen"], 48, [
    ["Main", "Recovery machines 3 × (5 min bike, 5 min row, 5 min ski) relaxed, with 5 weighted pull-ups after each round, not heavy"],
  ], { row: 3300, ski: 3000 }, "Race-week Monday"),
  S("ae-stations-wb-lunge", "aerobic", "Aerobic stations + WB and lunge EMOM", ["strength", "build"], 36, [
    ["A", "4 × (5 min bike @ 60% FTP + 100 m farmers carry @ {w:farmers})"],
    ["B", "EMOM 10, alternating 8 heavy WB ({w:heavyball}) and 10 walking lunges @ {w:lunges}"],
  ], { farmers: 400, wb: 40, lunges: 50 }, "Week 4 plan, aerobic stations"),
  S("ae-bike-fartlek", "aerobic", "Bike fartlek", ["build", "peak"], 40, [
    ["Main", "Bike fartlek 20 min (4 × 4 min easy @ 50% FTP + 1 min hard), then 2 × (5 min ski + 5 min row) easy"],
  ], { ski: 2000, row: 2200 }, "Dallas week, Monday"),
  S("ae-hybrid-z2", "aerobic", "Hybrid z2", ["absorb", "sharpen", "peak"], 30, [
    ["Main", "Hybrid z2: 3 × (5 min bike + 5 min ski or row), easy"],
  ], { ski: 1000, row: 1000 }, "Saturday race week, Thursday"),
  S("ae-sandwich", "aerobic", "Aerobic sandwich", ["absorb", "strength"], 30, [
    ["Main", "Aerobic sandwich, 4 rounds: 4 min easy bike + one station @ race weight, rotating 20 m push / 30 m lunges / 30 WB / 25 m pull. Controlled."],
  ], { push: 20, lunges: 30, wb: 30, pull: 25 }, "Week 4 and Week 10 plans"),
  S("ae-mixed-modality", "aerobic", "Mixed modality z2", ["strength", "build", "absorb"], 45, [
    ["Main", "Mixed modality z2, 45 min: 15 min bike, 15 min ski, 15 min row at conversational effort"],
  ], { ski: 3000, row: 3300 }, "Mixed Modality (z2) cards"),
  S("ae-pullups-machines", "aerobic", "Easy aerobic + pull-ups", ["sharpen", "absorb", "peak"], 40, [
    ["Main", "4 × (5 min bike + 5 weighted pull-ups), then 2 × (500 m ski, 500 m row) easy"],
  ], { ski: 1000, row: 1000 }, "Week 3 plan, Tuesday"),
  S("ae-ftp-bike", "aerobic", "FTP bike intervals", ["strength"], 45, [
    ["Main", "10 min easy, then 3 × 8 min @ 95–100% FTP, 4 min easy between, then 5 min easy"],
  ], {}, "Summer FTP sessions"),
];
