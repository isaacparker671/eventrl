import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/auth/requireHost";

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
}

