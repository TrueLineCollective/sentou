import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });

  // Already authenticated — send to the dashboard.
  if (session) redirect("/");

  return <LoginForm />;
}
