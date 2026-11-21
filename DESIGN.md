# DESIGN.md

The rules I follow every time I design or build UI for this project. Rules are written
for the Next.js (App Router) + Tailwind + shadcn/ui version of the app. Where the
current code breaks a rule, it's listed under **Audit findings** and gets fixed when
that screen is ported, not before.

The user's own words always win over this file. This file wins over my defaults.

---

## 0. Audit findings (21 Nov 2026)

What I looked for and what's actually in the repo:

| Asked to read | Status |
|---|---|
| `package.json` | **Not present.** No Node project, no dependencies. |
| `tailwind.config.*` | **Not present.** No Tailwind. |
| `globals.css` | **Not present.** The only stylesheet is `styles.css` (plain CSS). |
| `components.json` (shadcn) | **Not present.** No shadcn/ui installed. |
| `*.tsx` / `*.jsx` components | **None.** UI is rendered from template strings in `app.js`. |

At the time of the audit the repo was a static site: `index.html`, `styles.css`, `app.js`, `config.js`,
`vendor/supabase-2.118.0.js`.

**Migration status (21 Nov 2026):** the Next.js app now exists alongside those files
(`app/`, `components/`, `lib/`, `package.json`). The old static files stay at the repo root
only until GitHub Pages is switched to the Actions deploy, then they get removed.

Where today's `styles.css` / `app.js` break the rules below:

| Rule | Today | Fix when ported |
|---|---|---|
| Fonts | `font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (styles.css:61). Uses two banned families. | Three `next/font` families from section 1. |
| One dominant + one accent | Two brand colours compete: `--accent` red `#b3261e` and `--accent-2` blue `#1f3a68`, plus `--accent-soft`. | Blue becomes the dominant colour, red the single accent (section 2). |
| Weight extremes | Weights 400 / 500 / 600 / 700 used everywhere. 600 is the default for labels, buttons and tabs. | Hierarchy only through 200 vs 800 (section 3). |
| 3x size jumps | Sizes cluster between 0.75rem and 1.6rem (1.07x–1.2x steps). | Four-step scale: 12 / 16 / 48 / 144 px (section 3). |
| 8px rhythm | 8px is the most common value (32 uses), but 10, 14, 6, 3, 5 and 18px appear ~75 times. | Spacing tokens only (section 4). |
| Shadows | Two shadows: tooltip `0 4px 14px rgba(0,0,0,.12)`, auth tab `0 1px 2px rgba(0,0,0,.08)`. The second is the banned faint-everywhere kind. | Borders and surface contrast instead (section 6). |
| Data colours | Session tints (`--easy`, `--subt`, `--long`, `--rest`, `--race`) and phase colours (`--ph-*`) live beside brand tokens. | Kept, but as a separate **data** token set that never acts as a brand colour (section 2.3). |

Things to keep, because they work:
- Light/dark tokens on `:root` with a `prefers-color-scheme` override.
- `font-variant-numeric: tabular-nums` on every pace, time and distance.
- The validated colour-blind-safe phase palette for the volume chart.
- `[hidden] { display: none !important; }`.

---

## 1. Fonts

Self-hosted variable fonts from `@fontsource-variable/*`, loaded with `next/font/local` in
`app/fonts.ts` and exposed as CSS variables, so builds need no network. Never from a `<link>` tag.

| Role | Family | Weights loaded | Variable | Used for |
|---|---|---|---|---|
| Display | **Bricolage Grotesque** | 200, 800 | `--font-display` | Page titles, hero numerals (VDOT, weekly km), section headings |
| Body | **Manrope** | 200, 400, 800 | `--font-body` | Running text, labels, buttons, form controls |
| Mono | **JetBrains Mono** | 400, 800 | `--font-mono` | Paces (`4:12–4:18/km`), splits, rep structures (`5 × 1 km`), times, workout text for Copy |

```ts
// app/fonts.ts
import localFont from "next/font/local";
export const display = localFont({ src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2", weight: "200 800", variable: "--font-display" });
export const body    = localFont({ src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2", weight: "200 800", variable: "--font-body" });
export const mono    = localFont({ src: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", variable: "--font-mono" });
```

In Tailwind: `font-display`, `font-sans` (body) and `font-mono`. The `.num` class is mono with tabular figures.

Fallback stacks (in `globals.css`):
`--font-display: "Bricolage Grotesque", "Helvetica Neue", sans-serif;`
`--font-body: "Manrope", "Helvetica Neue", sans-serif;`
`--font-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;`

**Never use**, as a primary face or anywhere in a fallback stack:
**Inter, Roboto, Open Sans, Arial, system-ui** (also `-apple-system`,
`BlinkMacSystemFont` and `"Segoe UI"`, which are system-ui by another name).

