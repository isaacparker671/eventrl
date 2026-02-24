import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const hasAuthCallbackParams =
    request.nextUrl.searchParams.has("code") ||
    (request.nextUrl.searchParams.has("token_hash") &&
      request.nextUrl.searchParams.has("type"));

  if (hasAuthCallbackParams && request.nextUrl.pathname !== "/auth/callback") {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    if (!callbackUrl.searchParams.has("next")) {
      callbackUrl.searchParams.set("next", "/host/dashboard");
    }
    return NextResponse.redirect(callbackUrl);
  }

  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isHostLoginRoute = request.nextUrl.pathname === "/host/login";
  const isHostProtectedRoute =
    request.nextUrl.pathname.startsWith("/host/") && !isHostLoginRoute;

  if (isHostLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/host/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isHostProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/host/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/", "/host", "/host/:path*"],
};
