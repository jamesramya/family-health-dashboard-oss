import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub TestReviewQueue — the real component requires react-query and API calls.
// The test asserts that DocumentReview renders TestReviewQueue at all.
vi.mock("@/components/TestReviewQueue", () => ({
  TestReviewQueue: () => <div data-testid="test-review-queue" />,
}));

let mockRole = "admin";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: mockRole },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

// Red now: DocumentReview.tsx doesn't exist yet — the import fails entirely.
// Green after: app/src/pages/settings/DocumentReview.tsx is created and renders <TestReviewQueue />.
const { DocumentReview } = await import("./DocumentReview");

describe("DocumentReview", () => {
  it("renders the section heading", () => {
    mockRole = "admin";
    render(<DocumentReview />);
    expect(screen.getByRole("heading", { name: /document review/i })).toBeInTheDocument();
  });

  it("renders TestReviewQueue for admin", () => {
    mockRole = "admin";
    render(<DocumentReview />);
    expect(screen.getByTestId("test-review-queue")).toBeInTheDocument();
  });

  it("renders nothing for non-admin", () => {
    mockRole = "viewer";
    const { container } = render(<DocumentReview />);
    expect(container.firstChild).toBeNull();
  });
});
