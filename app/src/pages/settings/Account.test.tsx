import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Account } from "./Account";

const mockMutate = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "ravi@example.com", role: "viewer" },
    logout: vi.fn(),
    isLoading: false,
    refreshUser: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-account", () => ({
  useUpdateMe: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Account", () => {
  it("renders the display name in a form field", () => {
    render(wrap(<Account />));
    expect(screen.getByDisplayValue("Ravi")).toBeInTheDocument();
  });

  it("renders the email in a form field", () => {
    render(wrap(<Account />));
    expect(screen.getByDisplayValue("ravi@example.com")).toBeInTheDocument();
  });

  it("submitting the form calls the mutation", async () => {
    const user = userEvent.setup();
    render(wrap(<Account />));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(mockMutate).toHaveBeenCalled();
  });

  it("has a Change password link pointing to /change-password", () => {
    render(wrap(<Account />));
    const link = screen.getByRole("link", { name: /change/i });
    expect(link).toHaveAttribute("href", "/change-password");
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    const { container } = render(wrap(<Account />));
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });

  it("shows saved confirmation after successful save", async () => {
    const user = userEvent.setup();
    mockMutate.mockImplementation((_data: unknown, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    render(wrap(<Account />));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
  });
});
