import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequest } from "../../functions/api/[[path]]";

type PagesContext = Parameters<typeof onRequest>[0];

function makeCtx(path: string[], method = "POST"): PagesContext {
  return {
    request: new Request(`https://example.pages.dev/api/${path.join("/")}`, { method }),
    env: { API_URL: "https://api.example.com" },
    params: { path },
  } as unknown as PagesContext;
}

describe("Pages Function /api/* proxy — Set-Cookie forwarding", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards both Set-Cookie headers (access_token + refresh_token) from the Worker", async () => {
    const workerHeaders = new Headers([
      ["Content-Type", "application/json"],
      ["Set-Cookie", "access_token=abc; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900"],
      ["Set-Cookie", "refresh_token=xyz; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=604800"],
    ]);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: workerHeaders })
    );

    const res = await onRequest(makeCtx(["auth", "login"]));

    // getSetCookie() is Node 20+ / WHATWG; fall back to splitting the joined header value
    const allCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?(): string[] }).getSetCookie === "function"
        ? (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,\s*(?=[a-z_]+=)/i);

    expect(allCookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(allCookies.some((c) => c.startsWith("refresh_token="))).toBe(true);
  });
});
