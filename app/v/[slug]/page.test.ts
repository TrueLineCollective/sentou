import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
});

describe("viewer page", () => {
  it("renders the artifact in an allow-scripts sandbox with no same-origin escape", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>");
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }) });
    const iframe = el.props.children;
    // exact match, not toContain: an exact "allow-scripts" is what proves the
    // dangerous "allow-same-origin" token is absent from the sandbox.
    expect(iframe.props.sandbox).toBe("allow-scripts");
    expect(iframe.props.src).toBe("/artifact/" + link.slug);
  });

  it("calls notFound() (throws) for an unknown slug", async () => {
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    await expect(
      ViewerPage({ params: Promise.resolve({ slug: "missing" }) }),
    ).rejects.toThrow();
  });
});
