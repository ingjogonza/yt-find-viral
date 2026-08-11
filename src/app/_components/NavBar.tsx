import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/supabase/actions";

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Catálogo" },
  { href: "/viral", label: "Viral en canales chicos" },
  { href: "/recientes", label: "Recién agregados" },
  { href: "/saturacion", label: "Riesgo de saturación" },
  { href: "/shorts", label: "Shorts" },
  { href: "/keywords", label: "Keywords" },
  { href: "/tracker", label: "Tracker" },
  { href: "/favoritos", label: "Favoritos" },
  { href: "/dashboard", label: "Dashboard" },
];

/** Site-wide nav — server-rendered links, plus a "Cerrar sesión" button
 * (plain form + server action) shown only when there's an active session.
 * Async because it checks the session itself — src/proxy.ts already
 * enforces access on every protected route, this is just for the UI. */
export async function NavBar() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims);

  return (
    <nav className="border-b border-gray-200 bg-white" aria-label="Navegación principal">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm sm:px-6 lg:px-8">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="font-medium text-gray-700 hover:text-gray-900">
            {link.label}
          </Link>
        ))}
        {hasSession && (
          <form action={signOut} className="ml-auto">
            <button type="submit" className="font-medium text-gray-500 hover:text-gray-900">
              Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
