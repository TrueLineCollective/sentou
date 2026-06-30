import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const db = getDb();
  const existing = await db.select({ id: user.id }).from(user).limit(1);

  if (existing.length > 0) {
    redirect("/login");
  }

  return <SetupForm />;
}
