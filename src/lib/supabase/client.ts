import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Cookie read/write is handled
 * automatically by @supabase/ssr in the browser (falls back to
 * document.cookie) — no manual wiring needed here, unlike the server client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
