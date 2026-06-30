"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "",
  plugins: [organizationClient()],
});

export const { signUp, signIn, useSession, signOut } = authClient;
