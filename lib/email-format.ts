// A pragmatic email-shape check: a non-empty local part, one @, and a dotted domain. This is not
// RFC 5322 (which is famously baroque) and is not proof an address exists. It only rejects garbage
// at the boundary before we store or email anything. verifyEmail is what actually proves an
// address is real. Returns the trimmed address, or null if it does not look like an email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: string): string | null {
  // Lowercase as well as trim: rate-limit keys and the per-code attempt budget are keyed by the
  // address, so without this an attacker could cycle case variants of one inbox to multiply code
  // sends past the per-address cap. Email domains are case-insensitive and mailbox case rarely
  // matters in practice, so normalizing is safe and also dedupes viewers consistently.
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}
