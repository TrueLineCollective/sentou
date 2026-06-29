# Sentou

*From me, to you.*

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

You make something good in Claude. A pitch, a one-pager, a small tool that does one thing well. Then you go to share it, and the choices are: drop it at a public URL and hope it doesn't wander, or upload it to a company whose business is watching who reads your work. For something you actually care about, neither one sits right.

Sentou is the version I wanted instead. You publish a Claude artifact, or any HTML, to a private link. You decide who can open it. You keep editing it in place, and the link never breaks. All of it runs on your own infrastructure, so the document and the list of people who opened it stay on a server you own.

One thing up front, because I'd rather you hear it from me: this is early. The core works and it's covered by tests, but a fair bit of the roadmap below is still ahead of me. I'm building it in the open and keeping this page honest about what's real and what's still a plan.

## What it does today

- Publish an artifact or raw HTML to a link, either over the HTTP API or from inside Claude through the MCP server.
- Edit in Claude and republish to the same link. The URL stays put and the people who already have it keep their access. The link follows your latest version instead of freezing a copy.
- Decide who gets in. Require an email, limit it to a company domain, give it an expiry, or revoke it when you're done.
- Every artifact runs sandboxed. Its JavaScript executes in an isolated origin behind a strict CSP, so a published page can't touch the cookies, session, or data on your domain. That holds even if someone opens the raw artifact URL directly, not just inside the viewer.

One honest caveat while this is young: the email gate records who's asking and enforces expiry and revocation, but it doesn't verify the address yet. Until email verification lands (it's on the roadmap), treat the link itself as the real secret. The unguessable URL is what's actually keeping people out, and the typed email is closer to a sign-in sheet than a lock. Revoke and expiry are real locks; they hold no matter what email someone enters.

## How the sandbox works, and why I cared about it

A Sentou artifact is arbitrary HTML and JavaScript that other people load in their own browsers. That's a real attack surface, and it's the part of this I spent the most time getting right. The artifact is served with `Content-Security-Policy: sandbox allow-scripts` and rendered inside an `allow-scripts` iframe with no `allow-same-origin`. The scripts still run, so your artifact stays interactive, but the browser hands them an opaque origin with no way back to the parent page or its data. The access check sits at the route that actually serves the bytes, not only in the page that frames it, so you can't slip past the gate by editing the URL.

## Quickstart (self-host)

You'll need Node 20 or newer and Git.

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
# -> { "slug": "...", "url": "http://localhost:3000/v/...", "version": 1 }
```

Open the `url` it returns and you'll see your artifact in its sandbox. To update it, POST `{ "id": "...", "html": "..." }` to `/api/republish` and the same link picks up the change.

To gate a link, pass `requireEmail`, `allowedDomains`, or `expiresAt` when you publish. A gated link asks for an email before it loads, and `/api/revoke` shuts it off.

### Publishing from Claude

Sentou ships an MCP server, so you can publish without leaving a Claude session:

```bash
claude mcp add sentou -- npx tsx mcp/server.ts
```

Claude gets two tools, `publish_artifact(html)` and `republish(id, html)`. If your instance isn't on localhost, point the server at it with `SENTOU_URL`.

## What's next

Done so far: the publish and republish loop, the sandboxed viewer, the MCP server, and the gating layer (email, domain allowlist, expiry, revoke).

After that, roughly in order: per-recipient tracking, so you can see who opened a link, how long they stayed, and where they trailed off. Then a hosted version for people who'd rather not run a server. Then the enterprise things, like SSO, audit logs, and data residency. Tracking goes first because it's what makes a sent link worth sending. Hosting comes next because it's what keeps the lights on.

## Why it's open source

Open source here isn't me being generous. It's a bet, and a deliberate one. You'll trust a tool that handles your documents more when you can read every line and run it yourself. And some of the people who try the self-hosted version will happily pay for a hosted one, because standing up your own server is a chore most folks don't want. Both of those feel true to me, so the whole core is free and the convenience is the part that costs money.

The specifics: everything in this repository outside a future `/ee` folder is AGPL-3.0. Self-host it, change it, keep it as long as you like. The one thing the license asks is that if you run a modified copy as a service for other people, you share your changes back. A hosted Sentou Cloud and the enterprise features will be commercial, and they fund the open part. [LICENSING.md](./LICENSING.md) spells it out.

## Contributing

Issues and pull requests are welcome. If you have a feature in mind, open an issue first so we can talk about where it fits before you write the code. No CLA, no ceremony.

## Who's behind it

Sentou is a [True Line Collective](https://github.com/TrueLineCollective) project.
