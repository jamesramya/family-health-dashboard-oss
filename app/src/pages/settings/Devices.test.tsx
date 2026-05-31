import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Devices } from "./Devices";

let mockRole = "admin";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: mockRole },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

describe("Devices", () => {
  it("renders the section heading for admin", () => {
    mockRole = "admin";
    render(<Devices />);
    expect(screen.getByRole("heading", { name: /connected devices/i })).toBeInTheDocument();
  });

  it("renders nothing for non-admin", () => {
    mockRole = "viewer";
    const { container } = render(<Devices />);
    expect(container.firstChild).toBeNull();
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    mockRole = "admin";
    const { container } = render(<Devices />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });

  it("renders all four device rows", () => {
    mockRole = "admin";
    render(<Devices />);
    expect(screen.getByText("Omron BP monitor")).toBeInTheDocument();
    expect(screen.getByText("Apple Health")).toBeInTheDocument();
    expect(screen.getByText("Dexcom G7")).toBeInTheDocument();
    expect(screen.getByText("Fitbit")).toBeInTheDocument();
  });

  it("shows a coming-soon badge on each device row", () => {
    mockRole = "admin";
    render(<Devices />);
    const badges = screen.getAllByText(/coming soon/i);
    expect(badges.length).toBe(4);
  });

  it("renders a list element for device rows", () => {
    mockRole = "admin";
    const { container } = render(<Devices />);
    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    expect(ul!.querySelectorAll("li").length).toBe(4);
  });
});
