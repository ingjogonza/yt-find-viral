"use server";

import { redirect } from "next/navigation";
import { createClient } from "./server";

/** Signs the current user out and sends them to /login. Used by the
 * NavBar's "Cerrar sesión" button (plain form + server action, no client JS). */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
