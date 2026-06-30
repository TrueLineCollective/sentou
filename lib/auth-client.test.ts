import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Set env before module load
const BASE = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = BASE;

// @better-fetch/fetch passes a URL object as the first arg to fetch, not a string.
// This helper normalises the first fetch arg to a URL string regardless of type.
function fetchArgToString(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof URL) return arg.href;
  if (arg instanceof Request) return arg.url;
  return String(arg);
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ token: "test-token", user: { id: "1", email: "owner@example.com", name: "Test Owner" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("auth-client", () => {
  it("authClient exports signUp, signIn, signOut, useSession", async () => {
    const mod = await import("./auth-client");
    expect(typeof mod.authClient.signUp.email).toBe("function");
    expect(typeof mod.authClient.signIn.email).toBe("function");
    expect(typeof mod.authClient.signOut).toBe("function");
    expect(typeof mod.authClient.useSession).toBe("function");
  });

  it("signUp.email POSTs to the correct URL with correct body shape", async () => {
    const { authClient } = await import("./auth-client");

    await authClient.signUp.email({
      name: "Test Owner",
      email: "owner@example.com",
      password: "supersecret123",
    });

    expect(fetchMock).toHaveBeenCalled();

    const [rawUrl, options] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const url = fetchArgToString(rawUrl);

    // URL must point to the Better Auth sign-up endpoint
    expect(url).toContain("/api/auth/sign-up/email");

    // Must be a POST
    expect((options?.method ?? "GET").toUpperCase()).toBe("POST");

    // Body must include email and name
    const body = JSON.parse(options?.body as string);
    expect(body.email).toBe("owner@example.com");
    expect(body.name).toBe("Test Owner");
  });

  it("baseURL derives from NEXT_PUBLIC_APP_URL env var", async () => {
    const { authClient } = await import("./auth-client");

    await authClient.signIn.email({
      email: "owner@example.com",
      password: "supersecret123",
    });

    expect(fetchMock).toHaveBeenCalled();
    const [rawUrl] = fetchMock.mock.calls[0] as [unknown];
    const url = fetchArgToString(rawUrl);
    expect(url.startsWith(BASE)).toBe(true);
  });
});
