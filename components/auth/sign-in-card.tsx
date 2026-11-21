"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useApp } from "@/components/app-provider";
import { authEnabled, supabase } from "@/lib/supabase";

/** Sign in, create an account, or continue as a guest. */
export function SignInCard() {
  const { enterAsGuest } = useApp();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [resetting, setResetting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg({ text: "Enter a valid email address.", error: true });
    if (password.length < 8) return setMsg({ text: "Use a password of at least 8 characters.", error: true });
    setBusy(true);
    setMsg({ text: mode === "signup" ? "Creating your account…" : "Signing in…" });
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim() || email.split("@")[0] }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) {
          setMode("signin");
          setMsg({ text: "Check your email and click the confirmation link, then sign in here." });
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      const m = String((err as { message?: string })?.message || "");
      const text = /invalid login/i.test(m) ? "That email and password don't match an account."
        : /not confirmed/i.test(m) ? "Confirm your email first: click the link we sent you, then sign in."
        : /already registered/i.test(m) ? "That email already has an account. Sign in instead."
        : /fetch|network/i.test(m) ? "Couldn't reach the account service. Check your connection and try again."
        : m || "Something went wrong. Try again.";
      setMsg({ text, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg({ text: "Enter the email you signed up with.", error: true });
    setBusy(true);
    setMsg({ text: "Sending…" });
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname + "?reset=1" });
    setBusy(false);
    if (error && /rate|seconds|too many/i.test(error.message)) {
      return setMsg({ text: "Too many requests. Wait a minute and try again.", error: true });
    }
    if (error && /fetch|network/i.test(error.message)) {
      return setMsg({ text: "Couldn't reach the account service. Check your connection and try again.", error: true });
    }
    // Same message whether or not the email has an account, so addresses can't be probed.
    setMsg({ text: "If that email has an account, a reset link is on its way. Open it on this device." });
  }

  if (resetting) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-black">Reset your password</h2>
            <p className="text-muted-foreground">Enter your account email and we&apos;ll send you a link to set a new password.</p>
          </div>
          <form onSubmit={sendReset} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <Button type="submit" disabled={busy} className="w-full">Send reset link</Button>
            <p role="status" className={msg?.error ? "font-black text-status-error" : "text-muted-foreground"}>{msg?.text}</p>
          </form>
          <Button variant="ghost" className="w-full" onClick={() => { setResetting(false); setMsg(null); }}>Back to sign in</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 p-6">
        {authEnabled ? (
          <>
            <Tabs value={mode} onValueChange={(v) => { setMode(v as "signin" | "signup"); setMsg(null); }}>
              <TabsList className="grid h-12 w-full grid-cols-2 p-1 group-data-[orientation=horizontal]/tabs:h-12">
                <TabsTrigger value="signin" className="h-10">Sign in</TabsTrigger>
                <TabsTrigger value="signup" className="h-10">Create account</TabsTrigger>
              </TabsList>
            </Tabs>
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              {mode === "signup" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="auth-name">Name</Label>
                  <Input id="auth-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="auth-email">Email</Label>
                <Input id="auth-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="auth-password">Password</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => { setResetting(true); setMsg(null); }}
                      className="min-h-10 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <Button type="submit" disabled={busy} className="w-full">{mode === "signup" ? "Create account" : "Sign in"}</Button>
              <p role="status" className={msg?.error ? "font-black text-status-error" : "text-muted-foreground"}>{msg?.text}</p>
            </form>
            <div className="flex items-center gap-4 text-meta uppercase text-muted-foreground">
              <Separator className="flex-1" /> or <Separator className="flex-1" />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Accounts aren&apos;t set up on this site yet. You can still use every feature as a guest.</p>
        )}
        <Button variant="outline" className="w-full" onClick={enterAsGuest}>Continue as guest</Button>
        <p className="font-extralight text-muted-foreground">As a guest, your settings stay in this browser only.</p>
      </CardContent>
    </Card>
  );
}