---

## 2. Colour

All colour is CSS variables in `app/globals.css`, mapped into Tailwind v4 with `@theme inline`
in the same file (there is no `tailwind.config.ts`). Components use the Tailwind names
(`bg-primary`, `text-signal`), never raw hex.

### 2.1 Brand: one dominant, one accent

| Token | Light | Dark | Role |
|---|---|---|---|
| `--primary` | `#14181f` Graphite | `#f1f3f5` | **Dominant.** Primary buttons, links, chart axis emphasis |
| `--hero` | `#0e1116` | `#08090b` | Header band and home banner (with `--hero-foreground`, `--hero-muted`) |
| `--primary-foreground` | `#ffffff` | `#0e1116` | Text on primary |
| `--signal` | `#c2410c` Ember | `#ff7a3d` | **Single accent.** The active tab, the wordmark badge, an eyebrow, weak-station marks |
| `--signal-foreground` | `#ffffff` | `#1a0a03` | Text on the signal colour |

The brand accent is called `--signal` because shadcn/ui reserves `--accent` for neutral hover
surfaces. `--accent` here is a neutral and never red. `--destructive` shares the signal value.

Rule: at most **one signal use per viewport**. If two things want red, one of them
is wrong.

### 2.2 Neutrals (tinted toward the primary, never pure mid-grey)

| Token | Light | Dark |
|---|---|---|
| `--background` | `#f6f7f9` | `#111418` |
| `--surface` (`--card`) | `#ffffff` | `#1a1e24` |
| `--foreground` | `#1b1f24` | `#e7eaee` |
| `--muted-foreground` | `#5d6673` | `#9aa3ad` |
| `--border` / `--input` | `#dde1e6` | `#2d333b` |
| `--ring` | `var(--primary)` | `var(--primary)` |

### 2.3 Data tokens (not brand colours)

These encode **meaning in data** and are allowed only inside charts, day cells and
legends. They never colour buttons, headings or backgrounds.

- Session tints: `--session-easy`, `--session-subt`, `--session-long`, `--session-rest`,
  `--session-race` (+ matching `-ink` text tokens). Values from today's `--easy` … `--race`.
- Training phases (validated colour-blind safe, light / dark):
  `--phase-base #2a78d6 / #3987e5`, `--phase-build #eb6834 / #d95926`,
  `--phase-peak #1baf7a / #199e70`, `--phase-trial #eda100 / #c98500`.
- Status (`--status-ok`, `--status-error`) always come with an icon and a text label,
  never colour alone.

### 2.4 Theming shape

```css
:root { /* every token, light values */ }
@media (prefers-color-scheme: dark) { :root:not(.light) { /* dark values */ color-scheme: dark; } }
body { background: var(--background); color: var(--foreground); }
```

### 2.5 Banned

- **Purple or indigo gradients on white**, or any purple/indigo/violet hue in brand
  or UI chrome (Tailwind `purple-*`, `violet-*`, `indigo-*`, `fuchsia-*`).
- Decorative gradients of any kind on surfaces. The only gradient allowed is the
  lighter-week hatch pattern in the chart.
- A third brand colour. New needs are met with primary, accent, a neutral, or a data token.

---

## 3. Type scale

Hierarchy comes from **weight extremes and big size jumps**, not from many
near-identical sizes.

| Step | Size / line height | Weight | Font | Use |
|---|---|---|---|---|
| `text-meta` | 12px / 16px | 800, uppercase, +0.08em tracking | body | Eyebrows, table headers, day names, legend labels |
| `text-body` | 16px / 24px | 400 (200 for de-emphasised notes) | body | Running text, form labels, buttons |
| `text-display` | 48px / 56px | 800 | display | Page and section titles |
| `text-hero` | 144px / 144px | 200 | display or mono | One hero figure per screen: VDOT, weekly km, total hours |

- Size jumps are **3x**: 16 → 48 → 144. The 12px meta step is the only step below body.
- Weights are **200 and 800**, plus 400 for body copy so it stays readable. **No 500, 600 or 700.**
- Contrast pairs: an 800 heading sits next to 200 supporting text, or a 200 hero
  numeral sits under an 800 meta label.
- Numbers in tables, paces, splits and times use `font-mono` and `tabular-nums`.
- Headings get `text-wrap: balance`. Running text is capped at `max-w-[65ch]`.
- On screens under 640px, `text-hero` drops to 96px and `text-display` to 32px. Weights stay the same.

