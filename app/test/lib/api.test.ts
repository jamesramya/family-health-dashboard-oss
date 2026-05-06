import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "@/lib/api";

// We need to control window.location.href for redirect tests
const originalLocation = window.location;

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const response = responses[callIndex++] ?? responses[responses.length - 1];
    const body = response.body ?? {};
    return Promise.resolve({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: () => Promise.resolve(body),
    });
  });
}

beforeEach(() => {
  // Allow overwriting window.location
  Object.defineProperty(window, "location", {
    value: { href: "/" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

describe("api.get", () => {
  it("returns typed response on success", async () => {
    const fetchMock = mockFetch([{ status: 200, body: { name: "Alice" } }]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ name: string }>("/test");

    expect(result).toEqual({ name: "Alice" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/test", {
      method: "GET",
      credentials: "include",
      headers: {},
    });
  });

  it("prefixes path with /api", async () => {
    const fetchMock = mockFetch([{ status: 200, body: {} }]);
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/some/path");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/some/path",
      expect.any(Object)
    );
  });
});

describe("api.post", () => {
  it("sends body as JSON with correct headers", async () => {
    const fetchMock = mockFetch([{ status: 200, body: { ok: true } }]);
    vi.stubGlobal("fetch", fetchMock);

    await api.post("/submit", { key: "value" });

    expect(fetchMock).toHaveBeenCalledWith("/api/submit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
    });
  });

  it("returns typed response on success", async () => {
    const fetchMock = mockFetch([{ status: 200, body: { id: 42 } }]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.post<{ id: number }>("/items", { name: "test" });

    expect(result).toEqual({ id: 42 });
  });
});

describe("api.put", () => {
  it("sends PUT with JSON body", async () => {
    const fetchMock = mockFetch([{ status: 200, body: { updated: true } }]);
    vi.stubGlobal("fetch", fetchMock);

    await api.put("/items/1", { value: "new" });

    expect(fetchMock).toHaveBeenCalledWith("/api/items/1", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "new" }),
    });
  });
});

describe("api.delete", () => {
  it("sends DELETE request", async () => {
    const fetchMock = mockFetch([{ status: 200, body: {} }]);
    vi.stubGlobal("fetch", fetchMock);

    await api.delete("/items/1");

    expect(fetchMock).toHaveBeenCalledWith("/api/items/1", {
      method: "DELETE",
      credentials: "include",
      headers: {},
    });
  });
});

describe("401 handling", () => {
  it("on 401: calls /api/auth/refresh then retries original request", async () => {
    // First call: original request → 401
    // Second call: refresh → 200
    // Third call: retry original → 200
    const fetchMock = mockFetch([
      { status: 401 },
      { status: 200, body: {} },
      { status: 200, body: { name: "Alice" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ name: string }>("/protected");

    expect(result).toEqual({ name: "Alice" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Second call must be the refresh endpoint
    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall[0]).toBe("/api/auth/refresh");
    expect(secondCall[1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("on second 401 after refresh: redirects to /login", async () => {
    // First call: original → 401
    // Second call: refresh → 200
    // Third call: retry original → 401 again
    const fetchMock = mockFetch([
      { status: 401 },
      { status: 200, body: {} },
      { status: 401 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/protected");

    expect(window.location.href).toBe("/login");
  });

  it("on refresh 401: redirects to /login without retrying", async () => {
    // First call: original → 401
    // Second call: refresh → 401
    const fetchMock = mockFetch([{ status: 401 }, { status: 401 }]);
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/protected");

    expect(window.location.href).toBe("/login");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("error handling", () => {
  it("throws ApiError with status code for non-401 errors", async () => {
    const fetchMock = mockFetch([
      { status: 404, body: { error: "Not found" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/missing")).rejects.toThrow(ApiError);
    await expect(api.get("/missing")).rejects.toMatchObject({ status: 404 });
  });

  it("throws ApiError with message from response body", async () => {
    const fetchMock = mockFetch([
      { status: 422, body: { error: "Validation failed" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    let caught: ApiError | undefined;
    try {
      await api.get("/bad");
    } catch (e) {
      caught = e as ApiError;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.message).toBe("Validation failed");
    expect(caught?.status).toBe(422);
  });

  it("throws ApiError for 500 errors", async () => {
    const fetchMock = mockFetch([{ status: 500, body: { error: "Server error" } }]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/crash")).rejects.toThrow(ApiError);
  });

  it("catches network errors and throws them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure"))
    );

    await expect(api.get("/anywhere")).rejects.toThrow("Network failure");
  });
});
