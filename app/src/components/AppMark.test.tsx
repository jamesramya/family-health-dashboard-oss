import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AppMark, getPresetByName } from "./AppMark";

function renderAppMark(clientName: string) {
  const preset = getPresetByName(clientName);
  const { container } = render(<AppMark preset={preset} size={56} />);
  return container;
}

describe("AppMark", () => {
  it("renders an SVG element (not initials) for Claude Desktop", () => {
    const container = renderAppMark("Claude Desktop");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders an SVG element (not initials) for Cursor", () => {
    const container = renderAppMark("Cursor");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders an SVG element (not initials) for Zed", () => {
    const container = renderAppMark("Zed");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders an SVG element (not initials) for Cline", () => {
    const container = renderAppMark("Cline");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders an SVG element (not initials) for ChatGPT", () => {
    const container = renderAppMark("ChatGPT");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("span")).toBeNull();
  });

  it("renders a span with initial letter for unknown client", () => {
    const container = renderAppMark("Some Unknown App XYZ");
    expect(container.querySelector("span")).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("Zed tile background is the real Zed brand blue #084CCF", () => {
    const container = renderAppMark("Zed");
    const tile = container.firstElementChild as HTMLElement;
    // JSDOM converts hex to rgb(8, 76, 207); match either form case-insensitively
    const style = tile.getAttribute("style") ?? "";
    expect(style.toLowerCase()).toMatch(/084ccf|rgb\(\s*8\s*,\s*76\s*,\s*207\s*\)/);
  });
});
