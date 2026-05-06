import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileTopBar } from "./MobileTopBar";

describe("MobileTopBar", () => {
  it("renders hamburger, wordmark, and search", () => {
    render(<MobileTopBar onOpenMenu={() => {}} onSearch={() => {}} />);
    expect(screen.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
    expect(screen.getByText("Family Health")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("invokes onOpenMenu when hamburger is clicked", async () => {
    const user = userEvent.setup();
    const onOpenMenu = vi.fn();
    render(<MobileTopBar onOpenMenu={onOpenMenu} onSearch={() => {}} />);
    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it("invokes onSearch when search icon is clicked", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<MobileTopBar onOpenMenu={() => {}} onSearch={onSearch} />);
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