Tailwind v4 theme (in `app/globals.css`): `--text-meta`, `--text-body`, `--text-display` and
`--text-hero`, giving `text-meta`, `text-body`, `text-display` and `text-hero`. shadcn's in-between
weights are mapped onto the extremes (`font-medium` = 400; `font-semibold` and `font-bold` = 800),
so primitives obey the rule without being forked. Equivalent v3 config, for reference:

```ts
fontSize: {
  meta:    ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.08em", fontWeight: "800" }],
  body:    ["1rem",    { lineHeight: "1.5rem" }],
  display: ["3rem",    { lineHeight: "3.5rem", fontWeight: "800" }],
  hero:    ["9rem",    { lineHeight: "9rem", fontWeight: "200" }],
},
fontWeight: { thin: "200", normal: "400", black: "800" },
```

---

## 4. Spacing: 8px rhythm

Every margin, padding, gap and fixed size is a multiple of 8px.

| Token | px | Tailwind |
|---|---|---|
| `--space-1` | 8 | `2` |
| `--space-2` | 16 | `4` |
| `--space-3` | 24 | `6` |
| `--space-4` | 32 | `8` |
| `--space-6` | 48 | `12` |
| `--space-8` | 64 | `16` |
| `--space-12` | 96 | `24` |

- **One exception:** 4px (`1`) is allowed *inside* a control only, for icon-to-label
  gaps and badge padding. Never between components.
- Line heights land on the 8px grid (16 / 24 / 56 / 144).
- Side gutter: `px-4` (16px) on mobile and `px-8` (32px) from `md`, written with
  `max(16px, env(safe-area-inset-left))` on the outer wrapper.
- Sibling groups use `gap-*` on flex or grid parents, not margins on children.
- Radius: `--radius: 8px` for controls and cards, `9999px` for pills only. No other radii.

---

## 5. Components: reuse, don't hand-roll

### 5.1 shadcn/ui primitives

Installed with the shadcn CLI (`components.json`, style new-york). Always import from these paths.
Add new ones with `npx shadcn@4.23.0 add <name>`.

| Need | Import |
|---|---|
| Buttons (primary, outline, ghost, destructive) | `import { Button } from "@/components/ui/button"` |
| Text and number fields | `import { Input } from "@/components/ui/input"` |
| Field labels | `import { Label } from "@/components/ui/label"` |
| Unit, rep format and week 12 pickers | `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"` |
| Lighter-weeks toggle | `import { Checkbox } from "@/components/ui/checkbox"` or `import { Switch } from "@/components/ui/switch"` |
| Predicted Paces / 12-Week Builder / Connections | `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"` |
| Sign in / Create account switch | `Tabs` (same import) |
| Week and settings panels | `import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"` |
| Collapsible Plan settings | `import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"` |
| Race and pace tables | `import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"` |
| Phase and lighter-week labels | `import { Badge } from "@/components/ui/badge"` |
| Chart hover details | `import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"` |
| Delete-plan and "Send all" confirmations | `import { AlertDialog, ... } from "@/components/ui/alert-dialog"` |
| Inline errors and warnings | `import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"` |
| "Copied", "Sent", "Saved" feedback | `import { toast } from "sonner"` with `import { Toaster } from "@/components/ui/sonner"` |
| Dividers | `import { Separator } from "@/components/ui/separator"` |
| Weekly volume chart | `import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"` (Recharts) |
| Class merging | `import { cn } from "@/lib/utils"` |

Restyle shadcn through the tokens in `globals.css`. Don't fork a primitive's markup
to change its colour. Two local edits are allowed and already made:
- Control heights sit on the 8px grid and are thumb-sized on phones: `button`, `input` and
  `select` are 48px (`h-12`) below `md` and 40px (`h-10`) from `md`.
- `sonner` follows the system theme directly (no `next-themes`).

Shadows: the theme maps `shadow-xs`/`shadow-sm` to `none` and `shadow-md`/`shadow-lg`/`shadow-xl`
to the single `--shadow-float`. Radii: every `rounded-*` step is 8px except `rounded-full`.

### 5.2 Real components in this repo

These now exist in the Next.js app. Reuse them; never write a second version.

