import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Storage } from "./Storage";

const mocks = vi.hoisted(() => ({ role: "admin" as string, exportData: vi.fn() }));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: mocks.role },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-storage", () => ({
  useStorageUsage: () => ({
    data: {
      total_bytes: 99254886,   // ~94.7 MB
      quota_bytes: 1073741824,
      by_category: {
        documents: 81985126,   // ~78.2 MB
        scans: 14784307,       // ~14.1 MB
        photos: 2516583,       // ~2.4 MB
      },
    },
    isLoading: false,
    isError: false,
  }),
  exportData: mocks.exportData,
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("Storage", () => {
  it("renders the section heading for admin", () => {
    mocks.role = "admin";
    render(wrap(<Storage />));
    expect(screen.getByRole("heading", { name: /storage/i })).toBeInTheDocument();
  });

  it("renders nothing for non-admin", () => {
    mocks.role = "viewer";
    const { container } = render(wrap(<Storage />));
    expect(container.firstChild).toBeNull();
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    mocks.role = "admin";
    const { container } = render(wrap(<Storage />));
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });

  it("renders a vault usage meter bar", () => {
    mocks.role = "admin";
    const { container } = render(wrap(<Storage />));
    // Progress bar: a filled div inside the meter container
    const bar = container.querySelector("[data-testid='usage-bar']");
    expect(bar).not.toBeNull();
  });

  it("renders usage headline with MB and quota text", () => {
    mocks.role = "admin";
    render(wrap(<Storage />));
    // Should show something like "94.7 MB" and "of 1 GB used"
    expect(screen.getAllByText(/MB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/of 1 GB used/i)).toBeInTheDocument();
  });

  it("renders breakdown categories: Documents, Scans, Photos", () => {
    mocks.role = "admin";
    render(wrap(<Storage />));
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Scans")).toBeInTheDocument();
    expect(screen.getByText("Photos")).toBeInTheDocument();
  });

  it("renders Export button that calls exportData when clicked", async () => {
    mocks.role = "admin";
    mocks.exportData.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(wrap(<Storage />));
    const exportBtn = screen.getByRole("button", { name: /export/i });
    expect(exportBtn).toBeInTheDocument();
    await user.click(exportBtn);
    await waitFor(() => expect(mocks.exportData).toHaveBeenCalledOnce());
  });

  it("renders Backup and Import rows as Coming soon", () => {
    mocks.role = "admin";
    render(wrap(<Storage />));
    // At least two "Coming soon" elements
    const comingSoon = screen.getAllByText(/coming soon/i);
    expect(comingSoon.length).toBeGreaterThanOrEqual(2);
  });
});
