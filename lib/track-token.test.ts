import { describe, it, expect } from "vitest";
import { signTrackToken, verifyTrackToken } from "@/lib/track-token";

describe("track token", () => {
  it("round-trips", () => {
    const t = signTrackToken({ linkId: "L", version: 2, viewer: "a@x.com", eventId: "e1" });
    expect(verifyTrackToken(t)).toEqual({ linkId: "L", version: 2, viewer: "a@x.com", eventId: "e1" });
  });
  it("rejects tampering and junk", () => {
    const t = signTrackToken({ linkId: "L", version: 1, viewer: "a@x.com", eventId: "e1" });
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ linkId: "L", version: 1, viewer: "evil@x.com", eventId: "e1" })).toString("base64url");
    expect(verifyTrackToken(forged + "." + sig)).toBeNull();
    expect(verifyTrackToken("nope")).toBeNull();
    expect(verifyTrackToken(null)).toBeNull();
  });
});
