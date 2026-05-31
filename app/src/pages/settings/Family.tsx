import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { usePatients, useCreatePatient, useUpdatePatient, usePurgePatientData } from "@/hooks/use-admin";
import { Btn, Card } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { formatMonthYear } from "@/lib/format";
import type { Patient } from "@/types/api";

interface PatientFormData {
  name: string;
  date_of_birth: string;
  gender: string;
  blood_type: string;
  allergies: string;
}

// Derive a stable avatar tone from the patient's name.
const AVATAR_TONES = ["#2f6b5f", "#b9854b", "#7a5a8f", "#c9942b", "#4a7a9b", "#8f5a5a"];
function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

function ageFromDob(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return age;
}

function PersonFormPanel({
  existing,
  onSuccess,
  onCancel,
}: {
  existing?: Patient;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient(existing?.id ?? "");
  const purge = usePurgePatientData();
  const { register, handleSubmit, formState: { errors } } = useForm<PatientFormData>({
    defaultValues: existing
      ? {
          name: existing.name,
          date_of_birth: existing.date_of_birth,
          gender: existing.gender ?? "",
          blood_type: existing.blood_type ?? "",
          allergies: (existing.allergies ?? []).join(", "),
        }
      : {},
  });

  function onSubmit(data: PatientFormData) {
    const payload = {
      name: data.name,
      date_of_birth: data.date_of_birth,
      gender: data.gender || undefined,
      blood_type: data.blood_type || undefined,
      allergies: data.allergies
        ? data.allergies.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    };
    if (existing) {
      updatePatient.mutate(payload, { onSuccess });
    } else {
      createPatient.mutate(payload, { onSuccess });
    }
  }

  const isPending = createPatient.isPending || updatePatient.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Full Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            {...register("name", { required: true })}
            className={`w-full border rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-teal-500 ${errors.name ? "border-rose-400" : "border-cream-300"}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Date of Birth <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            {...register("date_of_birth", { required: true })}
            className={`w-full border rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-teal-500 ${errors.date_of_birth ? "border-rose-400" : "border-cream-300"}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">Gender</label>
          <select
            {...register("gender")}
            className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink bg-cream-50"
          >
            <option value="">Not specified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">Blood Type</label>
          <select
            {...register("blood_type")}
            className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink bg-cream-50"
          >
            <option value="">Unknown</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Allergies (comma-separated)
          </label>
          <input
            type="text"
            {...register("allergies")}
            placeholder="e.g. Penicillin, Aspirin"
            className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-teal-500"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex gap-2">
          <Btn type="submit" disabled={isPending}>
            {isPending ? "Saving…" : existing ? "Update" : "Add Person"}
          </Btn>
          <Btn type="button" variant="secondary" onClick={onCancel}>Cancel</Btn>
        </div>
        {existing && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`PERMANENTLY purge all data for "${existing.name}"? This cannot be undone.`)) {
                purge.mutate(existing.id, { onSuccess });
              }
            }}
            disabled={purge.isPending}
            className="text-xs text-rose-500 hover:text-rose-600 disabled:opacity-50"
          >
            {purge.isPending ? "Purging…" : "Purge all data"}
          </button>
        )}
      </div>
    </form>
  );
}

export function Family() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [isAddOpen, setIsAddOpen] = useState(params.get("action") === "add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data, isLoading } = usePatients();

  useEffect(() => {
    if (params.get("action") === "add") {
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.delete("action");
        return n;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user?.role !== "admin") return null;

  const patients = data?.patients ?? [];

  return (
    <Card padded={false}>
      <div className="p-6 border-b border-cream-200 flex justify-between items-center">
        <div>
          <h3 className="font-sans font-semibold text-lg text-ink">Family members</h3>
          <p className="text-sm text-ink-muted mt-0.5">
            {patients.length} {patients.length === 1 ? "person" : "people"} · you are admin
          </p>
        </div>
        <Btn
          size="sm"
          variant="primary"
          onClick={() => {
            setIsAddOpen((s) => !s);
            setEditingId(null);
          }}
        >
          {isAddOpen ? "Cancel" : "Add person"}
        </Btn>
      </div>

      {isAddOpen && (
        <div className="p-6 border-b border-cream-200 bg-teal-50">
          <h4 className="text-sm font-medium text-teal-800 mb-3">New person</h4>
          <PersonFormPanel onSuccess={() => setIsAddOpen(false)} onCancel={() => setIsAddOpen(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      ) : patients.length === 0 ? (
        <p className="text-sm text-ink-muted p-6">No family members added yet.</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {patients.map((patient) => (
            <li key={patient.id} className="px-6 py-4">
              <div className="flex items-center gap-4">
                <Avatar
                  initials={initialsOf(patient.name)}
                  tone={avatarTone(patient.name)}
                  size={44}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink">{patient.name}</p>
                  <p className="text-xs text-ink-muted">
                    Age {ageFromDob(patient.date_of_birth)} · Added {formatMonthYear(patient.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingId(editingId === patient.id ? null : patient.id);
                    setIsAddOpen(false);
                  }}
                  className="text-sm text-teal-600 hover:underline flex-shrink-0"
                >
                  Edit
                </button>
              </div>

              {editingId === patient.id && (
                <div className="mt-3 pt-3 border-t border-cream-200">
                  <PersonFormPanel
                    existing={patient}
                    onSuccess={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
