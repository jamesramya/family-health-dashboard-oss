import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/lib/auth-context";
import { usePatients, useCreatePatient, useUpdatePatient, usePurgePatientData, useRotateApiKey } from "@/hooks/use-admin";
import { UserManagement } from "@/components/UserManagement";
import { TestReviewQueue } from "@/components/TestReviewQueue";
import { Btn } from "@/components/ui";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/format";
import type { Patient } from "@/types/api";

interface PatientFormData {
  name: string;
  date_of_birth: string;
  gender: string;
  blood_type: string;
  allergies: string; // comma-separated
}

function PatientFormPanel({
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
          {isPending ? "Saving…" : existing ? "Update Patient" : "Add Patient"}
        </Btn>
        <Btn type="button" variant="secondary" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

function PatientManagement() {
  const { data, isLoading } = usePatients();
  const purge = usePurgePatientData();
  const patients = data?.patients ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-ink">Patients</h2>
        <Btn size="sm" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "Cancel" : "+ Add Patient"}
        </Btn>
      </div>

      {showAdd && (
        <div className="mb-4 bg-teal-50 border border-teal-100 rounded-xl p-4">
          <h3 className="text-sm font-medium text-teal-800 mb-3">New Patient</h3>
          <PatientFormPanel onSuccess={() => setShowAdd(false)} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      ) : patients.length === 0 ? (
        <p className="text-sm text-ink-muted">No patients registered.</p>
      ) : (
        <div className="space-y-2">
          {patients.map((patient) => (
            <div key={patient.id} className="bg-cream-50 rounded-2xl border border-cream-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{patient.name}</p>
                  <p className="text-sm text-ink-muted">
                    DOB: {formatDate(patient.date_of_birth)}
                    {patient.blood_type && ` · ${patient.blood_type}`}
                    {patient.gender && ` · ${patient.gender}`}
                  </p>
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
                  <PatientFormPanel
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
    </div>
  );
}

function ApiKeySection() {
  const rotateKey = useRotateApiKey();
  const [newKey, setNewKey] = useState<string | null>(null);

  function handleRotate() {
    if (!confirm("Rotate the API key? The old key will stop working immediately.")) return;
    rotateKey.mutate(undefined, {
      onSuccess: (data) => setNewKey(data.api_key),
    });
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-ink mb-4">API Key</h2>
      <p className="text-sm text-ink-soft mb-3">
        Rotate the API key used by the extraction worker. The old key is immediately invalidated.
      </p>
      {newKey && (
        <div className="mb-3 bg-sage-50 border border-sage-100 rounded-xl p-3">
          <p className="text-xs font-medium text-sage-700 mb-1">New API key (copy now — shown once):</p>
          <code className="text-xs font-mono text-ink break-all">{newKey}</code>
        </div>
      )}
      <Btn variant="secondary" onClick={handleRotate} disabled={rotateKey.isPending}>
        {rotateKey.isPending ? "Rotating…" : "Rotate API Key"}
      </Btn>
    </div>
  );
}

export function Admin({ initialTab }: { initialTab?: "users" | "patients" | "api" | "test-review" } = {}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "patients" | "api" | "test-review">(initialTab ?? "users");

  if (user?.role !== "admin") {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-muted">You do not have admin access.</p>
      </div>
    );
  }

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "patients", label: "Patients" },
    { key: "test-review", label: "Test Review" },
    { key: "api", label: "API Key" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Admin</p>
        <h1 className="font-semibold tracking-tight text-3xl text-ink mt-1">System</h1>
        <p className="text-sm text-ink-soft mt-0.5">Manage users, patients, and system settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-cream-100 rounded-xl p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.key
                ? "bg-cream-50 text-ink shadow-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-cream-50 rounded-2xl border border-cream-200 p-5">
        {activeTab === "users" && <UserManagement />}
        {activeTab === "patients" && <PatientManagement />}
        {activeTab === "test-review" && <TestReviewQueue />}
        {activeTab === "api" && <ApiKeySection />}
      </div>
    </div>
  );
}
