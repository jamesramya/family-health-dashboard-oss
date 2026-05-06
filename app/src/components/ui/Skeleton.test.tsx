import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders a div", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild?.nodeName).toBe("DIV");
  });

  it("has aria-hidden='true'", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("applies className prop", () => {
    const { container } = render(<Skeleton className="h-60" />);
    expect(container.firstChild).toHaveClass("h-60");
  });

  it("uses motion-safe:animate-pulse", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("motion-safe:animate-pulse");
  });

  it("includes bg-cream-200 and rounded-2xl base classes", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-cream-200");
    expect(el.className).toContain("rounded-2xl");
  });
});
