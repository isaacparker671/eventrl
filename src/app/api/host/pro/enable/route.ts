import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { ensureHostProfile } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }

  try {
    await ensureHostProfile(hostUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bootstrap profile.";
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("host_profiles")
    .update({ is_pro: true, updated_at: new Date().toISOString() })
    .eq("user_id", hostUser.id);

  if (error) {
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(error.message)}`, request.url), {
      status: 303,
    });
  }

  return NextResponse.redirect(new URL("/host/settings?saved=1", request.url), { status: 303 });
}
