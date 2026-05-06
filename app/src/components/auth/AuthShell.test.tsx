import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthShell } from "./AuthShell";

describe("AuthShell wordmark typography", () => {
  it("desktop wordmark uses font-display, not font-serif", () => {
    render(
      <AuthShell heroTitle="Test Title" heroBody="Test body">
        <div>content</div>
      </AuthShell>
    );
    const wordmarks = screen.getAllByText("Family Health");
    const desktop = wordmarks.find((el) => el.className.includes("text-2xl"));
    expect(desktop).toBeDefined();
    expect(desktop!.className).toContain("font-display");
    expect(desktop!.className).not.toContain("font-serif");
  });

  it("mobile wordmark uses font-display, not font-serif", () => {
    render(
      <AuthShell heroTitle="Test Title" heroBody="Test body">
        <div>content</div>
      </AuthShell>
    );
    const wordmarks = screen.getAllByText("Family Health");
    const mobile = wordmarks.find((el) => el.className.includes("text-xl"));
    expect(mobile).toBeDefined();
    expect(mobile!.className).toContain("font-display");
    expect(mobile!.className).not.toContain("font-serif");
  });

  it("hero title paragraph retains font-serif (allowlisted)", () => {
    render(
      <AuthShell heroTitle="Test Title" heroBody="Test body">
        <div>content</div>
      </AuthShell>
    );
    const hero = screen.getByText("Test Title");
    expect(hero.className).toContain("font-serif");
  });
});
