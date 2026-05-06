import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Profile } from "./Profile";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { display_name: "Test User", email: "test@example.com" } }),
}));

describe("Profile", () => {
  it("renders display name and email", () => {
    render(<Profile />);
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });
});
