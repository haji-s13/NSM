import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Settings } from "./settings";

// Public values (the publishable key is designed to ship to browsers; row-level
// security keeps each person's plans private). Empty = guest-only.
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ykfkgmoltgpxjonvomgw.supabase.co")
  .trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_aIdIBxFXoVGGO-aTi_mINA_MHQ-om93";

export const authEnabled = !!(URL && KEY);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!authEnabled || typeof window === "undefined") return null;
  client ??= createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export interface PlanRow { id: string; name: string; updated_at: string }

export function planError(error: unknown): string {
  const m = String((error as { message?: string })?.message || "");
  if (/relation .*plans.* does not exist|could not find the table/i.test(m)) return "The plans table isn't set up yet. Run the SQL in SUPABASE_SETUP.md.";
  if (/permission denied for table plans/i.test(m)) return "Your account can't use the plans table yet. Run the grant line from SUPABASE_SETUP.md.";
  if (/JWT|expired|not authenticated/i.test(m)) return "Your sign-in has expired. Sign out and sign in again.";
  if (/fetch|network/i.test(m)) return "Couldn't reach your saved plans. Check your connection and try again.";
  return m || "Something went wrong with your saved plans.";
}

export async function listPlans(): Promise<PlanRow[]> {
  const { data, error } = await supabase()!.from("plans").select("id,name,updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return data as PlanRow[];
}
export async function createPlan(name: string, settings: Settings): Promise<string> {
  const { data, error } = await supabase()!.from("plans").insert({ name, settings }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}
export async function updatePlan(id: string, name: string, settings: Settings) {
  const { error } = await supabase()!.from("plans").update({ name, settings, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function getPlan(id: string): Promise<{ id: string; name: string; settings: Settings }> {
  const { data, error } = await supabase()!.from("plans").select("id,name,settings").eq("id", id).single();
  if (error) throw error;
  return data as { id: string; name: string; settings: Settings };
}
export async function deletePlan(id: string) {
  const { error } = await supabase()!.from("plans").delete().eq("id", id);
  if (error) throw error;
}
