import { describe, it, expect, vi, afterEach } from "vitest";
import { publishArtifact, republishArtifact } from "@/mcp/client";

afterEach(() => vi.restoreAllMocks());

describe("mcp http client", () => {
  it("publishArtifact posts html and returns the url", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "a", slug: "s", url: "http://x/v/s", version: 1 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await publishArtifact("<h1>x</h1>");
    expect(res.url).toBe("http://x/v/s");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/publish"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
