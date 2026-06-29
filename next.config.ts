import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Clickjacking defense for the app shell + viewer. The /artifact byte-serving
    // route sets its own CSP (including `sandbox allow-scripts` and `frame-ancestors
    // 'self'`) on the Response, so it's excluded here to avoid a second, conflicting
    // CSP header weakening that sandbox.
    return [
      {
        source: "/((?!artifact).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
