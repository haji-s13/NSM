"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/components/app-provider";
import { supabase } from "@/lib/supabase";

/** Shown after opening a password-reset link: choose a new password. */
export function NewPasswordCard() {
  const { finishRecovery } = useApp();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase()!.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(/session|expired|invalid/i.test(err.message)
        ? "This reset link has expired. Request a new one from the sign-in page."
        : err.message);
      return;
    }
    toast.success("Password updated. You're signed in.");
    finishRecovery();
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-[max(16px,env(safe-area-inset-left))] py-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16 md:px-8 md:py-16">
      <section className="flex min-w-0 flex-col gap-4">
        <p className="text-meta uppercase text-signal">Account</p>
        <h1 className="font-display text-[2rem] leading-10 font-black md:text-display">Set A New Password</h1>
        <p className="max-w-[65ch] text-muted-foreground">Choose a new password for your planner account. You&apos;ll stay signed in on this device.</p>
      </section>
      <Card className="gap-0 py-0">
        <CardContent className="p-6">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">Update password</Button>
            {error && <p role="alert" className="font-black text-status-error">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
