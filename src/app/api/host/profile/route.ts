import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { ensureHostProfile } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function GET() {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await ensureHostProfile(hostUser);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }

  try {
    await ensureHostProfile(hostUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bootstrap profile.";
    return NextResponse.redirect(
      new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url),
      { status: 303 },
    );
  }

  const formData = await request.formData();
  const displayName = formString(formData, "display_name");
  if (!displayName) {
    return NextResponse.redirect(new URL("/host/settings?error=display_name_required", request.url), {
      status: 303,
    });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("host_profiles").upsert({
    user_id: hostUser.id,
    display_name: displayName,
    cash_app_url: formString(formData, "cash_app_url") || null,
    paypal_url: formString(formData, "paypal_url") || null,
    venmo_url: formString(formData, "venmo_url") || null,
    zelle_url: formString(formData, "zelle_url") || null,
    google_pay_url: formString(formData, "google_pay_url") || null,
    apple_pay_url: formString(formData, "apple_pay_url") || null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/host/settings?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 },
    );
  }

  return NextResponse.redirect(new URL("/host/settings?saved=1", request.url), { status: 303 });
}
