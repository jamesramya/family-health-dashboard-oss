import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Trend } from "./Trend";

describe("Trend", () => {
  it("renders em-dash when fewer than 2 readings", () => {
    render(<Trend readings={[5]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders em-dash when readings is empty", () => {
    render(<Trend readings={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders Minus icon (stable) when relative change < 2%", () => {
    render(<Trend readings={[100, 101]} />);
    expect(screen.getByLabelText("stable")).toBeInTheDocument();
  });

  it("renders rising indicator when value increases", () => {
    render(<Trend readings={[10, 15]} />);
    expect(screen.getByLabelText("rising")).toBeInTheDocument();
  });

  it("renders falling indicator when value decreases", () => {
    render(<Trend readings={[15, 10]} />);
    expect(screen.getByLabelText("falling")).toBeInTheDocument();
  });

  it("applies sage color class for rising when invert=false (default)", () => {
    const { container } = render(<Trend readings={[10, 15]} />);
    expect(container.querySelector(".text-sage-600")).toBeInTheDocument();
  });

  it("applies rose color class for falling when invert=false", () => {
    const { container } = render(<Trend readings={[15, 10]} />);
    expect(container.querySelector(".text-rose-500")).toBeInTheDocument();
  });

  it("applies rose color for rising when invert=true (higher is worse)", () => {
    const { container } = render(<Trend readings={[10, 15]} invert />);
    expect(container.querySelector(".text-rose-500")).toBeInTheDocument();
  });

  it("applies sage color for falling when invert=true (lower is better)", () => {
    const { container } = render(<Trend readings={[15, 10]} invert />);
    expect(container.querySelector(".text-sage-600")).toBeInTheDocument();
  });
});
