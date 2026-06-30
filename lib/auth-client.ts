"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

// If NEXT_PUBLIC_APP_URL is set (e.g. a custom domain on Vercel), pass it as
// the baseURL so the client points to the right origin.  When the env var is
// absent or empty, omit baseURL entirely so better-auth defaults to
// window.location.origin — this avoids a silent mismatch between the client
// and the server's BETTER_AUTH_URL / SENTOU_BASE_URL on exposed deploys.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  plugins: [organizationClient()],
});

export const { signUp, signIn, useSession, signOut } = authClient;
