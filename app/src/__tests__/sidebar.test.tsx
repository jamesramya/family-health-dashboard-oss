import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";

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

describe("Sidebar — admin route removal", () => {
  it("admin user does NOT see an Admin nav link", () => {
    // After implementation: Admin link is removed from Sidebar entirely.
    // This test is red now because the admin NavLink still exists in Sidebar.tsx.
    renderSidebar(true);
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("non-admin user does not see an Admin nav link", () => {
    renderSidebar(false);
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });
});
