import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type HostProfile = {
  user_id: string;
  display_name: string;
  cash_app_url: string | null;
  paypal_url: string | null;
  venmo_url: string | null;
  zelle_url: string | null;
  google_pay_url: string | null;
  apple_pay_url: string | null;
  is_pro: boolean;
  stripe_account_id: string | null;
  stripe_connected_at: string | null;
  created_at: string;
  updated_at: string;
};

function defaultDisplayName(user: User) {
  return user.email?.split("@")[0] || "Host";
}

async function readHostProfile(userId: string): Promise<HostProfile | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("host_profiles")
    .select(
      "user_id, display_name, cash_app_url, paypal_url, venmo_url, zelle_url, google_pay_url, apple_pay_url, is_pro, stripe_account_id, stripe_connected_at, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function ensureHostProfile(user: User): Promise<HostProfile> {
  const existing = await readHostProfile(user.id);
  if (existing) {
    return existing;
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("host_profiles").insert({
    user_id: user.id,
    display_name: defaultDisplayName(user),
    is_pro: false,
    stripe_account_id: null,
    stripe_connected_at: null,
    updated_at: now,
  });

  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message);
  }

  const created = await readHostProfile(user.id);
  if (!created) {
    throw new Error("Failed to bootstrap host profile.");
  }
  return created;
}
