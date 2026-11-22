"use client";

import { useEffect, useState } from "react";
import { ChevronDown, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/components/app-provider";
import { previewSessionText } from "@/lib/hyrox";
import { LIB_KINDS, LIB_PHASES, type LibKind, type LibPhase, type LibSession } from "@/lib/session-library";
import { deleteSession, saveSession, sessionError } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const OPEN_KEY = "nsm-hx-library-collapsed";

/** Browse the session library, switch sessions on or off for this plan, and add your own. */
export function SessionLibrary() {
  const { library, librarySource, refreshLibrary, settings, updateHyrox, user } = useApp();
  const h = settings.hyrox;
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(localStorage.getItem(OPEN_KEY) === "0"); } catch { /* ignore */ } }, []);
  const openChange = (o: boolean) => { setOpen(o); try { localStorage.setItem(OPEN_KEY, o ? "0" : "1"); } catch { /* ignore */ } };
  const [kind, setKind] = useState<LibKind>("quality_long");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ s: LibSession; isNew: boolean } | null>(null);
  const off = new Set(h.disabledSessions || []);
  const list = library.filter((s) => s.kind === kind);
  const toggleUse = (id: string, on: boolean) => updateHyrox({ disabledSessions: on ? [...off].filter((x) => x !== id) : [...off, id] });
  const canEdit = !!user && librarySource === "database";

  async function remove(s: LibSession) {
    try { await deleteSession(s.id); toast.success(`Deleted “${s.name}”.`); await refreshLibrary(); }
    catch (e) { toast.error(sessionError(e)); }
  }

  return (
    <Collapsible open={open} onOpenChange={openChange} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-4 text-left font-black hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring md:px-6">
        <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden /> Session Library
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 border-t p-4 md:p-6">
        <p className="max-w-[65ch] font-extralight text-muted-foreground">
          The plan picks your HYROX Quality (long and short) and aerobic days from these sessions, matched to the phase and rotated week to week. Switch a session off to keep it out of this plan.
        </p>
        <p className="text-meta text-muted-foreground">
          {librarySource === "database" ? `From your database · ${library.length} sessions` : "Built-in sessions. Run supabase/hyrox_sessions.sql in Supabase to keep the library in your database and add your own."}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid w-full grid-cols-3 rounded-lg bg-muted p-1 md:w-auto" role="group" aria-label="Session type">
            {(Object.keys(LIB_KINDS) as LibKind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                className={cn("flex min-h-12 flex-col items-center justify-center rounded-md px-2 leading-tight md:min-h-10", kind === k ? "bg-card font-black text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <span>{LIB_KINDS[k]}</span><span className="num text-meta font-extralight">{library.filter((s) => s.kind === k).length} sessions</span>
              </button>
            ))}
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditing({ isNew: true, s: { id: "", kind, name: "", phases: ["build"], minutes: 40, blocks: [{ label: "Main", text: "" }] } })}>
              <Plus aria-hidden /> New session
            </Button>
          )}
        </div>

        <ul className="flex flex-col divide-y rounded-lg border">
          {list.map((s) => {
            const mine = !!s.user_id;
            const on = !off.has(s.id);
            const isOpen = expanded === s.id;
            return (
              <li key={s.id} className={cn("flex flex-col gap-2 p-3", !on && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(isOpen ? null : s.id)} aria-expanded={isOpen}>
                    <span className="font-black">{s.name}</span>{mine && <span className="ml-2 text-meta uppercase text-signal">Mine</span>}
                    <span className="block text-meta text-muted-foreground">
                      ~{s.minutes} min · {s.phases.map((p) => LIB_PHASES[p]).join(", ")}
                    </span>
                  </button>
                  <label className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
                    <Switch checked={on} onCheckedChange={(v) => toggleUse(s.id, v)} aria-label={`Use ${s.name} in the plan`} /> Use
                  </label>
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
                    {s.blocks.map((b, i) => <p key={i} className="break-words"><span className="mr-2 text-meta uppercase text-muted-foreground">{b.label}</span>{previewSessionText(h, b.text)}</p>)}
                    {s.source && <p className="text-meta text-muted-foreground">Source: {s.source}</p>}
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing({ isNew: true, s: { ...s, id: "", name: `${s.name} (my version)`, user_id: undefined } })}><CopyPlus aria-hidden /> Duplicate</Button>
                        {mine && <Button size="sm" variant="outline" onClick={() => setEditing({ isNew: false, s })}><Pencil aria-hidden /> Edit</Button>}
                        {mine && <Button size="sm" variant="ghost" onClick={() => remove(s)}><Trash2 aria-hidden /> Delete</Button>}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!user && <p className="font-extralight text-muted-foreground">Sign in to add your own sessions or make your own versions.</p>}
        {editing && <SessionEditor key={editing.s.id || "new"} initial={editing.s} isNew={editing.isNew} onDone={async (saved) => { setEditing(null); if (saved) await refreshLibrary(); }} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Add or edit one of your own sessions. Blocks are one per line: "A: text". */
function SessionEditor({ initial, isNew, onDone }: { initial: LibSession; isNew: boolean; onDone: (saved: boolean) => void }) {
  const [s, setS] = useState(initial);
  const [text, setText] = useState(initial.blocks.map((b) => `${b.label}: ${b.text}`).join("\n"));
  const [busy, setBusy] = useState(false);
  const togglePhase = (p: LibPhase) => setS({ ...s, phases: s.phases.includes(p) ? s.phases.filter((x) => x !== p) : [...s.phases, p] });

  async function save() {
    const blocks = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = /^([^:]{1,12}):\s*(.+)$/.exec(l);
      return m ? { label: m[1].trim(), text: m[2].trim() } : { label: "Main", text: l };
    });
    if (!s.name.trim()) return toast.error("Give the session a name.");
    if (!blocks.length) return toast.error("Add at least one line of work.");
    if (!s.phases.length) return toast.error("Pick at least one phase.");
    setBusy(true);
    try { await saveSession({ ...s, name: s.name.trim(), blocks }, isNew); toast.success(`Saved “${s.name.trim()}”.`); onDone(true); }
    catch (e) { toast.error(sessionError(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border-2 border-primary p-4" aria-label="Edit session">
      <h3 className="font-black">{isNew ? "New Session" : "Edit Session"}</h3>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px_120px]">
        <div className="flex flex-col gap-2"><Label htmlFor="ses-name">Name</Label>
          <Input id="ses-name" maxLength={80} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="ses-kind">Type</Label>
          <Select value={s.kind} onValueChange={(v) => setS({ ...s, kind: v as LibKind })}>
            <SelectTrigger id="ses-kind" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(LIB_KINDS) as LibKind[]).map((k) => <SelectItem key={k} value={k}>{LIB_KINDS[k]}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="flex flex-col gap-2"><Label htmlFor="ses-min">Minutes</Label>
          <Input id="ses-min" className="num" type="number" inputMode="numeric" min={5} max={240} value={s.minutes} onChange={(e) => setS({ ...s, minutes: Math.max(5, Number(e.target.value) || 5) })} /></div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-meta uppercase text-muted-foreground">Phases</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LIB_PHASES) as LibPhase[]).map((p) => (
            <button key={p} type="button" aria-pressed={s.phases.includes(p)} onClick={() => togglePhase(p)}
              className={cn("min-h-10 rounded-lg border px-3", s.phases.includes(p) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent/60")}>{LIB_PHASES[p]}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ses-blocks">Work, one block per line ("A: …")</Label>
        <textarea id="ses-blocks" rows={5} value={text} onChange={(e) => setText(e.target.value)}
          className="min-h-32 rounded-md border border-input bg-card p-3 focus-visible:outline-2 focus-visible:outline-ring" />
        <p className="text-meta text-muted-foreground">
          Placeholders: {"{w:push}"} {"{w:pull}"} {"{w:farmers}"} {"{w:lunges}"} {"{w:wb}"} (add +10, -10 or *1.5), {"{w:heavyball}"}, {"{leg:1000:threshold}"} for a run leg, {"{n:4}"} for rounds that scale with the week, {"{inc:5}"} for a load step.
        </p>
      </div>
      <div className="flex flex-col gap-2"><Label htmlFor="ses-src">Source or note</Label>
        <Input id="ses-src" maxLength={120} value={s.source || ""} onChange={(e) => setS({ ...s, source: e.target.value })} /></div>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={save}>Save session</Button>
        <Button variant="outline" disabled={busy} onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </section>
  );
}
