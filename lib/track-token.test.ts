import { describe, it, expect } from "vitest";
import { signTrackToken, verifyTrackToken } from "@/lib/track-token";

const future = Date.now() + 600_000;

describe("track token", () => {
  it("round-trips", () => {
    const t = signTrackToken({ linkId: "L", version: 2, viewer: "a@x.com", eventId: "e1", exp: future });
    expect(verifyTrackToken(t)).toEqual({ linkId: "L", version: 2, viewer: "a@x.com", eventId: "e1", exp: future });
  });
  it("rejects an expired token (replay bound)", () => {
    const t = signTrackToken({ linkId: "L", version: 1, viewer: "a@x.com", eventId: "e1", exp: 1000 });
    expect(verifyTrackToken(t, 2000)).toBeNull();
    expect(verifyTrackToken(t, 500)).not.toBeNull();
  });
  it("rejects tampering and junk", () => {
    const t = signTrackToken({ linkId: "L", version: 1, viewer: "a@x.com", eventId: "e1", exp: future });
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ linkId: "L", version: 1, viewer: "evil@x.com", eventId: "e1", exp: future })).toString("base64url");
    expect(verifyTrackToken(forged + "." + sig)).toBeNull();
    expect(verifyTrackToken("nope")).toBeNull();
    expect(verifyTrackToken(null)).toBeNull();
  });
  it("keeps the linkId opaque to the client (body is encrypted, not readable base64 JSON)", () => {
    // The token ships to every recipient in the viewer page. Decoding the body must NOT
    // reveal the owner-held linkId, otherwise any recipient could hit /api/stats?id=<linkId>
    // and enumerate every other recipient. Server-side verify must still recover it.
    const t = signTrackToken({ linkId: "secret-link-id", version: 1, viewer: "a@x.com", eventId: "e1", exp: future });
    const body = t.split(".")[0];
    const decoded = Buffer.from(body, "base64url").toString("utf8");
    expect(decoded).not.toContain("secret-link-id");
    expect(() => JSON.parse(decoded)).toThrow();
    expect(verifyTrackToken(t)!.linkId).toBe("secret-link-id");
  });
});
