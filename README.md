# Norwegian Singles Planner

A static web app (plain HTML, CSS and JavaScript, no build step). It opens on a home page where you sign in, create an account or continue as a guest, then has three tabs:

1. **Predicted Paces** – enter a 5k or 10k PB to get their VDOT, predicted race times (Jack Daniels' VDOT formula) and training paces, each shown as a range:
   - Sub-T short (1k / 3 min reps): 15k → half marathon pace
   - Sub-T medium (2k / 6 min reps): half marathon → 25k pace
   - Sub-T long (3k / 10 min reps): 25k → 30k pace
   - 400s / hills: 10k → 15k pace
   - Easy and long runs: Daniels E (62–74% VDOT)
   - Reference rows: Daniels T (83–88% VDOT) and marathon pace
   - An optional ± sec/km adjustment applies to all sub-T paces.
2. **12-Week Builder** – choose a start date, starting and peak weekly volume, sub-T share of volume, rep format and a weekly template (which day gets which session). It generates 12 weeks with:
   - Weekly volume that rises from the starting volume toward the peak by at most 5% a week
   - Sub-T rep counts sized from each week's volume (the sub-T share split across the week's sessions), so sessions grow with volume
   - Base (weeks 1–4), Build (5–8) and Peak (9–11) phases
   - Optional lighter weeks in weeks 4 and 8
   - Week 12 as a taper and race, a time trial, or a normal week
   - Easy-run distances calculated to fill the weekly volume target
   - Collapsible Plan settings (remembered per device) with a one-line summary when collapsed, and the weekly template in its own card
   - Adjustable warm-up and cool-down distance for all sub-T sessions, shown as separate lines in each day's breakdown
   - Estimated time for each workout and week (warm-up, reps, recoveries and cool-down at their paces)
   - 6 × 20s strides added to the first easy run of each week
   - A weekly volume bar chart coloured by phase (base, build, peak, race/trial), lighter weeks hatched, peak target line, hover for details, estimated hours per week under each bar, and 12-week total, weekly average, average weekly time and sub-T totals below it
   - Send buttons (per day, per week, or all 12 weeks) that push workouts with pace targets to intervals.icu using the API key from the intervals.icu tab, from where they sync to COROS, Garmin and other watches. This needs the hosted version (GitHub Pages or a local server), not the single-file preview.
   - COROS buttons (per day, per week, or all weeks) that add structured workouts with pace ranges to your COROS training schedule. On claude.ai they use the "Claude NSM" connector; on the hosted site, "Connect COROS" on the Connections tab signs in to the COROS MCP server directly (OAuth with PKCE, tokens kept in the browser).
   - A Copy button on each day that copies a plain-text workout for a Strava description
   - Print and CSV export
3. **Connections** – COROS status, plus the intervals.icu API key, optional athlete ID and a Check connection button.

Signed-in users can save named plans to their profile (**My plans** on the 12-Week Builder) and open them on any device. Accounts use Supabase: see [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and fill in `config.js`. Without it, the site runs guest-only. Guest settings are saved in the browser's localStorage.

The Supabase browser library is vendored in `vendor/` (supabase-js 2.118.0, MIT).

## Running

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

It can also be hosted as-is on GitHub Pages.

## Tuning

The progression settings (`MAX_WEEKLY_INCREASE`, `REPS`, deload and taper factors) and pace definitions (in `model()`) are at the top of `app.js`.
