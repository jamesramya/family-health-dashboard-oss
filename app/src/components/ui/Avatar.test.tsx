import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("renders initials", () => {
    render(<Avatar initials="JD" tone="#ff0000" />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("has aria-hidden", () => {
    const { container } = render(<Avatar initials="JD" tone="#ff0000" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden");
  });

  it("applies tone as background", () => {
    const { container } = render(<Avatar initials="JD" tone="linear-gradient(#abc, #def)" />);
    expect((container.firstChild as HTMLElement).style.background).toContain("linear-gradient");
  });

  it("applies ring box-shadow when ring=true", () => {
    const { container } = render(<Avatar initials="JD" tone="#abc" ring />);
    const style = (container.firstChild as HTMLElement).style.boxShadow;
    expect(style).toContain("0 0 0 3px #fdfbf5");
  });

  it("box-shadow is none by default", () => {
    const { container } = render(<Avatar initials="JD" tone="#abc" />);
    expect((container.firstChild as HTMLElement).style.boxShadow).toBe("none");
  });

  it("applies size as width", () => {
    const { container } = render(<Avatar initials="JD" tone="#abc" size={60} />);
    expect((container.firstChild as HTMLElement).style.width).toBe("60px");
  });
});
