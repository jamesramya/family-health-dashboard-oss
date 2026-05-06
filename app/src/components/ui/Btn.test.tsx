import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Btn } from "./Btn";

describe("Btn", () => {
  it("renders as a button with children", () => {
    render(<Btn>Save</Btn>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Btn onClick={onClick}>Click me</Btn>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is set", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Btn disabled onClick={onClick}>Save</Btn>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders with aria-label when provided", () => {
    render(<Btn aria-label="Close dialog" />);
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeInTheDocument();
  });

  it("applies the correct min-height class for each size", () => {
    const { rerender } = render(<Btn size="sm">x</Btn>);
    expect(screen.getByRole("button").className).toMatch(/min-h-\[36px\]/);

    rerender(<Btn size="md">x</Btn>);
    expect(screen.getByRole("button").className).toMatch(/min-h-\[44px\]/);

    rerender(<Btn size="lg">x</Btn>);
    expect(screen.getByRole("button").className).toMatch(/min-h-\[48px\]/);
  });

  it("renders icon slot alongside children", () => {
    render(<Btn icon={<span data-testid="icon" />}>Label</Btn>);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Label")).toBeInTheDocument();
  });
});
