import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Appearance } from "./Appearance";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ textSize: "normal", density: "comfortable", statusLanguage: "plain" }),
    patch: vi.fn().mockResolvedValue({}),
  },
}));

function wrap(ui: React.ReactElement) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={c}>{ui}</QueryClientProvider>;
}

describe("Appearance", () => {
  it("renders text size and status language toggle groups", async () => {
    render(wrap(<Appearance />));
    expect(await screen.findByRole("radiogroup", { name: /text size/i })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /density/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /^language$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /status language/i })).toBeInTheDocument();
  });

  it("renders language row as disabled (not interactive)", async () => {
    render(wrap(<Appearance />));
    expect(await screen.findByText("English is the current language.")).toBeInTheDocument();
  });

  it("renders density row as disabled (not interactive)", async () => {
    render(wrap(<Appearance />));
    expect(await screen.findByText("Comfortable is the current density.")).toBeInTheDocument();
    expect(screen.getByText("Comfortable", { selector: "span" })).toBeInTheDocument();
  });

  it("renders theme row with current theme name", async () => {
    render(wrap(<Appearance />));
    expect(await screen.findByText("Family Health is the current theme.")).toBeInTheDocument();
    expect(screen.getByText("Family Health", { selector: "span" })).toBeInTheDocument();
  });

  it("sets html[data-size] when text size changes", async () => {
    const user = userEvent.setup();
    render(wrap(<Appearance />));
    await user.click(await screen.findByRole("radio", { name: /xl/i }));
    expect(document.documentElement.dataset.size).toBe("xl");
  });

  it("page title uses Inter semibold, not Instrument Serif", async () => {
    const { container } = render(wrap(<Appearance />));
    await screen.findByRole("radiogroup", { name: /text size/i });
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.className).not.toContain("font-serif");
    expect(h2!.className).not.toContain("font-display");
    expect(h2!.className).toContain("font-semibold");
  });
});
