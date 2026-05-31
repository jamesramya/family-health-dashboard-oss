import { TestReviewQueue } from "@/components/TestReviewQueue";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useAuth } from "@/lib/auth-context";

export function DocumentReview() {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;
  return (
    <div className="space-y-4">
      <SectionHeader eyebrow="Admin" title="Document review" subtitle="Review and approve uploaded lab documents." />
      <TestReviewQueue />
    </div>
  );
}
