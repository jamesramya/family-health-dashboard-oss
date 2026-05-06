import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("includes p-6 when padded (default)", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstChild).toHaveClass("p-6");
  });

  it("omits p-6 when padded=false", () => {
    const { container } = render(<Card padded={false}>x</Card>);
    expect(container.firstChild).not.toHaveClass("p-6");
  });

  it("merges custom className", () => {
    const { container } = render(<Card className="my-custom">x</Card>);
    expect(container.firstChild).toHaveClass("my-custom");
  });
});
