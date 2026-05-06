import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ConfirmDialog } from "@/components/ConfirmDialog";
// FloatingAddFab is a simple fan-out div; safe-area is handled by BottomSheet inside QuickAddModal.

describe("Safe area insets on fixed-bottom elements", () => {
  it("MobileBottomNav container has pb-safe or safe-area padding", () => {
    const { container } = render(
      <MemoryRouter>
        <MobileBottomNav />
      </MemoryRouter>
    );
    const nav = container.querySelector("nav");
    const hasSafeArea =
      nav?.className.includes("pb-safe") ||
      nav?.className.includes("pb-[env(safe-area-inset-bottom)]") ||
      nav?.getAttribute("style")?.includes("safe-area-inset-bottom");
    expect(hasSafeArea).toBe(true);
  });

  it("ConfirmDialog container has safe-area-inset-bottom padding", () => {
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="Delete?"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = container.querySelector("[role='alertdialog']");
    expect(dialog).not.toBeNull();
    const hasSafeArea =
      dialog?.className.includes("safe-area-inset-bottom") ||
      dialog?.className.includes("pb-safe") ||
      dialog?.className.includes("env(safe-area-inset-bottom)");
    expect(hasSafeArea).toBe(true);
  });
});
