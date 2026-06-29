// Runs once when the server starts (Next.js instrumentation hook). We use it to surface the
// production-only footguns at boot instead of leaving the operator to discover them from broken
// links or open endpoints later. SENTOU_SECRET's absence already throws on first crypto use, so
// it isn't repeated here.
export async function register() {
  // register() is called in every runtime; only warn from the Node server process.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const warn = (m: string) => console.warn(`[sentou] ${m}`);
  if (!process.env.SENTOU_BASE_URL) {
    warn("SENTOU_BASE_URL is not set; generated links will point at http://localhost:3000.");
  }
  if (!process.env.SENTOU_OWNER_TOKEN) {
    warn("SENTOU_OWNER_TOKEN is not set; owner and stats endpoints will refuse requests in production.");
  }
}
