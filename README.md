# Norwegian Singles Planner

Sub-threshold pace ranges from a 5k or 10k PB, a 12-week Norwegian Singles plan, and one-click
sending to COROS or intervals.icu. Built with Next.js (App Router, static export), Tailwind CSS v4
and shadcn/ui. Design rules are in [DESIGN.md](DESIGN.md).

## What it does

- **Home**: sign in, create an account or continue as a guest.
- **Paces**: VDOT from your PB (Jack Daniels' formula), race predictions, and training paces as ranges:
  sub-T short (15k → half), medium (half → 25k), long (25k → 30k), 400s / hills, easy, and Daniels T for reference.
- **Plan**:
  - Weekly volume rises from the start volume toward the peak by at most 5% a week, with lighter weeks 4 and 8 and a taper or time trial in week 12.
  - Sub-T rep counts are sized from each week's volume, with adjustable warm-up and cool-down.
  - 6 × 20s strides on the first easy day of each week.
  - Estimated time per workout and week.
  - Weekly volume chart by phase.
  - Copy (Strava text), CSV, and sending to intervals.icu or COROS per day, week or plan.
  - **My plans**: save, open and delete named plans on your profile (Supabase).
- **Connect**: COROS (direct OAuth sign-in to the COROS MCP server, or the Claude NSM connector on claude.ai) and intervals.icu (API key).

## Develop

```sh
npm install
NEXT_PUBLIC_BASE_PATH="" npm run dev     # http://localhost:3000
npm run typecheck
```

## Build and deploy

`npm run build` writes a static site to `out/`. It's served under `/NSM` by default; set
`NEXT_PUBLIC_BASE_PATH=""` to serve it from a root.

GitHub Pages deploys from `.github/workflows/deploy.yml` on every push to `main`. One-time
setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Accounts

Supabase project details live in `lib/supabase.ts`. You can override them with
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY`. The publishable key is meant to be
public: row-level security keeps each person's plans private. Setup steps and SQL are in
[SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Layout

```
app/            layout, page, fonts, globals.css (design tokens + Tailwind theme)
components/ui/  shadcn/ui primitives
components/     site-header, home-screen, app-provider, auth/, paces/, builder/, plans/, connections/
lib/            vdot, plan, settings, format, workout-text, intervals, coros, supabase
```

## The previous static site

`index.html`, `styles.css`, `app.js`, `config.js` and `vendor/` at the root are the previous
version. GitHub Pages keeps serving them until the Pages source is switched to GitHub Actions.
After that they can be deleted.
