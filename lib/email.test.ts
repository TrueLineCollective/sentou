import { describe, it, expect, vi, afterEach } from "vitest";
import { getSender, emailConfigured } from "@/lib/email";

afterEach(() => { delete process.env.SENTOU_RESEND_KEY; delete process.env.SENTOU_EMAIL_FROM; vi.restoreAllMocks(); });

describe("email sender", () => {
  it("uses the console sender and reports not-configured by default", async () => {
    expect(emailConfigured()).toBe(false);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await getSender().sendCode("a@x.com", "123456");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("123456"));
  });
  it("POSTs to Resend when configured", async () => {
    process.env.SENTOU_RESEND_KEY = "re_test";
    process.env.SENTOU_EMAIL_FROM = "Sentou <no-reply@example.com>";
    expect(emailConfigured()).toBe(true);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getSender().sendCode("a@x.com", "654321");
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.to).toBe("a@x.com");
    expect(body.html).toContain("654321");
    vi.unstubAllGlobals();
  });
});
