# HYROX + Norwegian Singles planner

Next.js (App Router, static export to GitHub Pages under `/NSM`), TypeScript, Tailwind v4, shadcn/ui, Supabase. Design rules are in DESIGN.md; Supabase setup is in SUPABASE_SETUP.md.

## Commands

- Typecheck: `npm run typecheck`
- Build: `npm run build` (writes `out/`)
- Tests: `npx tsx --test tests/*.test.ts` (Node's test runner via tsx; tests live in `tests/`)
- Dev server: `NEXT_PUBLIC_BASE_PATH="" npm run dev`

A change is done when typecheck, build and tests pass.

## Working with the agents

You are the lead. Four workers live in `.claude/agents/`:

| Agent | Model | Edits? | Use it to |
| --- | --- | --- | --- |
| explorer | Haiku | No | Find code and answer "where/what" questions, in parallel |
| implementer | Sonnet | Yes | Make one scoped change and check it builds |
| tester | Sonnet | `tests/` only | Write and run tests for the new behaviour |
| reviewer | Opus | No | Review the diff for bugs, privacy and security problems |

For a non-trivial change:
1. Send explorers out in parallel to map the code involved.
2. Write a short plan. For UI changes, show the user a screenshot before building.
3. Hand each scoped piece to an implementer: separate files can run in parallel.
4. Have the tester cover the new behaviour.
5. Run the reviewer on the diff and fix what matters.
6. Commit and push to the working branch. Open and merge a pull request only when the user says "yes merge it".

Small edits (a label, a one-line fix) don't need the swarm: do them directly.

## Rules

- Keep the old static site at the repo root (`index.html`, `app.js`, `styles.css`, `config.js`, `vendor/`) unchanged: it's the rollback.
- Signed-in users' settings save to their own `user_settings` row (row-level security); guests' settings aren't saved anywhere. New tables need row-level security.
- Mobile first: the user is mainly on Android. Check layouts at phone width.
