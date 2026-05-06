import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MobileDrawer } from "./MobileDrawer";

function renderDrawer(opts: Partial<Parameters<typeof MobileDrawer>[0]> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    user: { display_name: "Ravi", email: "r@x.com", isAdmin: false, role: "viewer" as const },
    onSignOut: vi.fn(),
    ...opts,
  };
  return {
    props,
    ...render(
      <MemoryRouter>
        <MobileDrawer {...props} />
      </MemoryRouter>
    ),
  };
}

describe("MobileDrawer", () => {
  it("renders nothing when closed", () => {
    render(
      <MemoryRouter>
        <MobileDrawer
          isOpen={false}
          onClose={() => {}}
          user={{ display_name: "X", email: "x", isAdmin: false, role: "viewer" as const }}
          onSignOut={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText("Family Health")).not.toBeInTheDocument();
  });

  it("renders the nav items and close button when open", () => {
    renderDrawer();
    expect(screen.getByText("Family Health")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close navigation/i })).toBeInTheDocument();
  });

  it("focuses the first focusable element when opened", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: /close navigation/i })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { props } = renderDrawer();
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderDrawer();
    await user.click(screen.getByTestId("drawer-backdrop"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the previously focused element when closed", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "hamburger";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { rerender, props } = renderDrawer();
    expect(trigger).not.toHaveFocus();

    rerender(
      <MemoryRouter>
        <MobileDrawer {...props} isOpen={false} />
      </MemoryRouter>
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
