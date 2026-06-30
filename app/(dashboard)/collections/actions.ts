"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { resolveRole } from "@/lib/auth-session";
import {
  createCollection,
  deleteCollection,
  addLinkToCollection,
  removeLinkFromCollection,
  moveLinkInCollection,
} from "@/lib/collections";

// ── Internal helper ───────────────────────────────────────────────────────────

async function getActorOrRedirect() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) redirect("/login");
  const db = getDb();
  const role = resolveRole(db, session.user.id);
  return { actor: { userId: session.user.id, role }, db };
}

// ── Actions ───────────────────────────────────────────────────────────────────

// Used with useActionState in <CreateCollectionForm>.
export async function createCollectionAction(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  if (!title) return { error: "Title is required." };
  const { actor, db } = await getActorOrRedirect();
  createCollection(db, actor.userId, title);
  revalidatePath("/collections");
  return {};
}

// Used directly from a form action (no useActionState).
export async function deleteCollectionAction(formData: FormData): Promise<void> {
  const id = formData.get("id") as string | null;
  if (!id) return;
  const { actor, db } = await getActorOrRedirect();
  deleteCollection(db, actor, id);
  revalidatePath("/collections");
}

export async function addLinkAction(formData: FormData): Promise<void> {
  const collectionId = formData.get("collectionId") as string | null;
  const linkId = formData.get("linkId") as string | null;
  if (!collectionId || !linkId) return;
  const { actor, db } = await getActorOrRedirect();
  addLinkToCollection(db, actor, collectionId, linkId);
  revalidatePath(`/collections/${collectionId}`);
}

export async function removeLinkAction(formData: FormData): Promise<void> {
  const collectionId = formData.get("collectionId") as string | null;
  const linkId = formData.get("linkId") as string | null;
  if (!collectionId || !linkId) return;
  const { actor, db } = await getActorOrRedirect();
  removeLinkFromCollection(db, actor, collectionId, linkId);
  revalidatePath(`/collections/${collectionId}`);
}

export async function moveLinkAction(formData: FormData): Promise<void> {
  const collectionId = formData.get("collectionId") as string | null;
  const linkId = formData.get("linkId") as string | null;
  const direction = formData.get("direction") as "up" | "down" | null;
  if (!collectionId || !linkId || !direction) return;
  const { actor, db } = await getActorOrRedirect();
  moveLinkInCollection(db, actor, collectionId, linkId, direction);
  revalidatePath(`/collections/${collectionId}`);
}
