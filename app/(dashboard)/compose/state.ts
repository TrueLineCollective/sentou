// Plain (non-"use server") module: types and constants used by both the server
// action and the client form.  Keeping them here avoids the Next.js restriction
// that "use server" files may only export async functions.

export type PublishState = {
  slug: string | null;
  error: string | null;
};

export const INITIAL_STATE: PublishState = { slug: null, error: null };
