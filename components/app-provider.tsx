"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { buildModel, type Model } from "@/lib/vdot";
import { buildPlan, type Plan } from "@/lib/plan";
import { buildHyrox, type HxPlan, type HyroxSettings } from "@/lib/hyrox";
import { buildCalendar, type Calendar } from "@/lib/calendar";
import { loadLocal, normalizeSettings, saveLocal, type Settings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import { COROS_SERVER, corosConnected, corosHandleRedirect, directCoros, type CorosClient } from "@/lib/coros";

export type Screen = "dashboard" | "builder" | "hyrox" | "paces";
type Entry = "guest" | "account" | null;

interface AppState {
  ready: boolean;
  settings: Settings;
  update: (patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void;
  replaceSettings: (s: Settings) => void;
  model: Model | null;
  plan: Plan | null;
  hyrox: HxPlan;
  calendar: Calendar;
  updateHyrox: (patch: Partial<HyroxSettings>) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
  entry: Entry;
  enterAsGuest: () => void;
  goHome: () => void;
  user: User | null;
  recovering: boolean;            // opened a password-reset link
  finishRecovery: () => void;
  signOut: () => Promise<void>;
  currentPlan: { id: string; name: string } | null;
  setCurrentPlan: (p: { id: string; name: string } | null) => void;
  coros: { client: CorosClient | null; source: "direct" | "connector" | null; server: string };
  refreshCoros: () => void;
  sentVersion: number;
  bumpSent: () => void;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
};

const ENTRY_KEY = "nsm-entry";
const readEntry = (): Entry => { try { return (localStorage.getItem(ENTRY_KEY) as Entry) || null; } catch { return null; } };
const writeEntry = (v: Entry) => { try { if (v) localStorage.setItem(ENTRY_KEY, v); else localStorage.removeItem(ENTRY_KEY); } catch { /* ignore */ } };

function screenFromHash(): Screen {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  if (h === "builder") return "builder";
  if (h === "hyrox") return "hyrox";
  if (h === "paces" || h === "profile" || h === "connections" || h === "intervals") return "paces";
  return "dashboard";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => normalizeSettings({}));
  const [screen, setScreenState] = useState<Screen>("dashboard");
  const [entry, setEntryState] = useState<Entry>(null);
  const [user, setUser] = useState<User | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<{ id: string; name: string } | null>(null);
  const [coros, setCoros] = useState<AppState["coros"]>({ client: null, source: null, server: COROS_SERVER });
  const [sentVersion, setSentVersion] = useState(0);

  const refreshCoros = useCallback(() => {
    setCoros((c) => (c.source === "connector" ? c
      : corosConnected() ? { client: directCoros, source: "direct", server: COROS_SERVER }
      : { client: null, source: null, server: COROS_SERVER }));
  }, []);

  // Load per-device state once in the browser.
  useEffect(() => {
    // Opened from a password-reset email (we add ?reset=1 to its return address).
    if (new URLSearchParams(location.search).get("reset") === "1" || /type=recovery/.test(location.hash)) setRecovering(true);
    setSettings(loadLocal());
    setScreenState(screenFromHash());
    if (/^#(connections|intervals)$/.test(location.hash)) setTimeout(() => document.getElementById("connections")?.scrollIntoView(), 300);
    setEntryState(readEntry());
    refreshCoros();
    setReady(true);
    const onHash = () => setScreenState(screenFromHash());
    window.addEventListener("hashchange", onHash);

    corosHandleRedirect().then((r) => {
      if (!r) return;
      setScreenState("paces");
      setTimeout(() => document.getElementById("connections")?.scrollIntoView(), 300);
      if (r.ok) toast.success(r.message); else toast.error(r.message);
      refreshCoros();
    });

    // On claude.ai the page can use the viewer's Claude NSM connector instead.
    const c = (window as unknown as { claude?: { use?: (n: string) => Promise<CorosClient | null> } }).claude;
    c?.use?.("mcp").then((m) => { if (m) setCoros({ client: m, source: "connector", server: COROS_SERVER }); }).catch(() => {});

    return () => window.removeEventListener("hashchange", onHash);
  }, [refreshCoros]);

  // Accounts.
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => { if (data.session) setUser(data.session.user); });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
        setUser(session?.user ?? null);
        if (session?.user) { writeEntry("account"); setEntryState("account"); }
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
    setSettings((s) => { const n = { ...s, ...(typeof patch === "function" ? patch(s) : patch) }; saveLocal(n); return n; });
  }, []);
  const updateHyrox = useCallback((patch: Partial<HyroxSettings>) => {
    setSettings((s) => { const n = { ...s, hyrox: { ...s.hyrox, ...patch } }; saveLocal(n); return n; });
  }, []);
  const replaceSettings = useCallback((s: Settings) => { const n = normalizeSettings(s); saveLocal(n); setSettings(n); }, []);

  const setScreen = useCallback((s: Screen) => {
    setScreenState(s);
    history.replaceState(null, "", `#${s}`);
    window.scrollTo({ top: 0 });
  }, []);

  const model = useMemo(() => buildModel(settings.pbDistance, settings.pbTime, settings.paceAdjust), [settings.pbDistance, settings.pbTime, settings.paceAdjust]);
  const calendar = useMemo(() => buildCalendar(settings.startDate, settings.endDate, settings.races, settings.vacations),
    [settings.startDate, settings.endDate, settings.races, settings.vacations]);
  const plan = useMemo(() => (model ? buildPlan(settings, model, calendar) : null), [settings, model, calendar]);
  const hyrox = useMemo(() => buildHyrox(settings.hyrox, calendar), [settings.hyrox, calendar]);

  const value: AppState = {
    ready, settings, update, replaceSettings, model, plan, hyrox, calendar, updateHyrox, screen, setScreen,
    entry: user ? "account" : entry,
    enterAsGuest: () => { writeEntry("guest"); setEntryState("guest"); },
    goHome: () => { writeEntry(null); setEntryState(null); },
    user,
    recovering,
    finishRecovery: () => { setRecovering(false); history.replaceState(null, "", location.pathname + "#paces"); setScreenState("paces"); },
    signOut: async () => {
      await supabase()?.auth.signOut();
      setUser(null); setCurrentPlan(null); writeEntry(null); setEntryState(null);
    },
    currentPlan, setCurrentPlan,
    coros, refreshCoros,
    sentVersion, bumpSent: () => setSentVersion((v) => v + 1),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
