"use client";

import { createClient } from "@/lib/supabase/client";

/** The only sign-in path — Google OAuth via Supabase Auth. Client Component
 * because signInWithOAuth needs window.location.origin and browser cookies. */
export function GoogleSignInButton() {
  async function handleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogin}
      className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
    >
      Iniciar sesión con Google
    </button>
  );
}
