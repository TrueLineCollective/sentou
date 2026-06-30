# Orientation for contributors and coding agents

Sentou publishes a Claude artifact, or any HTML, to a private link you control: gated, optionally tracked, and re-versionable in place. It is self-hostable and runs as a single process backed by a SQLite database (Drizzle + better-sqlite3, WAL). Read this before changing code; `CONTRIBUTING.md` has the day-to-day workflow.

## Stack and a real caveat

Next.js 16 (App Router, Turbopack), TypeScript, React 19, Vitest. The MCP server uses `@modelcontextprotocol/sdk` and `zod`.

Next 16 has breaking changes from earlier versions: route handlers, caching, and `params`/`searchParams` being promises are easy to get wrong from memory. When you touch Next-specific APIs, check the version-matched docs bundled at `node_modules/next/dist/docs/` rather than trusting recall.

## Commands (all must pass before a PR is ready)

```bash
npm test          # vitest, run once
npm run typecheck # tsc --noEmit  (CI runs this; next build does NOT typecheck test files)
npm run lint      # eslint
npm run build     # production build (output: 'standalone')
```

## Where things live

- `app/api/*`: the HTTP API (publish, republish, revoke, stats, forget, access, access/verify, track, keys).
- `app/(dashboard)/*`: the authenticated owner/team web UI (Routes, Compose, analytics, Team, Settings, Account, Collections).
- `app/artifact/[slug]/route.ts`: serves the sandboxed artifact bytes. The access check lives here, not only in the viewer.
- `app/v/[slug]/page.tsx`: the viewer: gate form, code entry, and the tracking beacon.
- `lib/sealed-token.ts`: AES-256-GCM + domain-separated HMAC. All access/verify/track tokens go through it. Security-critical.
- `lib/store-sqlite.ts` / `lib/db/*` / `lib/links.ts`: the SQLite-backed store (Drizzle schema + migrations) and the serialized mutation chain. `lib/store.ts` is the legacy JSON store, kept only for the one-time `migrate:json` importer.
- `lib/auth.ts`, `lib/auth-session.ts`: Better Auth (invite-only, first-signup owner), session/API-key actor resolution, role checks. Security-critical.
- `lib/access.ts`, `lib/owner.ts`, `lib/rate-limit.ts`, `lib/email-format.ts`: gate evaluation, owner auth, abuse limits, email validation.

## Conventions

- **Test-driven.** New behavior ships with a test. The suite is the contract.
- **Do not weaken the sandbox.** The artifact keeps its opaque origin (`allow-scripts`, no `allow-same-origin`), and the access check stays at the byte-serving route. Changes there get extra scrutiny.
- **Sentou only stores verified emails.** A record-only gate must not persist the typed address.
- **No secrets in the repo, ever.** The SQLite database at `SENTOU_DB` holds verified viewer emails; treat it as personal data.
