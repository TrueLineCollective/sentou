// A pragmatic email-shape check: a non-empty local part, one @, and a dotted domain. This is not
// RFC 5322 (which is famously baroque) and is not proof an address exists. It only rejects garbage
// at the boundary before we store or email anything. verifyEmail is what actually proves an
// address is real. Returns the trimmed address, or null if it does not look like an email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: string): string | null {
  const email = raw.trim();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}
