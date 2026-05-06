import { describe, it, expect, beforeEach } from "vitest";
import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFocusTrap } from "./useFocusTrap";

function Harness({ active, onClose }: { active: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active, onClose);
  return (
    <>
      <button>outside-before</button>
      <div ref={ref} data-testid="trap">
        <button>first</button>
        <button>middle</button>
        <button>last</button>
      </div>
      <button>outside-after</button>
    </>
  );
}

describe("useFocusTrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the first focusable element on activation", () => {
    render(<Harness active onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("cycles Tab from the last element back to the first", async () => {
    const user = userEvent.setup();
    render(<Harness active onClose={() => {}} />);
    screen.getByRole("button", { name: "last" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("cycles Shift+Tab from the first element back to the last", async () => {
    const user = userEvent.setup();
    render(<Harness active onClose={() => {}} />);
    screen.getByRole("button", { name: "first" }).focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "last" })).toHaveFocus();
  });

  it("invokes onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    let closed = false;
    render(<Harness active onClose={() => { closed = true; }} />);
    await user.keyboard("{Escape}");
    expect(closed).toBe(true);
  });

  it("does nothing when inactive", async () => {
    const user = userEvent.setup();
    render(<Harness active={false} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "first" })).not.toHaveFocus();
    await user.keyboard("{Escape}");
  });
});
