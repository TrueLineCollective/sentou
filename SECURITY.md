# Security Policy

## Supported versions

Sentou is pre-1.0 and ships from `main`. Only the latest commit on `main` is supported. Fixes land there; there are no backported release branches yet.

| Version | Supported |
| ------- | --------- |
| `main` (latest) | yes |
| older commits / tags | no |

## Reporting a vulnerability

Please report security issues privately, not in a public issue.

Use GitHub's [Private Vulnerability Reporting](https://github.com/TrueLineCollective/sentou/security/advisories/new) on this repository. That opens a private advisory only the maintainers can see.

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge a report within a few days and will coordinate a fix and disclosure with you.

Please do not run automated scanners against any hosted instance you do not own.

## Current limitations (read before deploying)

How hard the email gate locks depends on how you configure it:

- **Email verification is available, off by default.** Publish a link with `verifyEmail: true` and configure an email sender (`SENTOU_RESEND_KEY` + `SENTOU_EMAIL_FROM`), and a gated link emails a one-time code and only grants access once the recipient enters it. That makes the email a verified address rather than a typed claim.
- **Without verification, the email gate is access friction, not a record.** A gated link that does not opt into verification asks for an email and enforces expiry and revocation, but does not confirm the address, and does not store it. Sentou only ever persists a verified email, so an unverified gate's typed email is a key for that session, not a record.
- **The domain allowlist inherits this.** When verification is on, the allowlist checks a verified address and is a real lock. When it is off, the allowlist rides on an unverified email and is not a hard lock.
- **The unguessable link, expiry, and revoke are always real controls.** They hold no matter what email someone enters, with or without verification. Treat the link itself as a secret.
- **An access session lasts up to 7 days.** The cookie that unlocks a gated link expires, so a link opened on a shared or borrowed machine does not grant access forever. For a hard cutoff regardless of who has opened it, set the link's `expiresAt` or revoke it.
- **The link is "living": its content can change in place.** Republishing updates what every existing recipient sees, with no version pin or change indicator on their end. That is the intended feature, but in a context where a recipient must be able to prove what they were shown, capture it at view time.

### Hardening for an exposed deploy

- **Always set `SENTOU_SECRET`** to a strong random value (`openssl rand -hex 32`). It signs and encrypts the access cookie. There is no hard-coded default: in production the app refuses to serve any request that needs the secret (it throws on the first publish or access call) until you set it, and outside production it mints a random per-process key so cookies are never forgeable with a known key.
- **Owner endpoints are protected by identity-scoped authentication.** The publish, republish, revoke, stats, forget, and keys endpoints require either a logged-in Better Auth session cookie or a per-user API key sent as `Authorization: Bearer <key>`. The app fails closed on any production or internet-exposed instance when there is no authenticated actor: unauthenticated requests receive a 401. The endpoints are open only on a purely local instance (localhost base URL, `NODE_ENV` not `production`). The first account to sign up becomes the owner; further accounts are invite-only. Mint an API key for automation or MCP use via `POST /api/keys` (the plaintext key is returned once and not stored).
- **To make the email gate a real boundary, set `SENTOU_RESEND_KEY` + `SENTOU_EMAIL_FROM` and publish links with `verifyEmail: true`.** Recipients then have to enter a one-time code emailed to their address before they get in. In production, publishing a `verifyEmail` link with no sender configured is rejected. In local dev the code is logged to the server console as a testing fallback, so the **console sender must never run on an internet-exposed instance**.
- **The database holds personal data.** Verified viewer emails and tracking events live in the SQLite database at `SENTOU_DB`, unencrypted at rest. Restrict its file permissions and use disk encryption on an exposed host. `SENTOU_RETENTION_DAYS` prunes old data and `/api/forget` erases a link's data, or one viewer's, on request.
- The artifact itself runs sandboxed (`Content-Security-Policy: sandbox allow-scripts`, opaque origin, no `allow-same-origin`), and the access check sits at the route that serves the bytes, so editing the URL does not get past the gate. The sandbox isolates the artifact from your site; it does not stop the artifact's own JavaScript from making outbound network requests, so only publish artifacts you trust.
- **Per-IP rate limiting needs a trusted proxy.** Sentou rate-limits by the client IP it reads from `X-Forwarded-For`, which is only trustworthy when a reverse proxy in front of it strips any client-supplied value. Exposed directly, or behind a proxy that appends rather than replaces that header, a client can spoof it and bypass the per-IP caps. The controls that do not depend on IP still hold: the per-address cap on verification-code sends, and the per-code attempt budget gated on a valid sealed cookie. Put Sentou behind a proxy you control.
