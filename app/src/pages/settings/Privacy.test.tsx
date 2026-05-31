import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Privacy } from "./Privacy";

let mockRole = "admin";
const mockCreateShareLink = vi.fn();
const mockRevokeShareLink = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: mockRole },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/components/UserManagement", () => ({
  UserManagement: () => <div data-testid="user-management" />,
}));

vi.mock("@/hooks/use-share-links", () => ({
  useShareLinks: () => ({ data: { links: [] }, isLoading: false }),
  useCreateShareLink: () => ({ mutate: mockCreateShareLink, isPending: false }),
  useRevokeShareLink: () => ({ mutate: mockRevokeShareLink, isPending: false }),
}));

vi.mock("@/hooks/use-admin", () => ({
  usePatients: () => ({
    data: { patients: [{ id: "p-1", name: "Demo Patient" }] },
    isLoading: false,
  }),
}));

describe("Privacy", () => {
  it("renders the section heading for admin", () => {
    mockRole = "admin";
    render(<Privacy />);
    expect(screen.getByRole("heading", { name: /privacy/i })).toBeInTheDocument();
  });

  it("renders nothing for non-admin", () => {
    mockRole = "viewer";
    const { container } = render(<Privacy />);
    expect(container.firstChild).toBeNull();
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    mockRole = "admin";
    const { container } = render(<Privacy />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });

  it("renders a Members card heading for admin", () => {
    mockRole = "admin";
    render(<Privacy />);
    expect(screen.getByRole("heading", { name: /members/i })).toBeInTheDocument();
  });

  it("renders UserManagement inside the Members card for admin", () => {
    mockRole = "admin";
    render(<Privacy />);
    expect(screen.getByTestId("user-management")).toBeInTheDocument();
  });

  it("renders the Share with doctor card", () => {
    mockRole = "admin";
    render(<Privacy />);
    expect(screen.getByText(/share with doctor/i)).toBeInTheDocument();
  });

  it("renders the New link button in the doctor share card", () => {
    mockRole = "admin";
    render(<Privacy />);
    expect(screen.getByRole("button", { name: /new link/i })).toBeInTheDocument();
  });

  it("renders Emergency access card with Set up button disabled", () => {
    mockRole = "admin";
    render(<Privacy />);
    expect(screen.getByText(/emergency access/i)).toBeInTheDocument();
    const setupBtn = screen.getByRole("button", { name: /set up/i });
    expect(setupBtn).toBeDisabled();
  });

  it("submitting the share form calls createShareLink mutation", async () => {
    mockRole = "admin";
    mockCreateShareLink.mockClear();
    render(<Privacy />);

    // Open the share form by clicking "New link"
    fireEvent.click(screen.getByRole("button", { name: /new link/i }));

    // Submit the form (patient and days already have defaults)
    const generateBtn = screen.getByRole("button", { name: /generate/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockCreateShareLink).toHaveBeenCalled();
    });
  });
});
