import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserManagement } from "./UserManagement";

vi.mock("@/hooks/use-admin", () => ({
  useUsers: () => ({
    data: {
      users: [
        {
          id: "u1",
          email: "admin@example.com",
          display_name: "Admin User",
          role: "admin",
          is_super_admin: 0,
          must_change_pw: 0,
        },
      ],
    },
    isLoading: false,
  }),
  useCreateUser: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdateUser: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteUser: () => ({ mutate: vi.fn(), isPending: false }),
  useResetUserPassword: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderManagement() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UserManagement />
    </QueryClientProvider>
  );
}

describe("UserManagement", () => {
  it("renders without crashing", () => {
    renderManagement();
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("admin role badge uses teal tokens (not purple)", () => {
    const { container } = renderManagement();
    expect(container.innerHTML).toMatch(/bg-teal-50/);
    expect(container.innerHTML).not.toMatch(/bg-purple-100/);
  });

  it("delete button uses rose tokens (not red)", () => {
    const { container } = renderManagement();
    expect(container.innerHTML).toMatch(/text-rose-400/);
    expect(container.innerHTML).not.toMatch(/text-red-400/);
  });

  it("user card uses rounded-2xl (not rounded-lg)", () => {
    const { container } = renderManagement();
    expect(container.innerHTML).toMatch(/rounded-2xl/);
  });

  it("required asterisks use rose tokens after opening AddUserForm", () => {
    const { container } = renderManagement();
    fireEvent.click(screen.getByRole("button", { name: "+ Add User" }));
    expect(container.innerHTML).toMatch(/text-rose-500/);
    expect(container.innerHTML).not.toMatch(/text-red-500/);
  });

  it("Reset PW action link uses rose tokens, not amber", () => {
    renderManagement();
    const resetBtn = screen.getByRole("button", { name: "Reset PW" });
    expect(resetBtn.className).not.toContain("text-amber-600");
    expect(resetBtn.className).toContain("text-rose-500");
  });

  it("contains no red-* Tailwind tokens in rendered output (base)", () => {
    const { container } = renderManagement();
    expect(container.innerHTML).not.toMatch(/(bg|text|border|ring)-red-/);
  });

  it("contains no red-* Tailwind tokens when AddUserForm is open", () => {
    const { container } = renderManagement();
    fireEvent.click(screen.getByRole("button", { name: "+ Add User" }));
    expect(container.innerHTML).not.toMatch(/(bg|text|border|ring)-red-/);
  });
});
