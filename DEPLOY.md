# Despliegue — YouTube Niche Finder

Guía de una sola vez para poner la app en producción (Netlify) con login restringido a un solo
correo, sobre el mismo proyecto de Supabase que ya existe desde el Prompt 1.

## 1. Variables de entorno en Netlify

**Site settings → Environment variables** (Netlify), NO en GitHub:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La misma connection string (pooler) que ya usás en local/GitHub Actions |
| `DIRECT_URL` | La misma direct connection string que ya usás en local/GitHub Actions |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<tu-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La publishable/anon key del proyecto (Supabase → Project Settings → API) |
| `ALLOWED_EMAIL` | El único correo que puede entrar a la app (ej: `vos@gmail.com`) |

**`YOUTUBE_API_KEY` y `ANTHROPIC_API_KEY` NO van en Netlify.** Esas dos las usan únicamente
`scripts/discover.ts`, `scripts/classify.ts` y `scripts/track.ts`, que corren en GitHub Actions
(no en el sitio desplegado) — ya están configuradas como GitHub Secrets desde los Prompts 1, 3 y 6.
La app web (Netlify) nunca llama a la API de YouTube ni a Anthropic directamente; solo lee/escribe
la base de datos vía Prisma y maneja auth vía Supabase.

### Netlify vs. GitHub Secrets — no son el mismo lugar

| Dónde | Variables | Quién las usa |
|---|---|---|
| **Netlify** (Site settings → Environment variables) | `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_EMAIL` | La app Next.js en producción (páginas, proxy/auth, server actions) |
| **GitHub Secrets** (repo → Settings → Secrets and variables → Actions) | `DATABASE_URL`, `DIRECT_URL`, `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY` | `discover.yml`, `classify.yml`, `track.yml` (ya configurados) |

`DATABASE_URL`/`DIRECT_URL` sí se repiten en los dos lugares (misma DB, dos consumidores
distintos) — todo lo demás es exclusivo de un lado.

## 2. Activar el provider de Google en Supabase

1. Andá a tu proyecto en [supabase.com/dashboard](https://supabase.com/dashboard) → **Authentication → Providers**.
2. Buscá **Google** en la lista y activalo.
3. Necesita un **Client ID** y **Client Secret** de Google Cloud Console — ver paso 3 abajo.
4. Pegalos en los campos correspondientes y guardá.

## 3. Crear credenciales OAuth en Google Cloud Console

1. Andá a [console.cloud.google.com](https://console.cloud.google.com/) → elegí (o creá) el proyecto.
2. **APIs & Services → OAuth consent screen**: configurá el consent screen (tipo "External" alcanza
   para un solo usuario — no hace falta publicarla, se puede dejar en modo "Testing" agregando tu
   correo como test user).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Tipo de aplicación: **Web application**.
5. **Authorized redirect URIs**: agregá EXACTAMENTE:
   ```
   https://<tu-project-ref>.supabase.co/auth/v1/callback
   ```
   Este es el callback fijo de **Supabase**, no el dominio de Netlify — Google le devuelve el
   código OAuth a Supabase, y Supabase (vía `/app/auth/callback/route.ts` de esta app) es quien
   completa el intercambio y crea la sesión.
6. Guardá y copiá el **Client ID** y **Client Secret** generados — son los que van en el paso 2.

## 4. Redirect URLs en Supabase (para que el `redirectTo` funcione)

**Authentication → URL Configuration** en el dashboard de Supabase:

- **Site URL**: la URL de producción de Netlify (ej: `https://tu-sitio.netlify.app`).
- **Redirect URLs**: agregá a la lista de permitidas:
  - `https://tu-sitio.netlify.app/auth/callback` (producción)
  - `http://localhost:3000/auth/callback` (desarrollo local)

Sin esto, Supabase rechaza el `redirectTo` que la app pide en `signInWithOAuth` aunque el
provider de Google ya esté bien configurado.

## 5. Deploy en Netlify

1. Conectá el repo de GitHub a un nuevo sitio en Netlify (o `netlify deploy` desde CLI).
2. Netlify detecta Next.js App Router automáticamente vía `@netlify/plugin-nextjs`; `netlify.toml`
   en este repo ya lo declara explícitamente junto con el comando de build.
3. Cargá las 5 variables de entorno del paso 1 en **Site settings → Environment variables** antes
   del primer deploy (o el build va a fallar al no encontrar `NEXT_PUBLIC_SUPABASE_URL`, etc.).
4. Deploy. Una vez que el sitio tenga su dominio final, volvé al paso 4 y confirmá que la URL de
   producción real esté en la lista de Redirect URLs de Supabase.

## 6. Probar el login

1. Entrá al dominio de Netlify → debería redirigir a `/login`.
2. "Iniciar sesión con Google" → elegí la cuenta que coincide con `ALLOWED_EMAIL`.
3. Debería volver a `/` ya logueado, con "Cerrar sesión" visible en el nav.
4. Probá con una cuenta de Google DISTINTA a `ALLOWED_EMAIL`: la app la desloguea automáticamente
   y vuelve a `/login` mostrando "No autorizado".
