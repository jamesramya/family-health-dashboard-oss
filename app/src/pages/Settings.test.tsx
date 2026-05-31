import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Settings } from "./Settings";
import { api } from "@/lib/api";

let mockRole = "viewer";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: mockRole },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ textSize: "normal", density: "comfortable", statusLanguage: "plain" }),
    patch: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));

function renderSettings(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/settings${search}`]}>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Settings", () => {
  it("non-admin user sees only Account, Appearance, About nav items", () => {
    mockRole = "viewer";
    renderSettings();
    expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "About" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Family" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "AI models" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Privacy & sharing" })).not.toBeInTheDocument();
  });

  it("admin user sees all 8 nav items", () => {
    mockRole = "admin";
    renderSettings();
    for (const label of ["Account", "Family", "Privacy & sharing", "Storage & backup", "Connected devices", "AI models", "Appearance", "About"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("?section=family URL param pre-selects Family tab (admin)", () => {
    mockRole = "admin";
    renderSettings("?section=family");
    const familyBtn = screen.getByRole("tab", { name: "Family" });
    expect(familyBtn).toHaveAttribute("aria-selected", "true");
  });

  it("defaults to Account section and shows user email", () => {
    mockRole = "viewer";
    renderSettings();
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByDisplayValue("r@x.com")).toBeInTheDocument();
  });

  it("active tab uses teal-50 background, not teal-500", () => {
    mockRole = "viewer";
    renderSettings();
    const accountTab = screen.getByRole("tab", { name: "Account" });
    expect(accountTab).toHaveClass("bg-teal-50");
    expect(accountTab).not.toHaveClass("bg-teal-500");
  });

  it("non-admin with ?section=family falls back to Account tab", () => {
    mockRole = "viewer";
    renderSettings("?section=family");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Family" })).not.toBeInTheDocument();
  });

  it("active tab has bg-teal-50 class (not bg-teal-500)", () => {
    mockRole = "viewer";
    renderSettings();
    const activeTab = screen.getByRole("tab", { name: "Account" });
    expect(activeTab.className).toContain("bg-teal-50");
    expect(activeTab.className).not.toContain("bg-teal-500");
  });

  it("active tab has rounded-xl class (not rounded-full)", () => {
    mockRole = "viewer";
    renderSettings();
    const activeTab = screen.getByRole("tab", { name: "Account" });
    expect(activeTab.className).toContain("rounded-xl");
    expect(activeTab.className).not.toContain("rounded-full");
  });

  it("each nav tab contains an SVG icon", () => {
    mockRole = "viewer";
    renderSettings();
    const tabs = document.querySelectorAll('[role="tab"]');
    tabs.forEach((tab) => {
      expect(tab.querySelector("svg")).not.toBeNull();
    });
  });

  // Red now: "review" section doesn't exist in SECTIONS array.
  // Green after: { id: "review", label: "Document review", adminOnly: true, ... } is added.
  it("admin user sees a Document review nav tab", () => {
    mockRole = "admin";
    renderSettings();
    expect(screen.getByRole("tab", { name: /document review/i })).toBeInTheDocument();
  });

  it("non-admin user does NOT see a Document review nav tab", () => {
    mockRole = "viewer";
    renderSettings();
    expect(screen.queryByRole("tab", { name: /document review/i })).not.toBeInTheDocument();
  });

  it("?section=ai URL param makes AI models tab aria-selected=true (admin)", () => {
    mockRole = "admin";
    renderSettings("?section=ai");
    expect(screen.getByRole("tab", { name: "AI models" })).toHaveAttribute("aria-selected", "true");
  });

  it("?section=foo invalid section falls back to Account tab", () => {
    mockRole = "viewer";
    renderSettings("?section=foo");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
  });

  it("?section=review for viewer falls back to Account tab", () => {
    mockRole = "viewer";
    renderSettings("?section=review");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
  });

  it("admin user sees all 9 nav items including Document review", () => {
    mockRole = "admin";
    renderSettings();
    for (const label of ["Account", "Family", "Privacy & sharing", "Storage & backup", "Connected devices", "AI models", "Document review", "Appearance", "About"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("?section=review for admin pre-selects Document review tab", () => {
    mockRole = "admin";
    renderSettings("?section=review");
    expect(screen.getByRole("tab", { name: /document review/i })).toHaveAttribute("aria-selected", "true");
  });

  describe("Document review pending dot", () => {
    beforeEach(() => {
      vi.mocked(api.get).mockResolvedValue({ textSize: "normal", density: "comfortable", statusLanguage: "plain" });
    });

    it("shows pending dot on Document review tab when items are pending", async () => {
      mockRole = "admin";
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path === "/admin/test-review") return Promise.resolve({ items: [{ id: "x" }] });
        return Promise.resolve({ textSize: "normal", density: "comfortable", statusLanguage: "plain" });
      });
      renderSettings();
      expect(await screen.findByTestId("review-pending-dot")).toBeInTheDocument();
    });

    it("hides pending dot when no items are pending", async () => {
      mockRole = "admin";
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path === "/admin/test-review") return Promise.resolve({ items: [] });
        return Promise.resolve({ textSize: "normal", density: "comfortable", statusLanguage: "plain" });
      });
      renderSettings();
      await screen.findByRole("tab", { name: /document review/i });
      expect(screen.queryByTestId("review-pending-dot")).not.toBeInTheDocument();
    });

    it("does not show dot for non-admin users", async () => {
      mockRole = "viewer";
      renderSettings();
      expect(screen.queryByTestId("review-pending-dot")).not.toBeInTheDocument();
    });
  });

  it("tab buttons have aria-controls pointing to settings-panel", () => {
    mockRole = "viewer";
    renderSettings();
    const tabs = screen.getAllByRole("tab");
    tabs.forEach((tab) => {
      expect(tab).toHaveAttribute("aria-controls", "settings-panel");
    });
  });

  it("content panel has role=tabpanel and id=settings-panel", () => {
    mockRole = "viewer";
    renderSettings();
    const panel = document.getElementById("settings-panel");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("role", "tabpanel");
  });
});
