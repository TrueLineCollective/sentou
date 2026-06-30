import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone with a minimal server.js so the Docker image can run without the full
  // node_modules tree. The runner stage copies public + .next/static alongside it (see Dockerfile).
  output: "standalone",
  async headers() {
    // CSP for the app shell + viewer. We restrict the high-value sinks — script source,
    // plugins, and base-uri — and keep clickjacking defense. We deliberately do NOT set a
    // `default-src`: img/style/font/connect/frame stay at the browser default so the
    // same-origin sandboxed /artifact iframe and the Compose srcDoc live-preview keep
    // working. `'unsafe-inline'` is required by Next's inline bootstrap/RSC scripts;
    // `'unsafe-eval'` is dev-only (Turbopack HMR). Nonce-based script-src is the future
    // hardening. The /artifact byte-serving route sets its own stricter CSP (sandbox
    // allow-scripts) on the Response, so it is excluded here.
    const scriptSrc =
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const csp = [scriptSrc, "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'"].join("; ");
    return [
      {
        source: "/((?!artifact).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
