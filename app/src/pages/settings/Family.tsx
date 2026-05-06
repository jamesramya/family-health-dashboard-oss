import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { usePatients, useCreatePatient, useUpdatePatient, usePurgePatientData } from "@/hooks/use-admin";
import { Btn, Card } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/format";
import type { Patient } from "@/types/api";

interface PatientFormData {
  name: string;
  date_of_birth: string;
  gender: string;
  blood_type: string;
  allergies: string;
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
      <div className="flex gap-2">
        <Btn type="submit" disabled={isPending}>
          {isPending ? "Saving…" : existing ? "Update Person" : "Add Person"}
        </Btn>
        <Btn type="button" variant="secondary" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

export function Family() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [isAddOpen, setIsAddOpen] = useState(params.get("action") === "add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data, isLoading } = usePatients();
  const purge = usePurgePatientData();

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
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-ink">Family members</h3>
          <p className="text-sm text-ink-muted">
            {patients.length} {patients.length === 1 ? "person" : "people"} · you are admin
          </p>
        </div>
        <Btn size="sm" onClick={() => setIsAddOpen((s) => !s)}>
          {isAddOpen ? "Cancel" : "Add person"}
        </Btn>
      </div>

      {isAddOpen && (
        <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
          <h4 className="text-sm font-medium text-teal-800 mb-3">New person</h4>
          <PersonFormPanel onSuccess={() => setIsAddOpen(false)} onCancel={() => setIsAddOpen(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      ) : patients.length === 0 ? (
        <p className="text-sm text-ink-muted">No family members added yet.</p>
      ) : (
        <div className="space-y-2">
          {patients.map((patient) => (
            <div key={patient.id} className="bg-cream-50 rounded-2xl border border-cream-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar initials={initialsOf(patient.name)} tone="#2f6b5f" size={44} />
                  <div>
                    <p className="font-medium text-ink">{patient.name}</p>
                    <p className="text-sm text-ink-muted">
                      DOB: {formatDate(patient.date_of_birth)}
                      {patient.blood_type && ` · ${patient.blood_type}`}
                      {patient.gender && ` · ${patient.gender}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingId(editingId === patient.id ? null : patient.id)}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`PERMANENTLY purge all data for "${patient.name}"? This cannot be undone.`)) {
                        purge.mutate(patient.id);
                      }
                    }}
                    disabled={purge.isPending}
                    className="text-xs text-rose-500 hover:text-rose-600"
                  >
                    Purge Data
                  </button>
                </div>
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
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
