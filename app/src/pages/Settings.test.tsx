import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Settings } from "./Settings";

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
    expect(screen.getByText("r@x.com")).toBeInTheDocument();
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
});
