import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "@/lib/auth-context";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { api } from "@/lib/api";
const mockApi = api as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: { href: "/", pathname: "/", search: "" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper component to read auth state
function AuthConsumer() {
  const { user, isLoading, login, logout } = useAuth();
  return (
    <div>
      {isLoading && <span data-testid="loading">loading</span>}
      {user && <span data-testid="user-email">{user.email}</span>}
      {!user && !isLoading && <span data-testid="no-user">no user</span>}
      <button
        onClick={() => login("a@b.com", "pw", "token")}
        data-testid="login-btn"
      >
        Login
      </button>
      <button onClick={logout} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

describe("AuthProvider — initial mount", () => {
  it("calls /api/auth/me on mount and sets user state", async () => {
    mockApi.get.mockResolvedValueOnce({
      user: {
        id: 1,
        email: "test@example.com",
        role: "admin",
        display_name: "Test",
        is_super_admin: false,
        must_change_pw: false,
      },
    });

    renderWithAuth();

    // Should show loading initially
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toHaveTextContent(
        "test@example.com"
      );
    });

    expect(mockApi.get).toHaveBeenCalledWith("/auth/me");
  });

  it("on /api/auth/me 401, sets user to null (unauthenticated)", async () => {
    const { ApiError } = await import("@/lib/api");
    mockApi.get.mockRejectedValueOnce(new ApiError(401, "Unauthorized"));

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("no-user")).toBeInTheDocument();
    });
  });

  it("on /api/auth/me network error, sets user to null", async () => {
    mockApi.get.mockRejectedValueOnce(new Error("Network error"));

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("no-user")).toBeInTheDocument();
    });
  });

  it("shows loading state during initial auth check", async () => {
    let resolveMe!: (value: unknown) => void;
    mockApi.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMe = resolve;
      })
    );

    renderWithAuth();

    expect(screen.getByTestId("loading")).toBeInTheDocument();

    act(() => {
      resolveMe({
        user: {
          id: 1,
          email: "user@test.com",
          role: "viewer",
          display_name: "User",
          is_super_admin: false,
          must_change_pw: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });
  });
});

describe("AuthProvider — login()", () => {
  it("calls API and sets user on success", async () => {
    // Initial me check → null
    mockApi.get.mockRejectedValueOnce(new Error("Unauthorized"));
    // Post-login /auth/me call to fetch full user profile
    mockApi.get.mockResolvedValueOnce({
      user: {
        id: 2,
        email: "admin@test.com",
        role: "admin",
        display_name: "Admin",
        is_super_admin: 1,
        must_change_pw: 0,
      },
    });
    // Login call
    mockApi.post.mockResolvedValueOnce({
      user: {
        id: 2,
        email: "admin@test.com",
        role: "admin",
        display_name: "Admin",
      },
      must_change_pw: false,
    });

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("no-user")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("login-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toHaveTextContent(
        "admin@test.com"
      );
    });

    expect(mockApi.post).toHaveBeenCalledWith("/auth/login", {
      email: "a@b.com",
      password: "pw",
      turnstileToken: "token",
    });
  });

  it("redirects to /change-password when must_change_pw is true", async () => {
    mockApi.get.mockRejectedValueOnce(new Error("Unauthorized"));
    // Post-login /auth/me call to fetch full user profile
    mockApi.get.mockResolvedValueOnce({
      user: {
        id: 3,
        email: "new@test.com",
        role: "admin",
        display_name: "New",
        is_super_admin: 0,
        must_change_pw: 1,
      },
    });
    mockApi.post.mockResolvedValueOnce({
      user: {
        id: 3,
        email: "new@test.com",
        role: "admin",
        display_name: "New",
      },
      must_change_pw: true,
    });

    renderWithAuth();

    await waitFor(() =>
      expect(screen.getByTestId("no-user")).toBeInTheDocument()
    );

    await userEvent.click(screen.getByTestId("login-btn"));

    await waitFor(() => {
      expect(window.location.href).toBe("/change-password");
    });
  });
});

describe("AuthProvider — logout()", () => {
  it("calls logout API and clears user state", async () => {
    mockApi.get.mockResolvedValueOnce({
      user: {
        id: 1,
        email: "user@test.com",
        role: "viewer",
        display_name: "User",
        is_super_admin: false,
        must_change_pw: false,
      },
    });
    mockApi.post.mockResolvedValueOnce({});

    renderWithAuth();

    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("logout-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("no-user")).toBeInTheDocument();
    });

    expect(mockApi.post).toHaveBeenCalledWith("/auth/logout");
  });
});
