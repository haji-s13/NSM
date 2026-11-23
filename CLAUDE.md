# CLAUDE.md

Guidance for Claude Code in this repo.

## Project

HYROX + Norwegian Singles Method planner. Next.js (App Router, static export), Tailwind v4,
shadcn/ui, Supabase for accounts. See [README.md](README.md) for features and
[DESIGN.md](DESIGN.md) for UI rules (DESIGN.md wins over defaults; the user's words win over DESIGN.md).

- `lib/vdot.ts` paces from a PB (VDOT) · `lib/plan.ts` Norwegian Singles run plan ·
  `lib/hyrox.ts` HYROX station program · `lib/coros.ts`, `lib/intervals.ts` device/platform export ·
  `lib/supabase.ts`, `supabase/*.sql` accounts and session library.
- Root `index.html`, `app.js`, `styles.css`, `config.js`, `vendor/` are the old static site, kept for
  rollback. Don't edit them unless asked.

## Commands

```sh
npm install
NEXT_PUBLIC_BASE_PATH="" npm run dev   # http://localhost:3000
npm run typecheck                      # run before every commit
npm run build                          # static site in out/
```

## Research agent

A `researcher` subagent lives in `.claude/agents/researcher.md`. Use it (or ask "use the
researcher agent to …") before changing training logic or integrations when the right answer
depends on outside facts, e.g.:

- Norwegian Singles / sub-threshold rules: rep lengths, paces, weekly structure, volume ramps.
- VDOT / Daniels pace formulas, race-time equivalence.
- HYROX: stations, standards, divisions, weights, race format changes.
- COROS and intervals.icu APIs: endpoints, workout formats, auth, limits.

Research rules (also apply when researching without the subagent):

1. Prefer primary sources: original coach writing (e.g. Marius Bakken, sirpoc84 / the Norwegian
   Singles threads), Jack Daniels' Running Formula, official HYROX rulebooks, official API docs.
2. Cite every claim with a link. Mark anything unsourced or disputed as such.
3. Compare findings with what the code does today and name the file and line where they differ.
4. Save lasting findings to `research/<topic>.md` (date, question, answer, sources, impact on code).
   Check `research/` first so work isn't repeated.
5. Research doesn't change code. Code changes happen after the findings are reviewed.

## Conventions

- TypeScript, functional React components, shadcn/ui primitives from `components/ui/`.
- Tabular numerals on every pace, time and distance.
- Keep plan logic in `lib/` pure and UI-free.
