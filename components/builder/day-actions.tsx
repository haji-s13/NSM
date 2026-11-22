"use client";

import { useState } from "react";
import { Check, Copy, Send, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/components/app-provider";
import { dayDate, type Week } from "@/lib/plan";
import { dayItems } from "@/lib/coros";
import { useSend } from "./use-send";

/** Copy, Send (intervals.icu) and COROS for one day. */
export function DayActions({ wk, i }: { wk: Week; i: number }) {
  useApp(); // re-render when sent state changes
  const { copy, sendIcu, sendCoros, busy, isSent, corosReady } = useSend();
  const [confirm, setConfirm] = useState(false);
  const date = dayDate(wk, i);
  const key = `day-${wk.n}-${i}`;
  const sent = isSent(date);
  const coros = () => sendCoros(key, dayItems(wk).filter((it) => it.i === i), `week ${wk.n} day`);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => copy(wk, i)} aria-label={`Copy week ${wk.n} workout`}>
        <Copy aria-hidden /> Copy
      </Button>
      <Button size="sm" variant="outline" disabled={busy === `${key}-icu`} onClick={() => sendIcu(`${key}-icu`, [{ wk, i }], `week ${wk.n}`)} aria-label="Send to intervals.icu">
        <Send aria-hidden /> icu
      </Button>
      {corosReady && (
        <Button size="sm" variant={sent ? "secondary" : "outline"} disabled={busy === key}
          onClick={() => (sent ? setConfirm(true) : coros())} aria-label="Add to COROS">
          {sent ? <Check aria-hidden /> : <Watch aria-hidden />} COROS
        </Button>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Already in COROS</AlertDialogTitle>
            <AlertDialogDescription>
              This workout was sent from this device before. Sending again adds a second copy. To replace it, delete the old one in the COROS app first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={coros}>Add a second copy</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
