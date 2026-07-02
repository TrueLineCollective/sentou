import { describe, it, expect } from "vitest";
import { createMemoryStore } from "@/lib/store";
import { createLink } from "@/lib/links";
import { verifyTrackToken } from "@/lib/track-token";
import { trackingContext } from "@/lib/tracking-context";

describe("trackingContext", () => {
  it("returns track:false when the link has tracking off", async () => {
    const link = await createLink(createMemoryStore(), "<h1>x</h1>");
    expect(trackingContext(link, null)).toEqual({ track: false });
  });
  it("attributes the open to a VERIFIED viewer's email when on", async () => {
    const link = await createLink(createMemoryStore(), "<h1>x</h1>", undefined, true);
    const ctx = trackingContext(link, { linkId: link.id, email: "a@x.com", verified: true });
    expect(ctx.track).toBe(true);
    const claim = verifyTrackToken((ctx as { token: string }).token)!;
    expect(claim.linkId).toBe(link.id);
    expect(claim.viewer).toBe("a@x.com");
  });
  it("attributes to anon for an UNVERIFIED viewer (record-only gate), never storing the unverified email", async () => {
    const link = await createLink(createMemoryStore(), "<h1>x</h1>", undefined, true);
    const ctx = trackingContext(link, { linkId: link.id, email: "a@x.com", verified: false }) as { track: true; token: string };
    expect(verifyTrackToken(ctx.token)!.viewer).toBe("anon");
  });
  it("attributes to anon when there is no matching claim", async () => {
    const link = await createLink(createMemoryStore(), "<h1>x</h1>", undefined, true);
    const ctx = trackingContext(link, null) as { track: true; token: string };
    expect(verifyTrackToken(ctx.token)!.viewer).toBe("anon");
  });
  it("does not attribute a claim from a different link (cross-link privacy guard)", async () => {
    const link = await createLink(createMemoryStore(), "<h1>x</h1>", undefined, true);
    // A valid access cookie for link A must not stamp the viewer's email onto link B.
    const ctx = trackingContext(link, { linkId: "some-other-link-id", email: "a@x.com" }) as { track: true; token: string };
    expect(verifyTrackToken(ctx.token)!.viewer).toBe("anon");
  });
  it("keys an anonymous viewer by the per-browser id so distinct browsers are distinct viewers", async () => {
    const link = await createLink(createMemoryStore(), "<h1>x</h1>", undefined, true);
    const a = trackingContext(link, null, "browser-a") as { track: true; token: string };
    const b = trackingContext(link, null, "browser-b") as { track: true; token: string };
    expect(verifyTrackToken(a.token)!.viewer).toBe("anon:browser-a");
    expect(verifyTrackToken(b.token)!.viewer).toBe("anon:browser-b");
    // Distinct browsers must map to distinct viewers, or the owner's open-notification collapses.
    expect(verifyTrackToken(a.token)!.viewer).not.toBe(verifyTrackToken(b.token)!.viewer);
  });
  it("ignores the visitor id for a VERIFIED viewer (email still wins)", async () => {
    const link = await createLink(createMemoryStore(), "<h1>x</h1>", undefined, true);
    const ctx = trackingContext(link, { linkId: link.id, email: "a@x.com", verified: true }, "browser-a") as { track: true; token: string };
    expect(verifyTrackToken(ctx.token)!.viewer).toBe("a@x.com");
  });
});
