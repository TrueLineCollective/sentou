import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyTrackToken } from "@/lib/track-token";
import { sealVerify } from "@/lib/verify";
import { verifyCookieName } from "@/lib/cookies";

// Configurable cookie jar so a test can seed the sealed verify cookie the code step reads from.
let mockVerifyCookie: { name: string; value: string } | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mockVerifyCookie && mockVerifyCookie.name === name ? { value: mockVerifyCookie.value } : undefined),
  }),
}));

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
  mockVerifyCookie = null;
});

// ---------------------------------------------------------------------------
// Shallow helpers — viewer state only.
//
// main's direct children are the only siblings that matter here:
//   [maybe-notice-div, iframe, maybe-script]
// Keeping these SHALLOW is itself the assertion: a div present as a direct
// sibling of iframe proves a disclosure bar rendered; undefined proves it
// didn't.  A deep search would make byType(el, "div") return the grid divs
// from the gate states, breaking the viewer invariant.
// ---------------------------------------------------------------------------
const kidsOf = (el: { props: { children: unknown } }) => {
  const k = el.props.children;
  return Array.isArray(k) ? k : [k];
};
const byType = (el: { props: { children: unknown } }, type: string) =>
  kidsOf(el).find((c) => c && (c as { type?: string }).type === type) as { type: string; props: Record<string, unknown> } | undefined;

// ---------------------------------------------------------------------------
// Deep helpers — gate form states.
//
// The Transit restyle nests the <form> inside the 62/38 grid layout.  These
// recursive traversals find the form and its inputs wherever they live in the
// tree without caring about the surrounding structure.
//
// Assertions themselves are UNCHANGED: the form action, method, input names,
// types, and values are all still verified.  Only the structural assumption
// (form is a direct child of main) is relaxed.
// ---------------------------------------------------------------------------

// Find the first element with the given string type anywhere in the tree.
// Function components (type is a function, not a string) are treated as leaves
// whose interior is not visible here — the server render returns the unexpanded
// element, so only string-typed JSX elements are traversed.
const findFirstByType = (
  node: unknown,
  type: string,
): { type: string; props: Record<string, unknown> } | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const n = node as { type?: unknown; props?: { children?: unknown } };
  if (n.type === type) return n as { type: string; props: Record<string, unknown> };
  if (!n.props?.children) return undefined;
  const kids = Array.isArray(n.props.children) ? n.props.children : [n.props.children];
  for (const kid of kids) {
    const found = findFirstByType(kid, type);
    if (found) return found;
  }
  return undefined;
};

// Collect all elements with the given string type anywhere in the tree.
const findAllByType = (
  node: unknown,
  type: string,
): { type: string; props: Record<string, unknown> }[] => {
  if (!node || typeof node !== "object") return [];
  const n = node as { type?: unknown; props?: { children?: unknown } };
  const results: { type: string; props: Record<string, unknown> }[] = [];
  if (n.type === type) results.push(n as { type: string; props: Record<string, unknown> });
  if (n.props?.children) {
    const kids = Array.isArray(n.props.children) ? n.props.children : [n.props.children];
    for (const kid of kids) {
      results.push(...findAllByType(kid, type));
    }
  }
  return results;
};

// Pull the <form> from anywhere in the rendered tree.
const formOf = (el: { props: { children: unknown } }) =>
  findFirstByType(el, "form") as {
    type: string;
    props: { method: string; action: string; children: unknown };
  };

// Collect all <input> elements from anywhere inside the form.
const inputsOf = (form: { type: string; props: { method: string; action: string; children: unknown } }) =>
  findAllByType(form, "input") as { props: { type?: string; name?: string; value?: string } }[];

describe("viewer page", () => {
  it("renders the artifact in an allow-scripts sandbox with no same-origin escape", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>");
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }) });
    const iframe = byType(el, "iframe")!;
    // exact match, not toContain: an exact "allow-scripts" is what proves the
    // dangerous "allow-same-origin" token is absent from the sandbox.
    expect(iframe.props.sandbox).toBe("allow-scripts");
    expect(iframe.props.src).toBe("/artifact/" + link.slug);
  });

  it("renders no tracking script or notice when the link has tracking off", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>");
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }) });
    expect(byType(el, "iframe")).toBeTruthy();
    expect(byType(el, "script")).toBeUndefined();
    expect(byType(el, "div")).toBeUndefined(); // no recipient notice bar
  });

  it("renders a beacon script and a recipient notice when tracking is on", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({ params: Promise.resolve({ slug: link.slug }) });
    expect(byType(el, "iframe")).toBeTruthy();
    const notice = byType(el, "div")!;
    expect(String(notice.props.children)).toMatch(/opened/i); // honest disclosure to the recipient
    const script = byType(el, "script")!;
    const html = (script.props.dangerouslySetInnerHTML as { __html: string }).__html;
    expect(html).toContain("sendBeacon");
    expect(html).toContain("/api/track");
    const token = html.match(/var t="([^"]+)"/)![1];
    const claim = verifyTrackToken(token)!;
    expect(claim.linkId).toBe(link.id);
    expect(claim.viewer).toBe("anon"); // no access cookie in this render
  });

  const formGate = { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false };

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

  it("renders a code-entry form on step=code, taking the email from the sealed verify cookie (not the URL)", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", formGate, false, true);
    // The address lives in the sealed verify cookie set by /api/access, never in the query string.
    mockVerifyCookie = {
      name: verifyCookieName(link.slug),
      value: sealVerify({ slug: link.slug, email: "a@x.com", code: "123456", exp: Date.now() + 600_000 }),
    };
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({
      params: Promise.resolve({ slug: link.slug }),
      searchParams: Promise.resolve({ step: "code" }),
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

  it("falls back to the email form on step=code when the verify cookie is missing or expired", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", formGate, false, true);
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    const el = await ViewerPage({
      params: Promise.resolve({ slug: link.slug }),
      searchParams: Promise.resolve({ step: "code" }),
    });
    const form = formOf(el);
    expect(form.props.action).toBe(`/api/access?slug=${link.slug}`); // back to step one, not the code step
    expect(inputsOf(form).some((i) => i.props.name === "code")).toBe(false);
  });

  it("calls notFound() (throws) for an unknown slug", async () => {
    const { default: ViewerPage } = await import("@/app/v/[slug]/page");
    await expect(
      ViewerPage({ params: Promise.resolve({ slug: "missing" }) }),
    ).rejects.toThrow();
  });
});
