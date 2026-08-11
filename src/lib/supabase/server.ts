import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions, and Route
 * Handlers. Create a NEW client on every call — never share/cache one
 * across requests (per @supabase/ssr's own guidance).
 *
 * `setAll` is wrapped in try/catch because Server Components can't set
 * cookies — that's fine as long as src/proxy.ts refreshes the session on
 * every request, which it does.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component — no-op, src/proxy.ts handles refresh.
          }
        },
      },
    },
  );
}
