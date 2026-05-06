import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider, useConfirm } from "./use-confirm";

function Harness({ onResult }: { onResult: (r: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => onResult(await confirm({ title: "Delete?", confirmLabel: "Delete" }))}
    >
      trigger
    </button>
  );
}

describe("useConfirm", () => {
  it("resolves true when confirm button clicked", async () => {
    const user = userEvent.setup();
    let result: boolean | null = null;
    render(
      <ConfirmProvider>
        <Harness onResult={(r) => { result = r; }} />
      </ConfirmProvider>
    );
    await user.click(screen.getByText("trigger"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(result).toBe(true);
  });

  it("resolves false when cancel clicked", async () => {
    const user = userEvent.setup();
    let result: boolean | null = null;
    render(
      <ConfirmProvider>
        <Harness onResult={(r) => { result = r; }} />
      </ConfirmProvider>
    );
    await user.click(screen.getByText("trigger"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(result).toBe(false);
  });

  it("auto-cancels a prior pending confirm when a new one is started", async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    function MultiHarness() {
      const confirm = useConfirm();
      return (
        <button
          onClick={async () => {
            const p1 = confirm({ title: "First", confirmLabel: "Delete" });
            const p2 = confirm({ title: "Second", confirmLabel: "Delete" });
            results.push(await p1, await p2);
          }}
        >
          trigger
        </button>
      );
    }
    render(<ConfirmProvider><MultiHarness /></ConfirmProvider>);
    await user.click(screen.getByText("trigger"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(results).toEqual([false, true]);
  });
});
