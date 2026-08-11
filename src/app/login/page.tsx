import { GoogleSignInButton } from "./_components/GoogleSignInButton";

type LoginSearchParams = { error?: string | string[] };

/**
 * Single-button login page — no email/password, no sign-up, Google only.
 * Reads ?error=unauthorized (set by src/proxy.ts when a valid session's
 * email doesn't match ALLOWED_EMAIL) to show a visible rejection message.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const isUnauthorized = resolvedSearchParams.error === "unauthorized";

  return (
    <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">YouTube Niche Finder</h1>
      <p className="mt-2 text-sm text-gray-600">Acceso restringido — inicia sesión con la cuenta autorizada.</p>

      {isUnauthorized && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No autorizado: esta cuenta de Google no tiene acceso a esta aplicación.
        </p>
      )}

      <GoogleSignInButton />
    </main>
  );
}
