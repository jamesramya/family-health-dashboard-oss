import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

function renderSidebar(isAdmin = false) {
  return render(
    <MemoryRouter>
      <Sidebar
        user={{
          display_name: "Ravi",
          email: "r@x.com",
          isAdmin,
          role: isAdmin ? "admin" : "viewer",
        }}
        onSignOut={() => {}}
      />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("renders the Family Health wordmark with display font", () => {
    renderSidebar();
    const wordmark = screen.getByText("Family Health");
    expect(wordmark).toBeInTheDocument();
    expect(wordmark.className).toContain("font-display");
  });

  it("renders the seven core nav items", () => {
    renderSidebar();
    for (const label of ["Home", "Lab results", "Vitals", "Medications", "Notes", "Scans", "Documents", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("never renders an Admin nav link", () => {
    renderSidebar(true);
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("renders the user footer with display name and sign out icon button", () => {
    renderSidebar();
    expect(screen.getByText("Ravi")).toBeInTheDocument();
    const signOut = screen.getByRole("button", { name: /sign out/i });
    expect(signOut).toBeInTheDocument();
    expect(signOut).toHaveTextContent("");
  });

  it("renders user initials avatar in footer", () => {
    renderSidebar();
    expect(screen.getByText("RA")).toBeInTheDocument();
  });

  it("renders the user's role label in the footer", () => {
    renderSidebar(true);
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0);
  });

  it("renders 'Viewer' for non-admin users", () => {
    renderSidebar(false);
    expect(screen.getByText(/viewer/i)).toBeInTheDocument();
  });
});
