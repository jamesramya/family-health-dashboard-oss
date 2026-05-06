import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Storage } from "./Storage";

let mockRole = "admin";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: mockRole },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

describe("Storage", () => {
  it("renders the section heading for admin", () => {
    mockRole = "admin";
    render(<Storage />);
    expect(screen.getByRole("heading", { name: /storage/i })).toBeInTheDocument();
  });

  it("renders nothing for non-admin", () => {
    mockRole = "viewer";
    const { container } = render(<Storage />);
    expect(container.firstChild).toBeNull();
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    mockRole = "admin";
    const { container } = render(<Storage />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });
});
