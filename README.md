# AthletiQ Web

The web app for AthletiQ — coaching-academy management for coaches and admins.

**Stack:** React 19 · TypeScript 6 · Vite 8 · React Router 8 · TanStack Query · React Hook Form + Zod ·
Tailwind CSS 4 · Radix UI · Recharts · Mapbox GL · Jest + Testing Library

---

## Quick start

```bash
npm install
cp .env.example .env     # set VITE_MAPBOX_TOKEN (optional) and API_PROXY_TARGET
npm run dev              # http://localhost:5173 — /api is proxied to the backend
```

Run the backend (`AthletiQ_Backend`) first. In development the Vite proxy makes the API same-origin, so
the httpOnly refresh cookie works without any CORS configuration.

| Script                                | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `dev` / `build` / `preview`           | Dev server · production build · serve the build       |
| `check`                               | typecheck + lint + tests with coverage (what CI runs) |
| `test`, `test:watch`, `test:coverage` | Jest                                                  |
| `lint`, `format`                      | ESLint · Prettier (with Tailwind class sorting)       |

## Environment

| Variable            | Where    | Purpose                                                                                                                                                                       |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`      | build    | API origin. Production builds default to `https://api.edupilots.in` (`.env.production`); empty in dev = Vite proxy.                                                           |
| `VITE_MAPBOX_TOKEN` | build    | Public Mapbox token (`pk.*`) for the location picker and check-in maps. Restrict it to your domains in the Mapbox dashboard. Without it, maps fall back to coordinate inputs. |
| `API_PROXY_TARGET`  | dev only | Backend URL for the Vite proxy (default `http://localhost:4000`).                                                                                                             |

## Architecture

```
src/
  app/          Providers, auth session, theme, router (lazy routes + guards), layout, navigation
  components/   ui/ primitives (Radix-based), shared composites, maps, pickers
  lib/          api client, React Query hooks (queries.ts), types, formatting, forms
  pages/        One module per screen; admin-only screens under pages/admin
tests/          Jest suites: lib, components, pages, app shell (fetch-level API mocks)
```

**Principles**

- **Auth:** access token in memory only; refresh token in an httpOnly cookie. Requests that hit a 401
  transparently refresh once (single-flight) and retry.
- **Data:** every server call goes through typed hooks in `lib/queries.ts`; mutations invalidate exactly
  the caches they affect. Lists use `keepPreviousData` so filtering never flashes empty.
- **Forms:** Zod schemas mirror server rules for instant feedback; server field errors are mapped back
  onto the same inputs.
- **Mobile first:** bottom navigation on phones, large tap targets on attendance, sticky save bars,
  bottom-sheet dialogs, `env(safe-area-inset-*)` support.
- **Accessibility:** labelled controls, keyboard-navigable Radix primitives, visible focus rings,
  reduced-motion support, light/dark/system themes.
- **Performance:** route-level code splitting; charts and Mapbox load only on the screens that use them.

## Deployment (AWS Amplify)

The full production guide, covering backend and frontend, is in
[AthletiQ_Backend/deploy.md](https://github.com/animeshmallick/AthletiQ_Backend/blob/mainline/deploy.md).
In short:

The app is served at **https://www.edupilots.in** (the root `edupilots.in` redirects to `www`) and calls the API
at **https://api.edupilots.in**.

1. Connect this repository; Amplify uses `amplify.yml`.
2. Set `VITE_MAPBOX_TOKEN` in _Environment variables_. `VITE_API_URL` already defaults to
   `https://api.edupilots.in` via `.env.production`; set it in Amplify only to override.
3. Add the SPA rewrite in _Rewrites and redirects_:
   source `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>`,
   target `/index.html`, type `200 (Rewrite)`.
4. Add the custom domain **edupilots.in** in Amplify: map `www` to `mainline` and redirect the root to `www`.
5. On the backend set `CORS_ORIGINS=https://www.edupilots.in`, `APP_URL=https://www.edupilots.in`,
   `COOKIE_SECURE=true` and `COOKIE_CROSS_SITE=false` (both sites share `edupilots.in`).

Security and caching headers are defined in `customHttp.yml`.
