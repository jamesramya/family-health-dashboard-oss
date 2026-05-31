import { AlertTriangle } from "lucide-react";

interface PhiNoticeProps {
  message?: string;
}

const DEFAULT_MESSAGE =
  "While tokens are active, your family's health data is shared with external AI services when they call this app. Review the access log below to see what has been read or written.";

export function PhiNotice({ message = DEFAULT_MESSAGE }: PhiNoticeProps) {
  return (
    <div
      role="status"
      aria-label="PHI sharing disclosure"
      className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800"
    >
      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