| Piece (where it came from in the old site) | Next.js component |
|---|---|
| Header band + account chip: `.site-header`, `#user-chip` (index.html), `updateAuthUi()` (app.js) | `import { SiteHeader } from "@/components/site-header"` |
| Home / sign-in card: `#home`, `#auth-form` (index.html), `initAuth()`, `onAuthSubmit()` (app.js) | `import { SignInCard } from "@/components/auth/sign-in-card"`, `import { HomeScreen } from "@/components/home-screen"` |
| PB form + race table + training pace table: `#panel-paces` (index.html), `renderPaces()` (app.js:225) | `PbForm`, `RaceTable`, `PaceTable`, `PacesScreen` from `@/components/paces/*` |
| My plans card: `#plans-card` (index.html), `loadPlanList()` (app.js:1252), `savePlan()`, `openPlan()`, `deletePlan()` | `import { MyPlans } from "@/components/plans/my-plans"` |
| Plan settings (collapsible): `#plan-settings` (index.html) | `import { PlanSettings } from "@/components/builder/plan-settings"` |
| Weekly template picker: `#week-template`, `renderTemplate()` (app.js:1546) | `import { WeekTemplate } from "@/components/builder/week-template"` |
| Weekly volume chart + totals: `#volume-chart`, `renderVolumeChart()` (app.js:1435), `barPath()` (app.js:1422) | `import { VolumeChart } from "@/components/builder/volume-chart"` |
| Week card and day cell: `.week`, `.day` markup in `renderBuilder()` (app.js:469) | `import { WeekCard } from "@/components/builder/week-card"`, `import { DayCell } from "@/components/builder/day-cell"` |
| Day action buttons (Copy / Send / COROS): `.day-actions` in `renderBuilder()` | `import { DayActions } from "@/components/builder/day-actions"`; sending logic in `import { useSend } from "@/components/builder/use-send"` |
| Connections tab: COROS card + intervals.icu form, `#panel-intervals` (index.html), `updateCorosUi()` (app.js:1074) | `import { CorosCard } from "@/components/connections/coros-card"`, `import { IntervalsCard } from "@/components/connections/intervals-card"` |
| App state (settings, plan, user, COROS) | `import { useApp } from "@/components/app-provider"` |

Logic moves to `lib/` with no UI in it, so components only render:

| Today (app.js) | Module |
|---|---|
| VDOT maths (`vdotFromRace`, `raceTimeForVdot`, `paceAtPercent`), `model()` → `buildModel()` | `@/lib/vdot` |
| Formatting (`fmtTime`, `rangeOf`, `dist`, dates) | `@/lib/format` |
| Settings type, defaults, storage, template warnings | `@/lib/settings` |
| `volumePlan()`, `repCounts()`, `buildSession()`, `buildPlan()`, `sessionSeconds()` | `@/lib/plan` |
| `workoutText()`, `copyText()` | `@/lib/workout-text` |
| `icuDescription()`, `icuEvent()`, `icuCall()` | `@/lib/intervals` |
| `corosCourse()`, direct COROS OAuth + MCP client | `@/lib/coros` |
| Supabase client and plan CRUD | `@/lib/supabase` |

## 5.3 Mobile

- Phone first. Navigation is a fixed bottom tab bar (Paces / Plan / Connect) below `md`,
  and top tabs from `md`. Pages pad their bottom so content clears the bar.
- Tap targets are at least 48px on phones (control heights above).
- Safe areas: the header pads `env(safe-area-inset-top)`, the bottom bar pads
  `env(safe-area-inset-bottom)`, gutters use `max(16px, env(safe-area-inset-left))`.
- Weeks are collapsible; days are full-width rows on every size, never seven squeezed columns.
- Wide data (race table) scrolls inside its own container; the page never scrolls sideways.

---

## 6. Forbidden

- **Three rounded cards in a row.** No feature-card trios on the home page or anywhere
  else. Use a list, a table, or one asymmetric layout.
- **Centred-everything heroes.** Hero content is left-aligned on a grid, with one
  hero figure (section 3). No centred headline + subline + two buttons stack.
- **0.1-opacity drop shadows on everything.** No `shadow-sm` / `shadow` /
  `shadow-md` on cards, tabs, buttons or inputs. Separation comes from a 1px
  `--border` or a surface colour change. Floating layers (tooltip, popover, dialog)
  may have **one** shadow, defined once as `--shadow-float`.
- Banned fonts (section 1), purple/indigo (section 2.5), weights 500–700 (section 3),
  and off-grid spacing (section 4).
- Emoji as icons or section markers. Use `lucide-react` icons, which ship with shadcn.
- Number badges (01 / 02 / 03) unless the content is a real sequence.
- Colour as the only signal. Every coloured state also has a text label or icon.
- Hand-rolled versions of anything in section 5.

---

## 7. Checklist before showing any UI

1. Fonts: display, body and mono only. No banned family appears anywhere, including fallbacks.
2. Colour: only `--primary` and `--accent` as brand colours, accent used once per viewport, data tokens only in data.
3. Type: sizes from 12 / 16 / 48 / 144 only. Weights only 200, 400 or 800.
4. Spacing: every value a multiple of 8, apart from the 4px in-control exception.
5. Components: built from section 5 imports. Nothing duplicated.
6. Nothing from section 6.
7. Both light and dark modes checked, and 390px width with no horizontal scroll.
