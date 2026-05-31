import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { About } from "./About";

describe("About", () => {
  it("renders version, sha, and build date in the standard shape", () => {
    render(<About />);
    expect(
      screen.getByText(/^v\d+\.\d+\.\d+ · [0-9a-f]{7,} · built \d{1,2} [A-Z][a-z]{2} \d{4} · MIT licensed$/),
    ).toBeInTheDocument();
  });

  it("renders the section heading", () => {
    render(<About />);
    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
  });

  it("page title uses Inter semibold, not Instrument Serif", () => {
    const { container } = render(<About />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });
});
