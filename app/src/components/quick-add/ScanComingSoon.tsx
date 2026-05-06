export function ScanComingSoon({
  onSwitchToDocument,
}: {
  onSwitchToDocument: () => void;
}) {
  return (
    <div className="py-8 text-center space-y-4">
      <p className="text-sm text-ink-muted">Scan upload is coming soon.</p>
      <p className="text-xs text-ink-faint">
        For now, you can upload your scan report as a document.
      </p>
      <button
        type="button"
        onClick={onSwitchToDocument}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cream-300 text-sm font-medium text-ink hover:bg-cream-100"
      >
        Upload as document instead
      </button>
    </div>
  );
}
