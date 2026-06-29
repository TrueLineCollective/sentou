import { describe, it, expect, vi, afterEach } from "vitest";
import { publishArtifact, republishArtifact } from "@/mcp/client";
// republishArtifact is exercised by the MCP `republish` tool; cover it + the
// shared non-2xx error branch so a swallowed API error fails CI here, not in a
// confusing MCP tool-call failure.

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SENTOU_API_KEY;
});

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

  it("republishArtifact posts to the republish route and returns the version", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "a", slug: "s", url: "http://x/v/s", version: 2 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await republishArtifact("a", "<h1>v2</h1>");
    expect(res.version).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/republish"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on a non-2xx response instead of returning undefined", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(publishArtifact("<p>x</p>")).rejects.toThrow(/publish failed: 500/);
  });

  it("sends the api key bearer when SENTOU_API_KEY is set", async () => {
    process.env.SENTOU_API_KEY = "sk-test-abc123";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "a", slug: "s", url: "http://x/v/s", version: 1 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await publishArtifact("<h1>x</h1>");
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init[1].headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test-abc123");
  });

  it("omits the authorization header when SENTOU_API_KEY is unset", async () => {
    delete process.env.SENTOU_API_KEY;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "a", slug: "s", url: "http://x/v/s", version: 1 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await publishArtifact("<h1>x</h1>");
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init[1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty("authorization");
  });
});
