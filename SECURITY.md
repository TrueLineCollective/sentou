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

Sentou is young, and a couple of its controls are honest about what they do and do not enforce today:

- **The email gate is not verified.** A gated link records the email someone types and enforces expiry and revocation, but it does not yet confirm the address belongs to them. Email verification is on the roadmap. Until it ships, a typed email is a record, not a lock.
- **The domain allowlist is in the same boat.** It checks the typed address against the allowed domains, but because the email itself is unverified, the allowlist is not a hard lock either.
- **The real controls today are the unguessable link, expiry, and revoke.** Those hold no matter what email someone enters. Treat the link itself as the secret.

### Hardening for an exposed deploy

- **Always set `SENTOU_SECRET`** to a strong random value (`openssl rand -hex 32`). It signs and encrypts the access cookie. In production the app refuses to start with the insecure dev default.
- **For any internet-exposed instance, set `SENTOU_OWNER_TOKEN`.** When set, the owner and stats endpoints (publish, republish, revoke, stats) require `Authorization: Bearer <token>`. Without it, those endpoints are open, which is fine for a single-tenant local instance and not fine on the public internet.
- The artifact itself runs sandboxed (`Content-Security-Policy: sandbox allow-scripts`, opaque origin, no `allow-same-origin`), and the access check sits at the route that serves the bytes, so editing the URL does not get past the gate.
