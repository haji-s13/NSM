"use client";

import { Check, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { useApp } from "@/components/app-provider";

/** Guests: nothing is saved. Signed in: saved to your account (private to you). */
export function SaveStatus() {
  const { saveState, saveError, user } = useApp();
  const text = {
    guest: "Guest · nothing is saved",
    loading: "Loading your account…",
    saving: "Saving to your account…",
    saved: `Saved to your account${user?.email ? ` (${user.email})` : ""}`,
    error: saveError || "Couldn't save to your account",
  }[saveState];
  const Icon = saveState === "guest" ? CloudOff : saveState === "error" ? TriangleAlert : saveState === "saved" ? Check : Loader2;
  return (
    <p className={`flex items-center gap-2 text-meta ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`} role="status" aria-live="polite">
      <Icon className={`size-4 shrink-0 ${saveState === "loading" || saveState === "saving" ? "animate-spin" : ""}`} aria-hidden />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}
