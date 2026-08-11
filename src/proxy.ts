import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth gate for the whole app — Next.js 16 renamed `middleware.ts` to
 * `proxy.ts` (exported function `proxy`, not `middleware`); see
 * node_modules/next/dist/docs/.../file-conventions/proxy.md. Functionally
 * this is exactly what the prompt calls "middleware.ts".
 *
 * On every matched request:
 * 1. Refreshes the Supabase session (getClaims() early, per @supabase/ssr's
 *    own guidance, so a token refresh gets written back to cookies before
 *    the response is committed).
 * 2. No session -> redirect to /login.
 * 3. Session present but its email doesn't match ALLOWED_EMAIL EXACTLY
 *    (case-insensitive) -> sign out and redirect to /login?error=unauthorized.
 *    A missing/misconfigured ALLOWED_EMAIL also denies access (fails
 *    closed, never silently lets anyone through).
 * 4. Anything unexpected (network blip verifying the JWT, etc.) also denies
 *    access rather than falling through — same fail-closed rule.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  function redirectToLogin(extraParams?: Record<string, string>): NextResponse {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      url.searchParams.set(key, value);
    }
    // Carry over any cookies the client above just refreshed/cleared —
    // building a fresh NextResponse.redirect() would otherwise drop them.
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  try {
    const { data, error } = await supabase.auth.getClaims();
    const email = data?.claims.email as string | undefined;

    if (error || !email) {
      return redirectToLogin();
    }

    const allowedEmail = process.env.ALLOWED_EMAIL;
    if (!allowedEmail || email.toLowerCase() !== allowedEmail.toLowerCase()) {
      await supabase.auth.signOut();
      return redirectToLogin({ error: "unauthorized" });
    }

    return response;
  } catch {
    return redirectToLogin();
  }
}

export const config = {
  matcher: ["/((?!login|auth/callback|_next/static|_next/image|favicon.ico).*)"],
};
