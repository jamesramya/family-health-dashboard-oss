import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Account } from "./Account";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "ravi@example.com", role: "viewer" },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

describe("Account", () => {
  it("renders the user's email", () => {
    render(<MemoryRouter><Account /></MemoryRouter>);
    expect(screen.getByText("ravi@example.com")).toBeInTheDocument();
  });

  it("renders the user's display name", () => {
    render(<MemoryRouter><Account /></MemoryRouter>);
    expect(screen.getByText("Ravi")).toBeInTheDocument();
  });

  it("has a Change password link pointing to /change-password", () => {
    render(<MemoryRouter><Account /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /change/i });
    expect(link).toHaveAttribute("href", "/change-password");
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    const { container } = render(<MemoryRouter><Account /></MemoryRouter>);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });
});
