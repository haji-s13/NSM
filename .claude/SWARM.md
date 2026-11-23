# Claude coding swarm (Claude Code subagents)

A lead Claude (your normal Claude Code session) plus four worker subagents (this repo also has a `researcher` agent, described in the root `CLAUDE.md`):

| Agent | Model | Can edit? | Job |
| --- | --- | --- | --- |
| explorer | Haiku | No | Find code and answer "where/what" questions, cheaply and in parallel |
| implementer | Opus 5.5 | Yes | Make one scoped change and run the tests |
| tester | Sonnet | Tests only | Write and run tests for new behaviour |
| reviewer | Opus | No | Review the diff for bugs and security issues |

## Install (about 2 minutes)

1. Install Claude Code: see https://code.claude.com/docs (needs a Claude Pro/Max plan or an API key).
2. Copy the `.claude/agents/` folder into the root of your project (or into `~/.claude/agents/` to use it in every project).
3. Copy `CLAUDE.md` into your project root (or merge it into your existing one) and set your test command. (In this repo that is already done: see the root `CLAUDE.md`.)
4. Run `claude` in the project and type `/agents` to check that the four agents are listed.

## Try it

> Add rate limiting to the login endpoint, with tests, and review it before you finish.

The lead will send explorers out, plan, hand the change to an implementer, get tests written, run a review and report back.
You can also call a worker directly: "Use the reviewer subagent on my current diff."

## Tuning

- Costs too high: change `reviewer` to `model: sonnet`, keep `explorer` on Haiku.
- Want more parallelism: ask for it explicitly, e.g. "explore the API, the DB layer and the frontend in parallel".
- Edit any file's `description` to change when the lead picks that agent.
