import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }

  const scannerRedirect = await getScannerOnlyRedirect(hostUser);
  if (scannerRedirect) {
    return NextResponse.redirect(new URL(`${scannerRedirect}?error=scanner_role_limited`, request.url), { status: 303 });
  }

  const formData = await request.formData();
  const confirmText = String(formData.get("confirm_text") ?? "").trim();
  if (confirmText !== "DELETE") {
    return NextResponse.redirect(
      new URL("/host/settings?error=Type%20DELETE%20to%20confirm%20account%20deletion.", request.url),
      { status: 303 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(hostUser.id);
  if (error) {
    return NextResponse.redirect(
      new URL(`/host/settings?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 },
    );
  }

  const response = NextResponse.redirect(new URL("/host/login?deleted=1", request.url), { status: 303 });
  response.cookies.delete("sb-access-token");
  response.cookies.delete("sb-refresh-token");
  return response;
}
