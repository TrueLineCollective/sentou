# Licensing

Sentou is **open-core**.

- **Core (this repository, except `/ee`): GNU AGPL-3.0-only.** See `LICENSE`.
  Self-host and modify it freely. Under AGPL section 13, running a modified
  version as a network service obligates you to offer that modified source to
  its users. This is deliberate: it keeps the core open while preventing a
  closed-source hosted clone of it.
- **`/ee` directory (future): commercial license.** Enterprise-only features
  (SSO/SAML, audit logs, white-label, governance) will live under `/ee` on a
  separate commercial license, not AGPL. Nothing lives there yet.
- **Client embed / tracker snippet (future): MIT.** Anything loaded into a
  recipient's own page ships MIT, so AGPL copyleft never reaches end users.

The managed "Sentou Cloud" and commercial licensing are offered by True Line Collective.
