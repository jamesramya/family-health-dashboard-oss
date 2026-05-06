import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreferencesProvider } from "@/contexts/PreferencesContext";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      user: {
        id: "u1",
        email: "t@example.com",
        role: "viewer",
        display_name: "Test User",
        is_super_admin: 0,
        must_change_pw: 0,
      },
    }),
    post: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

vi.mock("@/hooks/use-admin", () => ({
  usePatients: () => ({ data: { patients: [] }, isLoading: false }),
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
}));

import { Layout } from "@/components/Layout";
import { AuthProvider } from "@/lib/auth-context";
import { UploadQueueProvider } from "@/contexts/upload-queue";
import { SelectedPatientProvider } from "@/contexts/selected-patient";
import { ConfirmProvider } from "@/hooks/use-confirm";

function renderLayout(path = "/") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <PreferencesProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <UploadQueueProvider>
            <SelectedPatientProvider>
              <ConfirmProvider>
                <MemoryRouter initialEntries={[path]}>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route index element={<div>Page content</div>} />
                      <Route path="/vitals" element={<div>Vitals content</div>} />
                    </Route>
                  </Routes>
                </MemoryRouter>
              </ConfirmProvider>
            </SelectedPatientProvider>
          </UploadQueueProvider>
        </AuthProvider>
      </QueryClientProvider>
    </PreferencesProvider>
  );
}

function hasAncestorWithClass(el: HTMLElement, cls: RegExp): boolean {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.className && cls.test(cur.className)) return true;
    cur = cur.parentElement;
  }
  return false;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Layout — FloatingAddFab", () => {
  it("renders FloatingAddFab on /vitals route", async () => {
    renderLayout("/vitals");
    await waitFor(() => {
      expect(screen.getByText("Vitals content")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /quick add/i })).toBeInTheDocument();
  });

  it("clicking a FAB action opens QuickAddModal with the correct kind", async () => {
    renderLayout("/vitals");
    await waitFor(() => {
      expect(screen.getByText("Vitals content")).toBeInTheDocument();
    });

    // Open the FAB menu
    await userEvent.click(screen.getByRole("button", { name: /quick add/i }));

    // Click "Log Vital" pill
    const vitalPill = await screen.findByRole("button", { name: /log vital/i });
    await userEvent.click(vitalPill);

    // QuickAddModal should open with "Log Vital" title
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /log vital/i })).toBeInTheDocument();
    });
  });
});

describe("Layout — mobile/tablet app bar", () => {
  it("renders a hamburger button hidden only on desktop (lg:hidden) so mobile and tablet can reach the side nav", async () => {
    renderLayout();
    await waitFor(() => {
      expect(screen.getByText("Page content")).toBeInTheDocument();
    });

    const hamburger = screen.getByRole("button", { name: /open navigation/i });
    expect(hasAncestorWithClass(hamburger, /(^|\s)lg:hidden(\s|$)/)).toBe(true);
    expect(hasAncestorWithClass(hamburger, /(^|\s)hidden md:block(\s|$)/)).toBe(false);
  });

  it("clicking the hamburger opens the drawer with all nav items including ones missing from the bottom nav", async () => {
    renderLayout();
    await waitFor(() => {
      expect(screen.getByText("Page content")).toBeInTheDocument();
    });

    const hamburger = screen.getByRole("button", { name: /open navigation/i });
    await userEvent.click(hamburger);

    const drawer = await screen.findByRole("dialog", { name: /navigation/i });
    expect(within(drawer).getByRole("link", { name: "Scans" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Notes" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Documents" })).toBeInTheDocument();
  });
});
