import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Login } from "./Login";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn().mockResolvedValue({ must_change_pw: false }) },
  ApiError: class ApiError extends Error {},
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/hooks/use-turnstile", () => ({
  useTurnstile: () => ({ ref: { current: null }, token: "valid-token", reset: vi.fn() }),
}));

const mockPost = api.post as ReturnType<typeof vi.fn>;

function wrap() {
  return (
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login", () => {
  it("renders the Welcome back heading and subhead", () => {
    render(wrap());
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Sign in to your family record.")).toBeInTheDocument();
  });

  it("renders 'Keep me signed in on this device' label", () => {
    render(wrap());
    expect(screen.getByLabelText(/keep me signed in on this device/i)).toBeInTheDocument();
  });

  it("checkbox is checked by default", () => {
    render(wrap());
    expect(screen.getByRole("checkbox", { name: /keep me signed in on this device/i })).toBeChecked();
  });

  it("renders the no-account helper text", () => {
    render(wrap());
    expect(screen.getByText(/ask your family's admin to send you an invite/i)).toBeInTheDocument();
  });

  it("sends remember=true when checkbox is left checked (default)", async () => {
    const user = userEvent.setup();
    render(wrap());

    await user.type(screen.getByLabelText(/email/i), "user@test.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    // leave checkbox in its default-checked state
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(mockPost).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({ remember: true })
    );
  });

  it("sends remember=false when checkbox is unchecked", async () => {
    const user = userEvent.setup();
    render(wrap());

    await user.type(screen.getByLabelText(/email/i), "user@test.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("checkbox", { name: /keep me signed in on this device/i }));
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(mockPost).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({ remember: false })
    );
  });
});
