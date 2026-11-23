# How to work in this repo (swarm mode)

## The project

HYROX + Norwegian Singles planner: a Next.js 16 (App Router, static export) app with
TypeScript, Tailwind CSS v4, shadcn/ui and Supabase. See [README.md](README.md) for what it does.

- `app/` layout, page, fonts, `globals.css` (design tokens + Tailwind theme)
- `components/` screens and features; `components/ui/` are shadcn/ui primitives
- `lib/` plan logic, VDOT, formatting, Supabase, COROS and intervals.icu
- `supabase/` SQL for tables and row-level security
- `index.html`, `styles.css`, `app.js`, `config.js`, `vendor/` at the root are the old static
  site, kept for rollback. Don't edit them unless the task is about them.
- UI work must follow [DESIGN.md](DESIGN.md). Pass that rule on to any subagent doing UI work.

## Checks

There is no test suite yet. Every change must pass:

- `npm run typecheck`
- `npm run build` (static export to `out/`; this is what the GitHub Pages deploy runs)

Run `npm install` first if `node_modules/` is missing.

## Swarm workflow

You are the lead. For any task bigger than a small single-file fix, delegate:

1. **Explore:** send `explorer` subagents in parallel, one per area of the code you need to understand.
2. **Plan:** write a short plan yourself and split it into independent changes.
3. **Build:** give each change to an `implementer` with the exact files, the goal and the check commands above. Run implementers in parallel only when they touch different files.
4. **Test:** there's no test framework yet, so only use `tester` when the task asks for tests. Adding a framework (for example Vitest) is a dependency change: confirm it with the user first.
5. **Review:** ask `reviewer` to check the full diff. Verify each finding yourself before fixing it.
6. **Finish:** summarise what changed and the final typecheck and build results.

Subagents do not see this conversation, so every task you hand off must include the file paths, the goal, constraints (including DESIGN.md for UI) and the check commands.
Do small tasks yourself; delegating has overhead.

How the agents are set up, and how to tune them: [.claude/SWARM.md](.claude/SWARM.md).
