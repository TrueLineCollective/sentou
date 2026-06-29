# Sentou

*From me, to you.*

[![CI](https://github.com/TrueLineCollective/sentou/actions/workflows/ci.yml/badge.svg)](https://github.com/TrueLineCollective/sentou/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

<p align="center">
  <img src="assets/hero.png" alt="A private investor update shared through Sentou" width="820" />
</p>

Sentou publishes a Claude artifact, or any HTML, to a private link you control. You decide who can open it. You keep editing in place, and the link never breaks. Everything runs on your own infrastructure, so the document and the list of people who opened it stay on a server you own.

Sharing something you made in Claude usually means one of two compromises: drop it at a public URL and hope it stays put, or hand it to a platform whose business is tracking who reads your work. Sentou is the alternative to both.

<p align="center">
  <img src="assets/loop.gif" alt="The same Sentou link updating from one version to the next" width="820" />
  <br /><sub>Publish once, then keep editing in Claude. The link stays the same.</sub>
</p>

This is early. The core works and is covered by tests, but a good part of the roadmap below is still ahead. I build it in the open and keep this page honest about what is shipped and what is still planned.

## What it does today

- Publish an artifact or raw HTML to a link, over the HTTP API or from inside Claude through the MCP server.
- Edit in Claude and republish to the same link. The URL stays put and everyone who already has it keeps access. The link follows your latest version instead of freezing a copy.
- Control who gets in: require an email, restrict to a company domain, set an expiry, or revoke a link when you are done.
- Every artifact runs sandboxed. Its JavaScript executes in an isolated origin behind a strict CSP, so a published page cannot reach the cookies, session, or data on your domain. That holds even when someone opens the raw artifact URL directly, not only inside the viewer.

How hard the email gate locks depends on whether you wire an email sender. Set `SENTOU_RESEND_KEY` and `SENTOU_EMAIL_FROM` and a verifying gated link emails a one-time code to the address someone types and only grants access once they enter it back. The email is then verified, and the domain allowlist riding on it becomes a real lock. With no sender configured the gate stays record-only: it logs the email and enforces expiry and revocation but does not confirm the address, so a typed email is a record, not a lock. In that mode the unguessable link, expiry, and revoke are the real controls, and they hold no matter what email someone enters.

## How the sandbox works

A Sentou artifact is arbitrary HTML and JavaScript that other people load in their own browsers. That is a real attack surface, and it is the part that took the most care to get right. The artifact is served with `Content-Security-Policy: sandbox allow-scripts` and rendered inside an `allow-scripts` iframe with no `allow-same-origin`. The scripts still run, so the artifact stays interactive, but the browser hands them an opaque origin with no path back to the parent page or its data. The access check sits at the route that serves the bytes, not only in the page that frames them, so editing the URL does not get past the gate.

## Quickstart (self-host)

Requires Node 20 or newer and Git.

```bash
git clone https://github.com/TrueLineCollective/sentou.git
cd sentou
npm install
echo "SENTOU_SECRET=$(openssl rand -hex 32)" > .env.local   # signs access cookies; there's an insecure dev default if you skip it
npm run dev
```

Publish something:

```bash
curl -s -X POST localhost:3000/api/publish \
  -H 'content-type: application/json' \
  -d '{"html":"<h1>hello</h1>"}'
# -> { "id": "...", "slug": "...", "url": "http://localhost:3000/v/...", "version": 1 }
```

Open the `url` it returns to see your artifact in its sandbox. To update it, POST `{ "id": "...", "html": "..." }` to `/api/republish` and the same link picks up the change.

To gate a link, pass `requireEmail`, `allowedDomains`, or `expiresAt` at publish time. A gated link asks for an email before it loads, and `/api/revoke` shuts it off.

To turn the email gate into a real boundary, pass `verifyEmail: true` at publish time and configure an email sender by setting `SENTOU_RESEND_KEY` (a [Resend](https://resend.com) API key) and `SENTOU_EMAIL_FROM` (the verified from-address). A verifying link emails a one-time code and only grants access once the recipient enters it. Leave the sender unset and verification falls back to logging the code to the server console, which is useful for local testing but is not a boundary.

### Publishing from Claude

Sentou ships an MCP server, so you can publish without leaving a Claude session. Run this from the repo root, with `npm run dev` already running so the server has an instance to publish to:

```bash
claude mcp add sentou -- npx tsx mcp/server.ts
```

Claude gets two tools, `publish_artifact(html)` and `republish(id, html)`. If your instance is not on localhost, point the server at it with `SENTOU_URL`.

## What's next

Shipped so far: the publish and republish loop, the sandboxed viewer, the MCP server, and the gating layer (email, domain allowlist, expiry, revoke).

Next, roughly in order: per-recipient tracking, so you can see who opened a link, how long they stayed, and where they dropped off. Then a hosted version for anyone who would rather not run a server. Then the enterprise pieces: SSO, audit logs, and data residency. Tracking comes first because it is what makes a sent link worth sending. Hosting follows because it funds the rest.

## Why it's open source

Open source here is a bet, not a gift. A tool that handles your documents earns more trust when every line is readable and you can run it yourself. And some of the people who try the self-hosted version will pay for a hosted one, because standing up a server is work most would rather skip. So the core is free, and the convenience is the part that costs money.

The specifics: everything in this repository outside a future `/ee` folder is AGPL-3.0. Self-host it, modify it, keep it as long as you like. The license asks one thing: if you run a modified copy as a service for other people, share your changes back. A hosted Sentou Cloud and the enterprise features will be commercial, and they fund the open core. [LICENSING.md](./LICENSING.md) has the full terms.

## Contributing

Issues and pull requests are welcome. If you have a feature in mind, open an issue first so its place is clear before you write the code. No CLA, no ceremony.

## Who's behind it

Sentou is a [True Line Collective](https://github.com/TrueLineCollective) project.
