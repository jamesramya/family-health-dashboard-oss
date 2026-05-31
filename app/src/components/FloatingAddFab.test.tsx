import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingAddFab } from "./FloatingAddFab";

describe("FloatingAddFab", () => {
  it("renders a single trigger button 'Add' when closed", () => {
    render(<FloatingAddFab onAction={() => {}} />);
    expect(screen.getByRole("button", { name: /quick add/i })).toBeInTheDocument();
    // Pills are in DOM but aria-hidden and not interactive when closed
    const logVitalBtn = screen.getByText("Log Vital").closest("button");
    expect(logVitalBtn).toHaveAttribute("aria-hidden", "true");
  });

  it("no fan pills are keyboard-reachable when closed", () => {
    render(<FloatingAddFab onAction={() => {}} />);
    const pills = screen.getAllByRole("button").filter(
      (b) => b !== screen.getByRole("button", { name: /quick add/i })
    );
    pills.forEach((pill) => {
      expect(pill.getAttribute("tabindex")).toBe("-1");
    });
  });

  it("clicking trigger opens the fan (aria-expanded becomes true)", async () => {
    const user = userEvent.setup();
    render(<FloatingAddFab onAction={() => {}} />);
    const trigger = screen.getByRole("button", { name: /quick add/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("all 6 pill labels are visible when open", async () => {
    const user = userEvent.setup();
    render(<FloatingAddFab onAction={() => {}} />);
    await user.click(screen.getByRole("button", { name: /quick add/i }));
    expect(screen.getByText("Log Vital")).toBeInTheDocument();
    expect(screen.getByText("Add Medication")).toBeInTheDocument();
    expect(screen.getByText("Upload Lab")).toBeInTheDocument();
    expect(screen.getByText("Add Note")).toBeInTheDocument();
    expect(screen.getByText("Add Scan")).toBeInTheDocument();
    expect(screen.getByText("Upload Documents")).toBeInTheDocument();
  });

  it("clicking 'Log Vital' pill calls onAction('vital') and closes the fan", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<FloatingAddFab onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /quick add/i }));
    await user.click(screen.getByText("Log Vital").closest("button")!);
    expect(onAction).toHaveBeenCalledWith("vital");
    expect(screen.getByRole("button", { name: /quick add/i }).getAttribute("aria-expanded")).toBe("false");
  });

  it("ESC key closes the fan", async () => {
    const user = userEvent.setup();
    render(<FloatingAddFab onAction={() => {}} />);
    await user.click(screen.getByRole("button", { name: /quick add/i }));
    expect(screen.getByRole("button", { name: /quick add/i }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /quick add/i }).getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking the backdrop closes the fan", async () => {
    const user = userEvent.setup();
    render(<FloatingAddFab onAction={() => {}} />);
    await user.click(screen.getByRole("button", { name: /quick add/i }));
    expect(screen.getByTestId("fab-backdrop")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("fab-backdrop"));
    expect(screen.getByRole("button", { name: /quick add/i }).getAttribute("aria-expanded")).toBe("false");
  });

  it("dispatching fh:quickadd-action event calls onAction with the detail", () => {
    const onAction = vi.fn();
    render(<FloatingAddFab onAction={onAction} />);
    window.dispatchEvent(new CustomEvent("fh:quickadd-action", { detail: "lab" }));
    expect(onAction).toHaveBeenCalledWith("lab");
  });
});
