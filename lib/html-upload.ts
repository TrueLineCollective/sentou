// Client-side validation for the Compose "upload an .html file" affordance. The file is read
// in the browser and its text dropped into the HTML payload field, so it flows through the exact
// same publish path as pasted HTML. This only gates what we will read; it adds no server surface.

// Matches the /api/publish request-body cap so an upload that the dashboard accepts will also be
// accepted by the API when published.
export const MAX_UPLOAD_BYTES = 5_000_000;

export type UploadCheck = { ok: true } | { ok: false; error: string };

// Accept anything that looks like HTML: an .html/.htm name, or a text-ish MIME type (covers
// .htm with no type, or a plain-text export). Reject obvious binaries (e.g. images) and oversize
// files with a clear message. Forgiving by design: the user can always paste instead.
export function validateHtmlUpload(file: { name: string; size: number; type: string }): UploadCheck {
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is ${(file.size / 1_000_000).toFixed(1)}MB. The limit is ${Math.floor(MAX_UPLOAD_BYTES / 1_000_000)}MB.`,
    };
  }
  const name = file.name.toLowerCase();
  const looksHtmlByName = name.endsWith(".html") || name.endsWith(".htm");
  const looksTextByType = file.type === "" || file.type === "text/html" || file.type.startsWith("text/");
  if (!looksHtmlByName && !looksTextByType) {
    return { ok: false, error: "Upload an .html file, or paste the HTML directly." };
  }
  return { ok: true };
}
