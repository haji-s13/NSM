"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/components/app-provider";
import { authEnabled, createPlan, deletePlan, getPlan, listPlans, planError, updatePlan, type PlanRow } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** Save, open and delete named plans on the signed-in profile. */
export function MyPlans() {
  const { user, settings, replaceSettings, currentPlan, setCurrentPlan, goHome } = useApp();
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<PlanRow | null>(null);

  const refresh = useCallback(async () => {
    try { setRows(await listPlans()); } catch (e) { setRows([]); toast.error(planError(e)); }
  }, []);
  useEffect(() => { if (user) refresh(); }, [user, refresh]);
  useEffect(() => { if (currentPlan) setName(currentPlan.name); }, [currentPlan]);

  if (!user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4 md:px-6">
        <p className="text-muted-foreground">Sign in to save plans to your profile and open them on any device.</p>
        {authEnabled && <Button variant="outline" onClick={goHome}>Sign in or create account</Button>}
      </div>
    );
  }

  async function save(asNew: boolean) {
    const n = name.trim() || (!asNew && currentPlan ? currentPlan.name : "");
    if (!n) { toast.error("Give the plan a name first."); return; }
    setBusy(true);
    try {
      if (currentPlan && !asNew) { await updatePlan(currentPlan.id, n, settings); setCurrentPlan({ id: currentPlan.id, name: n }); }
      else setCurrentPlan({ id: await createPlan(n, settings), name: n });
      toast.success(`Saved “${n}”.`);
      refresh();
    } catch (e) { toast.error(planError(e)); } finally { setBusy(false); }
  }

  async function open(id: string) {
    try {
      const p = await getPlan(id);
      replaceSettings(p.settings);
      setCurrentPlan({ id: p.id, name: p.name });
      toast.success(`Opened “${p.name}”. Changes aren't saved until you click Save changes.`);
    } catch (e) { toast.error(planError(e)); }
  }

  async function remove(p: PlanRow) {
    try {
      await deletePlan(p.id);
      if (currentPlan?.id === p.id) { setCurrentPlan(null); setName(""); }
      toast.success(`Deleted “${p.name}”.`);
      refresh();
    } catch (e) { toast.error(planError(e)); }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-black">My plans</h2>
        {currentPlan && <p className="font-extralight text-muted-foreground">Editing “{currentPlan.name}”</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="plan-name">Plan name</Label>
          <Input id="plan-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring 10k build" />
        </div>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => save(false)} className="flex-1 sm:flex-none"><Save aria-hidden />{currentPlan ? "Save changes" : "Save plan"}</Button>
          {currentPlan && <Button variant="outline" disabled={busy} onClick={() => save(true)} className="flex-1 sm:flex-none">Save as new</Button>}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {rows === null && <li className="text-muted-foreground">Loading your plans…</li>}
        {rows?.length === 0 && <li className="font-extralight text-muted-foreground">No saved plans yet. Set up a plan below, name it and save it.</li>}
        {rows?.map((p) => (
          <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 pl-4", currentPlan?.id === p.id && "border-primary")}>
            <span className="min-w-0 break-words">
              <span className="font-black">{p.name}</span>{" "}
              <span className="font-extralight text-muted-foreground">· {new Date(p.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => open(p.id)}><FolderOpen aria-hidden /> Open</Button>
              <Button size="sm" variant="ghost" onClick={() => setToDelete(p)} aria-label={`Delete ${p.name}`}><Trash2 aria-hidden /></Button>
            </span>
          </li>
        ))}
      </ul>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes the plan from your profile on every device. It can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => toDelete && remove(toDelete)}>Delete plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
