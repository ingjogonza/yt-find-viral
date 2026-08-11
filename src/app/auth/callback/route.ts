import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback: exchanges the `code` query param for a session (sets the
 * Supabase auth cookies via the server client's `setAll`), then redirects
 * to `/`. src/proxy.ts checks ALLOWED_EMAIL on the very next request, so an
 * unauthorized Google account still gets bounced back to /login right after.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
