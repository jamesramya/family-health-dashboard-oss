import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";

interface Candidate {
  id: string;
  canonical_key: string;
  canonical_name: string;
  label: string;
  unit: string;
}

interface ReviewItem {
  id: string;
  canonical_key: string;
  canonical_name: string;
  label: string;
  unit: string;
  category: string;
  ref_low: number | null;
  ref_high: number | null;
  aliases: string;
  created_at: string;
  candidates: Candidate[];
}

interface ReviewResponse {
  items: ReviewItem[];
}

function useTestReviewQueue() {
  return useQuery({
    queryKey: ["admin", "test-review"],
    queryFn: () => api.get<ReviewResponse>("/admin/test-review"),
  });
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const queryClient = useQueryClient();
  const [mergeTarget, setMergeTarget] = useState("");
  const [editName, setEditName] = useState(item.canonical_name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mergeMut = useMutation({
    mutationFn: (targetTestDefId: string) =>
      api.post(`/admin/test-review/${item.id}/merge`, { targetTestDefId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "test-review"] }),
  });

  const confirmMut = useMutation({
    mutationFn: (canonicalName?: string) =>
      api.post(`/admin/test-review/${item.id}/confirm`, { canonicalName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "test-review"] }),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      api.post(`/admin/test-review/${item.id}/delete`, { confirm: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "test-review"] }),
  });

  const isPending = mergeMut.isPending || confirmMut.isPending || deleteMut.isPending;
  const aliases: string[] = JSON.parse(item.aliases || "[]");

  return (
    <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink">{item.canonical_name}</p>
          <p className="text-xs text-ink-muted">
            {item.category} · {item.unit || "no unit"} · ref: {item.ref_low ?? "?"}&ndash;{item.ref_high ?? "?"}
          </p>
          {aliases.length > 0 && (
            <p className="text-xs text-ink-faint mt-0.5">
              aliases: {aliases.join(", ")}
            </p>
          )}
        </div>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full whitespace-nowrap">
          needs review
        </span>
      </div>

      {/* Merge */}
      {item.candidates.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            className="flex-1 text-sm border border-cream-300 rounded-xl px-2 py-1.5 text-ink bg-cream-50"
            disabled={isPending}
          >
            <option value="">Merge into...</option>
            {item.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.canonical_name} ({c.unit})
              </option>
            ))}
          </select>
          <button
            onClick={() => mergeTarget && mergeMut.mutate(mergeTarget)}
            disabled={!mergeTarget || isPending}
            className="px-3 py-1.5 bg-teal-500 text-cream-50 text-xs font-medium rounded-xl disabled:opacity-50"
          >
            Merge
          </button>
        </div>
      )}

      {/* Confirm as new */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="flex-1 text-sm border border-cream-300 rounded-xl px-2 py-1.5 text-ink bg-cream-50 outline-none focus:border-teal-500"
          disabled={isPending}
        />
        <button
          onClick={() => confirmMut.mutate(editName !== item.canonical_name ? editName : undefined)}
          disabled={isPending}
          className="px-3 py-1.5 bg-sage-500 text-cream-50 text-xs font-medium rounded-xl disabled:opacity-50"
        >
          Keep as New
        </button>
      </div>

      {/* Delete */}
      <div className="flex items-center gap-2">
        {confirmDelete ? (
          <>
            <span className="text-xs text-rose-600">Are you sure?</span>
            <button
              onClick={() => deleteMut.mutate()}
              disabled={isPending}
              className="px-3 py-1.5 bg-rose-500 text-cream-50 text-xs font-medium rounded-xl disabled:opacity-50"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="text-xs text-rose-500 hover:text-rose-600"
          >
            Delete test + readings
          </button>
        )}
      </div>

      {(mergeMut.error || confirmMut.error || deleteMut.error) && (
        <p className="text-xs text-rose-600">
          Error: {(mergeMut.error ?? confirmMut.error ?? deleteMut.error)?.message}
        </p>
      )}
    </div>
  );
}

export function TestReviewQueue() {
  const { data, isLoading, error } = useTestReviewQueue();
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-500">Failed to load review queue: {error.message}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-ink-muted">No test definitions need review.</p>
        <p className="text-xs text-ink-faint mt-1">
          Items appear here when the LLM disambiguation fails during extraction.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        {items.length} test definition{items.length !== 1 ? "s" : ""} need review.
        For each, you can merge into an existing test, keep as a new definition, or delete.
      </p>
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} />
      ))}
    </div>
  );
}
