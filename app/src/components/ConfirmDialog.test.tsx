import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

const baseProps = {
  open: true,
  title: "Are you sure?",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmDialog", () => {
  it("contains no legacy gray, blue, or red Tailwind tokens in rendered output", () => {
    const { container } = render(<ConfirmDialog {...baseProps} />);
    expect(container.innerHTML).not.toMatch(/(bg|text|border|ring)-(gray|blue|red)-/);
  });

  it("contains no legacy gray, blue, or red tokens when destructive=true", () => {
    const { container } = render(<ConfirmDialog {...baseProps} destructive />);
    expect(container.innerHTML).not.toMatch(/(bg|text|border|ring)-(gray|blue|red)-/);
  });
});
