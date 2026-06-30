import { describe, it, expect } from "vitest";
import { validateHtmlUpload, MAX_UPLOAD_BYTES } from "@/lib/html-upload";

describe("validateHtmlUpload", () => {
  it("accepts an .html file under the cap", () => {
    expect(validateHtmlUpload({ name: "deck.html", size: 1234, type: "text/html" })).toEqual({ ok: true });
  });

  it("accepts an .htm file", () => {
    expect(validateHtmlUpload({ name: "page.HTM", size: 10, type: "" }).ok).toBe(true);
  });

  it("accepts a text-typed file even with an odd name", () => {
    expect(validateHtmlUpload({ name: "export", size: 10, type: "text/plain" }).ok).toBe(true);
  });

  it("rejects an oversize file with a size message", () => {
    const r = validateHtmlUpload({ name: "huge.html", size: MAX_UPLOAD_BYTES + 1, type: "text/html" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/limit is 5MB/i);
  });

  it("rejects a binary file that is not named .html", () => {
    const r = validateHtmlUpload({ name: "logo.png", size: 100, type: "image/png" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/\.html/i);
  });

  it("accepts an .html name even if the type is wrong/missing", () => {
    expect(validateHtmlUpload({ name: "report.html", size: 100, type: "application/octet-stream" }).ok).toBe(true);
  });
});
