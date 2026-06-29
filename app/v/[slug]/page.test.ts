import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyTrackToken } from "@/lib/track-token";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

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

  it("renders no tracking script when the link has tracking off", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>");
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }) });
    // Track-off: children is the single iframe, no <script> sibling.
    expect(el.props.children.type).toBe("iframe");
  });

  it("renders a beacon script carrying a valid token when tracking is on", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }) });
    // Track-on: children is a fragment of [iframe, script].
    const [iframe, script] = el.props.children.props.children;
    expect(iframe.type).toBe("iframe");
    expect(script.type).toBe("script");
    const html = script.props.dangerouslySetInnerHTML.__html;
    expect(html).toContain("sendBeacon");
    expect(html).toContain("/api/track");
    const token = html.match(/var t="([^"]+)"/)![1];
    const claim = verifyTrackToken(token)!;
    expect(claim.linkId).toBe(link.id);
    expect(claim.viewer).toBe("anon"); // no access cookie in this render
  });

  it("calls notFound() (throws) for an unknown slug", async () => {
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    await expect(
      ViewerPage({ params: Promise.resolve({ slug: "missing" }) }),
    ).rejects.toThrow();
  });
});
