// Mount the Better Auth handler for all /api/auth/* routes.
// toNextJsHandler is exported from better-auth/next-js (dist/integrations/next-js.mjs).
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
