import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Security } from "./Security";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      sessions: [
        { id: "s1", user_agent: "Firefox", last_seen: "2024-01-01T00:00:00Z", current: true, created_at: "" },
        { id: "s2", user_agent: "Chrome", last_seen: "2024-01-01T00:00:00Z", current: false, created_at: "" },
      ],
    }),
    post: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/format", () => ({ formatDateTime: (d: string) => d }));

function wrap(ui: React.ReactElement) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={c}>{ui}</QueryClientProvider>;
}

const mockPost = api.post as ReturnType<typeof vi.fn>;

describe("Security", () => {
  it("marks current session with This device", async () => {
    render(wrap(<Security />));
    expect(await screen.findByText("This device")).toBeInTheDocument();
  });

  it("shows Revoke button for non-current sessions", async () => {
    render(wrap(<Security />));
    await screen.findByText("This device");
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
  });

  it("does not call api.post when passwords mismatch", async () => {
    mockPost.mockClear();
    const user = userEvent.setup();
    render(wrap(<Security />));
    await user.type(screen.getByPlaceholderText("Current password"), "oldpass");
    await user.type(screen.getByPlaceholderText("New password (min 12 chars)"), "newpassword123");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "different1234");
    await user.click(screen.getByRole("button", { name: /update password/i }));
    expect(mockPost).not.toHaveBeenCalledWith("/auth/change-password", expect.anything());
  });

  it("shows success message after password update", async () => {
    const user = userEvent.setup();
    render(wrap(<Security />));
    await user.type(screen.getByPlaceholderText("Current password"), "oldpass");
    await user.type(screen.getByPlaceholderText("New password (min 12 chars)"), "newpassword123");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: /update password/i }));
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
  });

  it("all h2 titles use Inter semibold, not Instrument Serif", async () => {
    const { container } = render(wrap(<Security />));
    await screen.findByText("This device");
    const h2s = container.querySelectorAll("h2");
    expect(h2s).toHaveLength(2);
    h2s.forEach((h) => {
      expect(h.className).not.toContain("font-serif");
      expect(h.className).not.toContain("font-display");
      expect(h.className).toContain("font-semibold");
    });
  });
});
