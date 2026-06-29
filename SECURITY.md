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
- **Without verification, the email gate is record-only.** A gated link that does not opt into verification (or one that does but has no sender configured) records the email someone types and enforces expiry and revocation, but does not confirm the address. In that mode a typed email is a record, not a lock.
- **The domain allowlist inherits this.** When verification is on, the allowlist checks a verified address and is a real lock. When it is off, the allowlist rides on an unverified email and is not a hard lock.
- **The unguessable link, expiry, and revoke are always real controls.** They hold no matter what email someone enters, with or without verification. Treat the link itself as a secret.

### Hardening for an exposed deploy

- **Always set `SENTOU_SECRET`** to a strong random value (`openssl rand -hex 32`). It signs and encrypts the access cookie. In production the app refuses to start with the insecure dev default.
- **For any internet-exposed instance, set `SENTOU_OWNER_TOKEN`.** When set, the owner and stats endpoints (publish, republish, revoke, stats) require `Authorization: Bearer <token>`. Without it, those endpoints are open, which is fine for a single-tenant local instance and not fine on the public internet.
- **To make the email gate a real boundary, set `SENTOU_RESEND_KEY` + `SENTOU_EMAIL_FROM` and publish links with `verifyEmail: true`.** Recipients then have to enter a one-time code emailed to their address before they get in. Without a configured sender the code is only logged to the server console, so verification is not a boundary in that mode.
- The artifact itself runs sandboxed (`Content-Security-Policy: sandbox allow-scripts`, opaque origin, no `allow-same-origin`), and the access check sits at the route that serves the bytes, so editing the URL does not get past the gate.
