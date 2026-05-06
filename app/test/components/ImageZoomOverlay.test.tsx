import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageZoomOverlay } from "@/components/documents/ImageZoomOverlay";

describe("ImageZoomOverlay", () => {
  it("renders an image with the correct alt text", () => {
    render(<ImageZoomOverlay src="test.jpg" alt="Test document" />);
    expect(screen.getByRole("img", { name: "Test document" })).toBeInTheDocument();
  });

  it("clicking Zoom in increases scale to 1.25", () => {
    render(<ImageZoomOverlay src="test.jpg" alt="Test document" />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const img = screen.getByRole("img", { name: "Test document" });
    expect(img.style.transform).toContain("scale(1.25)");
  });

  it("clicking Zoom out after Zoom in returns scale to 1", () => {
    render(<ImageZoomOverlay src="test.jpg" alt="Test document" />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    const img = screen.getByRole("img", { name: "Test document" });
    expect(img.style.transform).toContain("scale(1)");
  });

  it("Zoom out button is disabled at floor (0.5)", () => {
    render(<ImageZoomOverlay src="test.jpg" alt="Test document" />);
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    fireEvent.click(zoomOut); // 0.75
    fireEvent.click(zoomOut); // 0.5 — now disabled
    expect(zoomOut).toBeDisabled();
  });

  it("Zoom in button is disabled at ceiling (4)", () => {
    render(<ImageZoomOverlay src="test.jpg" alt="Test document" />);
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    for (let i = 0; i < 12; i++) {
      fireEvent.click(zoomIn);
    }
    const img = screen.getByRole("img", { name: "Test document" });
    expect(img.style.transform).toContain("scale(4)");
    expect(zoomIn).toBeDisabled();
  });

  it("clicking Reset zoom restores scale(1) after multiple zooms", () => {
    render(<ImageZoomOverlay src="test.jpg" alt="Test document" />);
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    const img = screen.getByRole("img", { name: "Test document" });
    expect(img.style.transform).toContain("scale(1)");
  });
});
