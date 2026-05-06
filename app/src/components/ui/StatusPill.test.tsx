import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreferencesProvider } from "../../contexts/PreferencesContext";
import { StatusPill, PersonStatusPill } from "./StatusPill";

function renderWithPrefs(ui: React.ReactElement) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

describe("StatusPill", () => {
  beforeEach(() => localStorage.clear());

  it("shows plain-English label by default (statusLanguage=plain)", () => {
    renderWithPrefs(<StatusPill status="in-range" />);
    expect(screen.getByText("In range")).toBeInTheDocument();
  });

  it("shows medical label when statusLanguage pref is 'medical'", () => {
    localStorage.setItem("fh-prefs", JSON.stringify({ statusLanguage: "medical" }));
    renderWithPrefs(<StatusPill status="in-range" />);
    expect(screen.getByText("Normal")).toBeInTheDocument();
  });

  it("renders the colored dot", () => {
    const { container } = renderWithPrefs(<StatusPill status="above" />);
    const dot = container.querySelector("[aria-hidden]");
    expect(dot).toBeInTheDocument();
  });

  it("renders 'above' with rose tone title", () => {
    const { container } = renderWithPrefs(<StatusPill status="above" />);
    const span = container.querySelector("span");
    expect(span?.title).toContain("High");
  });

  it("renders 'nodata' pill", () => {
    renderWithPrefs(<StatusPill status="nodata" />);
    expect(screen.getByText("No reading")).toBeInTheDocument();
  });
});

describe("PersonStatusPill", () => {
  beforeEach(() => localStorage.clear());

  it("renders 'well' status in plain English", () => {
    renderWithPrefs(<PersonStatusPill status="well" />);
    expect(screen.getByText("Doing well")).toBeInTheDocument();
  });

  it("renders 'attention' in medical wording when pref is set", () => {
    localStorage.setItem("fh-prefs", JSON.stringify({ statusLanguage: "medical" }));
    renderWithPrefs(<PersonStatusPill status="attention" />);
    expect(screen.getByText("Attention")).toBeInTheDocument();
  });
});
