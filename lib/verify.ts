import { randomInt } from "node:crypto";
import { seal, open } from "@/lib/sealed-token";

export type VerifyClaim = { slug: string; email: string; code: string; exp: number };

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
export function sealVerify(c: VerifyClaim): string {
  return seal("verify", c);
}
export function openVerify(token: string | null | undefined): VerifyClaim | null {
  const p = open<VerifyClaim>("verify", token);
  if (p && typeof p.slug === "string" && typeof p.email === "string" && typeof p.code === "string" && typeof p.exp === "number") {
    return { slug: p.slug, email: p.email, code: p.code, exp: p.exp };
  }
  return null;
}
