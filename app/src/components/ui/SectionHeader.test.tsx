import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders title", () => {
    render(<SectionHeader title="My Title" />);
    expect(screen.getByRole("heading", { name: "My Title" })).toBeInTheDocument();
  });

  it("omits eyebrow when not provided", () => {
    const { container } = render(<SectionHeader title="T" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("renders eyebrow when provided", () => {
    render(<SectionHeader title="T" eyebrow="Section" />);
    expect(screen.getByText("Section")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<SectionHeader title="T" subtitle="Sub text" />);
    expect(screen.getByText("Sub text")).toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(<SectionHeader title="T" action={<button>Action</button>} />);
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });
});
