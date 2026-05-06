import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PersonStatusPill } from "@/components/ui/StatusPill";
import type { PersonStatus } from "@/lib/status";
import type { Patient } from "@/types/api";

interface FamilyStripProps {
  patients: Patient[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  statusFor: (p: Patient) => PersonStatus;
  canAddPerson?: boolean;
  onAddPerson?: () => void;
}

const TONES = ["#2f6b5f", "#6b9f58", "#c9942b", "#bc4a38", "#255449", "#547e45"];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

function calcAge(dob: string): number {
  const b = new Date(dob);
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}

export function FamilyStrip({
  patients,
  selectedId,
  onSelect,
  statusFor,
  canAddPerson = false,
  onAddPerson,
}: FamilyStripProps) {
  return (
    <div
      aria-label="Family members"
      className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5 pb-1 lg:mx-0 lg:px-0 fade-scroll-right"
    >
      {patients.map((p, i) => {
        const tone = TONES[i % TONES.length];
        const isSelected = p.id === selectedId;
        const status = statusFor(p);
        return (
          <button
            key={p.id}
            type="button"
            aria-current={isSelected ? "true" : "false"}
            onClick={() => onSelect(p.id)}
            className={`flex-shrink-0 flex items-center gap-3 rounded-2xl border px-3 py-2 min-h-[56px] bg-white/70 backdrop-blur transition-[box-shadow,border-color,background-color] duration-200 ease-out-strong active:scale-[0.98] ${
              isSelected
                ? "border-cream-300 shadow-card"
                : "border-cream-200 [@media(hover:hover)]:hover:border-cream-300"
            }`}
          >
            <Avatar initials={initialsOf(p.name)} tone={tone} size={40} ring={isSelected} />
            <span className="flex flex-col items-start gap-0.5 min-w-0">
              <span className="text-sm font-semibold text-ink truncate max-w-[9rem]">
                {p.name} <span className="text-ink-faint font-normal">· {calcAge(p.date_of_birth)}</span>
              </span>
              <PersonStatusPill status={status} />
            </span>
          </button>
        );
      })}
      {canAddPerson && (
        <button
          type="button"
          onClick={onAddPerson}
          className="flex-shrink-0 flex items-center gap-2 rounded-2xl border border-dashed border-cream-300 px-4 min-h-[56px] text-sm font-medium text-ink-muted [@media(hover:hover)]:hover:border-teal-500 [@media(hover:hover)]:hover:text-teal-600"
        >
          <Plus size={16} aria-hidden /> Add person
        </button>
      )}
    </div>
  );
}
