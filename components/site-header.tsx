"use client";

import { LogOut, UserRound } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { authEnabled } from "@/lib/supabase";

/** Fjord-blue band with the wordmark and who's using the planner. */
export function SiteHeader({ showAccount = true }: { showAccount?: boolean }) {
  const { user, entry, signOut, goHome } = useApp();
  const name = (user?.user_metadata?.display_name as string | undefined) || user?.email || "Guest";
  return (
    <header className="bg-primary text-primary-foreground no-print pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-[max(16px,env(safe-area-inset-left))] md:px-8">
        <a href="#paces" className="flex min-w-0 items-baseline gap-2">
          <span className="font-display text-[1.5rem] leading-8 font-black tracking-tight">Singles</span>
          <span className="text-meta uppercase opacity-80">Planner</span>
        </a>
        {showAccount && entry && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden min-w-0 items-center gap-2 sm:flex">
              <UserRound className="size-4 shrink-0 opacity-80" aria-hidden />
              <span className="truncate">{name}</span>
            </span>
            <button
              type="button"
              onClick={() => (user ? signOut() : goHome())}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary-foreground px-4 font-black text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
            >
              {user ? <><LogOut className="size-4" aria-hidden /> Sign out</> : authEnabled ? "Sign in" : "Home"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
