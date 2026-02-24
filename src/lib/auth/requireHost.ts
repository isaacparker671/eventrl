import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

type RequireHostOptions = {
  onUnauthenticated?: "redirect" | "throw";
  redirectTo?: string;
};

export async function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can read cookies but may not be able to set them.
        }
      },
    },
  });
}

export async function getCurrentHostUser(): Promise<User | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("[auth-failure] Supabase getUser failed.", { message: error.message });
    return null;
  }

  return user;
}

export async function requireHost(
  options: RequireHostOptions = {},
): Promise<User> {
  const user = await getCurrentHostUser();

  if (user) {
    return user;
  }

  if (options.onUnauthenticated === "throw") {
    console.warn("[auth-failure] Host authentication required (throw).");
    throw new Error("Host authentication required.");
  }

  console.warn("[auth-failure] Host authentication required (redirect).");
  redirect(options.redirectTo ?? "/host/login");
}
