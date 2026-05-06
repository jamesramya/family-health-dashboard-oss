import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Spark } from "./Spark";

describe("Spark", () => {
  it("renders an SVG when given values", () => {
    const { container } = render(<Spark values={[1, 2, 3, 4]} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders nothing when values is empty", () => {
    const { container } = render(<Spark values={[]} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders a reference band rect when low and high are provided", () => {
    const { container } = render(<Spark values={[1, 2, 3]} low={1.5} high={2.5} />);
    expect(container.querySelector("rect")).toBeInTheDocument();
  });

  it("renders no rect when low/high are absent", () => {
    const { container } = render(<Spark values={[1, 2, 3]} />);
    expect(container.querySelector("rect")).not.toBeInTheDocument();
  });

  it("renders a path for the line and a circle for the last point", () => {
    const { container } = render(<Spark values={[1, 2, 3]} />);
    expect(container.querySelector("path")).toBeInTheDocument();
    expect(container.querySelector("circle")).toBeInTheDocument();
  });
});
