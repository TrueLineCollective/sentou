# Contributing to Sentou

Issues and pull requests are welcome. No CLA, no ceremony. If you have a feature in mind, open an issue first so its place is clear before you write the code.

## Prerequisites

- Node 20 or newer (see `.nvmrc`)
- Git

## Getting set up

```bash
git clone https://github.com/TrueLineCollective/sentou.git
cd sentou
npm install
cp .env.example .env.local
# generate a real signing key for local dev:
echo "SENTOU_SECRET=$(openssl rand -hex 32)" >> .env.local
npm run dev
```

The app comes up on `http://localhost:3000`.

## Day-to-day commands

```bash
npm run dev       # local dev server
npm test          # run the test suite once (vitest)
npm run test:watch # watch mode while you work
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # production build
```

## Project layout

- `app/` — Next.js App Router. Routes under `app/api/*` are the HTTP API; `app/v/[slug]` is the viewer and `app/artifact/[slug]` serves the sandboxed bytes.
- `lib/` — the core: links/store, the sealed-token and tracking-token modules, access evaluation, stats aggregation. Most logic and most tests live here.
- `mcp/` — the MCP server and client that let you publish from a Claude session.
- `docs/` — public docs. Internal strategy and plan files are gitignored.

## How we work

- **Test-driven.** Write a failing test first, watch it go red, then write the smallest change that makes it green. New behavior ships with a test.
- **Keep the suite green.** `npm test`, `npm run typecheck`, and `npm run build` must all pass before a PR is ready.
- **Don't weaken the sandbox.** The artifact stays sandboxed with an opaque origin, and the access check stays at the byte-serving route. Changes there get extra scrutiny.
- **Small, focused PRs.** A bug fix is a bug fix. Flag adjacent issues in the PR rather than folding them in.
