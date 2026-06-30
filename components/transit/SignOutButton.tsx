"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="mt-2 w-full py-1.5 min-h-[44px] md:min-h-0 flex items-center justify-center text-[9px] font-mono tracking-[0.2em] uppercase text-transit-muted hover:text-transit-periwinkle border border-transit-border/50 hover:border-transit-border rounded transition-colors duration-150"
    >
      Sign out
    </button>
  );
}
