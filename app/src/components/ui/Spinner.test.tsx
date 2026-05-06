import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders a div with role='status'", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label='Loading'", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("defaults to lg size", () => {
    const { container } = render(<Spinner />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/w-8/);
    expect(el.className).toMatch(/h-8/);
    expect(el.className).toMatch(/border-4/);
  });

  it("applies sm size classes", () => {
    const { container } = render(<Spinner size="sm" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/w-4/);
    expect(el.className).toMatch(/h-4/);
    expect(el.className).toMatch(/border-2/);
  });

  it("applies md size classes", () => {
    const { container } = render(<Spinner size="md" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/w-6/);
    expect(el.className).toMatch(/h-6/);
    expect(el.className).toMatch(/border-2/);
  });

  it("applies lg size classes", () => {
    const { container } = render(<Spinner size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/w-8/);
    expect(el.className).toMatch(/h-8/);
    expect(el.className).toMatch(/border-4/);
  });

  it("uses motion-safe:animate-spin", () => {
    const { container } = render(<Spinner />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("motion-safe:animate-spin");
  });
});
