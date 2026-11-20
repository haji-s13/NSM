# Norwegian Singles Planner

A static web app (plain HTML, CSS and JavaScript, no build step) with two tabs:

1. **Predicted Paces** – enter a 5k or 10k PB to get predicted race times (Riegel's formula, exponent 1.06) and training paces:
   - Sub-T short (1k / 3 min reps): ≈ 15k pace
   - Sub-T medium (2k / 6 min reps): ≈ half marathon pace
   - Sub-T long (3k / 10 min reps): ≈ 30k pace
   - 400s / hills: ≈ 10k pace
   - Easy and long runs: marathon pace + 12–25%
   - An optional ± sec/km adjustment applies to all sub-T paces.
2. **12-Week Builder** – choose a start date, peak weekly volume, rep format and a weekly template (which day gets which session). It generates 12 weeks with:
   - Base (weeks 1–4), Build (5–8) and Peak (9–11) phases, with rep counts that progress each week
   - Optional lighter weeks in weeks 4 and 8
   - Week 12 as a taper and race, a time trial, or a normal week
   - Easy-run distances calculated to fill the weekly volume target
   - Print and CSV export

Settings are saved in the browser's localStorage.

## Running

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

It can also be hosted as-is on GitHub Pages.

## Tuning

The progression tables (`PROG`, `TAPER`) and pace definitions (in `model()`) are at the top of `app.js`.
