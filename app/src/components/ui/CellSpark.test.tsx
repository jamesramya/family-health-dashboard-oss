import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CellSpark } from "./CellSpark";

describe("CellSpark", () => {
  it("renders an SVG when prev and curr are provided", () => {
    const { container } = render(<CellSpark prev={5} curr={6} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a placeholder div when prev is null", () => {
    const { container } = render(<CellSpark prev={null} curr={6} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(container.querySelector("div")).toBeInTheDocument();
  });

  it("renders a placeholder div when curr is null", () => {
    const { container } = render(<CellSpark prev={5} curr={null} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders reference band when low and high are provided", () => {
    const { container } = render(<CellSpark prev={5} curr={6} low={4} high={8} />);
    expect(container.querySelector("rect")).toBeInTheDocument();
  });

  it("renders a line and two circles", () => {
    const { container } = render(<CellSpark prev={5} curr={7} />);
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    expect(container.querySelector("line")).toBeInTheDocument();
  });
});
