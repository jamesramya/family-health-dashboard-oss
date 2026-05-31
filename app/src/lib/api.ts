// Typed fetch wrapper for the Family Health Dashboard API.
// All requests are sent to /api prefix with credentials: "include" (cookies).
// On 401: attempt one /api/auth/refresh, then retry. On second 401: redirect to /login.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  isRetry = false
): Promise<T> {
  const hasBody = body !== undefined;
  const isFormData = body instanceof FormData;
  // Don't set Content-Type for FormData — browser sets it with the multipart boundary
  const headers: Record<string, string> =
    hasBody && !isFormData ? { "Content-Type": "application/json" } : {};

  const init: RequestInit = {
    method,
    credentials: "include",
    headers,
    ...(hasBody ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  };

  const url = `/api${path}`;
  const response = await fetch(url, init);

  if (response.status === 401) {
    if (isRetry) {
      // Already tried refreshing — give up and redirect
      const here = window.location.pathname + window.location.search;
      window.location.href = "/login?returnTo=" + encodeURIComponent(here);
      return undefined as unknown as T;
    }

    // Attempt token refresh
    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {},
    });

    if (refreshResponse.status === 401) {
      const here = window.location.pathname + window.location.search;
      window.location.href = "/login?returnTo=" + encodeURIComponent(here);
      return undefined as unknown as T;
    }

    // Retry original request once
    return request<T>(method, path, body, true);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let data: Record<string, unknown> | undefined;
    try {
      const json = await response.json() as Record<string, unknown>;
      if (typeof json?.error === "string") message = json.error;
      data = json;
    } catch { /* ignore JSON parse errors */ }
    throw new ApiError(response.status, message, data);
  }

  return response.json() as Promise<T>;
}

async function requestBlob(path: string, isRetry = false): Promise<Blob> {
  const url = `/api${path}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (response.status === 401) {
    if (isRetry) {
      const here = window.location.pathname + window.location.search;
      window.location.href = "/login?returnTo=" + encodeURIComponent(here);
      return new Blob();
    }
    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {},
    });
    if (refreshResponse.status === 401) {
      const here = window.location.pathname + window.location.search;
      window.location.href = "/login?returnTo=" + encodeURIComponent(here);
      return new Blob();
    }
    return requestBlob(path, true);
  }

  if (!response.ok) {
    throw new ApiError(response.status, `HTTP ${response.status}`);
  }

  return response.blob();
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body);
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PUT", path, body);
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PATCH", path, body);
  },
  delete<T>(path: string): Promise<T> {
    return request<T>("DELETE", path);
  },
  blob(path: string): Promise<Blob> {
    return requestBlob(path);
  },
};
