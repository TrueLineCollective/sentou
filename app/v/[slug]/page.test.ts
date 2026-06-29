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

  const formGate = { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false };
  // main > [h1, form]; pull the <form> and its <input> children out of the tree.
  const formOf = (el: { props: { children: unknown } }) => {
    const kids = el.props.children;
    const arr = Array.isArray(kids) ? kids : [kids];
    return arr.find((c) => c && (c as { type?: string }).type === "form") as {
      props: { method: string; action: string; children: unknown[] };
    };
  };
  const inputsOf = (form: { props: { children: unknown[] } }) =>
    form.props.children.filter((c) => c && (c as { type?: string }).type === "input") as {
      props: { type?: string; name?: string; value?: string };
    }[];

  it("renders a single email form posting to /api/access for a gated link without verification", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", formGate);
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }) });
    const form = formOf(el);
    expect(form.props.method).toBe("POST");
    expect(form.props.action).toBe(`/api/access?slug=${link.slug}`);
    expect(inputsOf(form).some((i) => i.props.name === "email")).toBe(true);
    expect(inputsOf(form).some((i) => i.props.name === "code")).toBe(false);
  });

  it("renders the email form posting to /api/access when verifyEmail is on and no step is set", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", formGate, false, true);
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }), searchParams: Promise.resolve({}) });
    const form = formOf(el);
    expect(form.props.action).toBe(`/api/access?slug=${link.slug}`);
    expect(inputsOf(form).some((i) => i.props.name === "email")).toBe(true);
  });

  it("renders a code-entry form posting to /api/access/verify on step=code, carrying the email", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", formGate, false, true);
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({
      params: Promise.resolve({ slug: link.slug }),
      searchParams: Promise.resolve({ step: "code", email: "a@x.com" }),
    });
    const form = formOf(el);
    expect(form.props.method).toBe("POST");
    expect(form.props.action).toBe(`/api/access/verify?slug=${link.slug}`);
    const inputs = inputsOf(form);
    expect(inputs.some((i) => i.props.name === "code")).toBe(true);
    const hiddenEmail = inputs.find((i) => i.props.name === "email");
    expect(hiddenEmail!.props.type).toBe("hidden");
    expect(hiddenEmail!.props.value).toBe("a@x.com");
  });

  it("calls notFound() (throws) for an unknown slug", async () => {
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    await expect(
      ViewerPage({ params: Promise.resolve({ slug: "missing" }) }),
    ).rejects.toThrow();
  });
});
