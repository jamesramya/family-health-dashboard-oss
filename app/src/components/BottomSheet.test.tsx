import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "./BottomSheet";

afterEach(() => {
  document.body.style.overflow = "";
});

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomSheet isOpen={false} onClose={() => {}}>
        <p>sheet content</p>
      </BottomSheet>
    );
    expect(screen.queryByText("sheet content")).not.toBeInTheDocument();
  });

  it("renders children, backdrop, and drag handle when open", () => {
    render(
      <BottomSheet isOpen onClose={() => {}}>
        <p>sheet content</p>
      </BottomSheet>
    );
    expect(screen.getByText("sheet content")).toBeInTheDocument();
    expect(screen.getByTestId("bottomsheet-backdrop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /drag to dismiss/i })).toBeInTheDocument();
  });

  it("invokes onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose}>
        <p>x</p>
      </BottomSheet>
    );
    await user.click(screen.getByTestId("bottomsheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen onClose={onClose}>
        <button>focusable</button>
      </BottomSheet>
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and restores on close", () => {
    const { rerender } = render(
      <BottomSheet isOpen onClose={() => {}}>
        <p>x</p>
      </BottomSheet>
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <BottomSheet isOpen={false} onClose={() => {}}>
        <p>x</p>
      </BottomSheet>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("applies the height percentage via inline style (default 88)", () => {
    render(
      <BottomSheet isOpen onClose={() => {}} heightPercent={75}>
        <p>x</p>
      </BottomSheet>
    );
    const panel = screen.getByRole("dialog");
    expect(panel.getAttribute("style")).toContain("75");
  });

  it("renders the footer slot inside a safe-area-aware container", () => {
    render(
      <BottomSheet isOpen onClose={() => {}} footer={<button>Save</button>}>
        <p>body</p>
      </BottomSheet>
    );
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn.parentElement?.className).toMatch(/safe-area-inset-bottom/);
  });

  it("sheet title uses Inter semibold, not Instrument Serif", () => {
    const { container } = render(<BottomSheet title="Test Title" isOpen onClose={() => {}}>{null}</BottomSheet>);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });
});
