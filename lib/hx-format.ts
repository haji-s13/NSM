/* Turns one prescription string into something you can read mid-session:
 * a heading (rounds, format, rest), a list of steps, and coaching cues underneath. */

export interface HxLine { head: string; items: string[] }
export interface HxPretty { lines: HxLine[]; notes: string[] }

/** Split on separators that are not inside brackets. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const m = sep.exec(s.slice(i));
      if (m && m.index === 0) { out.push(cur); cur = ""; i += m[0].length - 1; continue; }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const ITEM_SEP = /^(, then |, | \+ |\. )/;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const tidy = (s: string) => cap(s.replace(/^[,.;:\s]+|[,;:\s]+$/g, ""));

/** "4 × (400 m row, 100 m farmers)…" → "4 rounds" + steps; "E4MOM × 3: a + b" → "E4MOM × 3" + steps. */
function parsePart(part: string): HxLine {
  // N × ( … ) with optional prefix and suffix (rest, cues).
  const m = /^(.*?)(\d+) × ((?:AMRAP|EMOM)[^(),;]*?)?\s?\(/.exec(part);
  if (m) {
    const open = m[0].length - 1;
    let depth = 0, close = -1;
    for (let i = open; i < part.length; i++) {
      if (part[i] === "(") depth++;
      if (part[i] === ")") { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close > 0) {
      const prefix = tidy(m[1]);
      const n = Number(m[2]);
      const suffix = tidy(part.slice(close + 1));
      const what = m[3]?.trim() ? `${n} × ${m[3]!.trim()}` : `${n} round${n === 1 ? "" : "s"}`;
      const head = [prefix, what].filter(Boolean).join(" · ") + (suffix ? ` · ${suffix.toLowerCase()}` : "");
      return { head, items: splitTop(part.slice(open + 1, close), ITEM_SEP).map(tidy) };
    }
  }
  // "Heading: a + b, c" style lists.
  const colon = part.indexOf(": ");
  if (colon > 0 && colon < 60) {
    const items = splitTop(part.slice(colon + 2), ITEM_SEP).map(tidy);
    if (items.length > 1) return { head: tidy(part.slice(0, colon)), items };
    return { head: tidy(part.slice(0, colon)), items: [tidy(part.slice(colon + 2))] };
  }
  // "A, then B, then C" reads better as steps.
  const steps = splitTop(part, /^, then /).map(tidy);
  if (steps.length > 1) return { head: "", items: steps };
  return { head: tidy(part), items: [] };
}

export function prettyBlock(text: string): HxPretty {
  // First sentence is the work; later sentences are cues ("Transitions under 30 s.").
  const sentences = text.split(/(?<=[.!])\s+(?=[A-Z"])/);
  let main = sentences[0].replace(/\.$/, "");
  const notes = sentences.slice(1).map((s) => s.replace(/\.$/, "")).filter(Boolean);
  // "Round 1: …. Round 2: …" style continuations belong to the work, not the cues.
  while (notes.length && /^(Round \d|Then |Repeat |Last set)/.test(notes[0])) main += "; " + notes.shift()!;
  const lines = splitTop(main, /^; /).map(parsePart);
  return { lines, notes };
}

/** Plain-text version for Copy / Strava / intervals.icu. */
export function prettyText(label: string, text: string): string {
  const p = prettyBlock(text);
  const out: string[] = [];
  p.lines.forEach((l, i) => {
    if (l.head || i === 0) out.push(`${i === 0 ? `${label}: ` : ""}${l.head}`.trimEnd());
    l.items.forEach((it) => out.push(`  • ${it}`));
  });
  p.notes.forEach((n) => out.push(`  ${n}.`));
  return out.join("\n");
}
