import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileBottomNav } from "./MobileBottomNav";

describe("MobileBottomNav", () => {
  it("renders exactly five tabs: Home, Labs, Meds, Notes, More", () => {
    render(
      <MemoryRouter>
        <MobileBottomNav />
      </MemoryRouter>
    );
    for (const label of ["Home", "Labs", "Meds", "Notes", "More"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the home link as end-matching to avoid always-active", () => {
    render(
      <MemoryRouter initialEntries={["/vitals"]}>
        <MobileBottomNav />
      </MemoryRouter>
    );
    const home = screen.getByRole("link", { name: "Home" });
    expect(home.getAttribute("aria-current")).not.toBe("page");
  });

  it("has min-h 56px and safe-area bottom padding on the nav element", () => {
    const { container } = render(
      <MemoryRouter>
        <MobileBottomNav />
      </MemoryRouter>
    );
    const nav = container.querySelector("nav")!;
    expect(nav.className).toMatch(/min-h-\[56px\]/);
    expect(nav.className).toMatch(/pb-\[env/);
  });
});
