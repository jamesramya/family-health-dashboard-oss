import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetUserPassword,
} from "@/hooks/use-admin";
import type { User } from "@/types/api";
import { Btn } from "@/components/ui/Btn";

interface CreateUserFormData {
  email: string;
  display_name: string;
  role: "admin" | "viewer";
  password: string;
}

interface EditUserFormData {
  display_name: string;
  role: "admin" | "viewer";
}

function AddUserForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const createUser = useCreateUser();
  const { register, handleSubmit, formState: { errors } } = useForm<CreateUserFormData>({
    defaultValues: { role: "viewer" },
  });

  function onSubmit(data: CreateUserFormData) {
    createUser.mutate(data, { onSuccess });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Email <span className="text-rose-500">*</span>
          </label>
          <input
            type="email"
            {...register("email", { required: true })}
            className={`w-full border rounded-xl px-3 py-2 text-sm ${errors.email ? "border-rose-400" : "border-cream-300"}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Display Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            {...register("display_name", { required: true })}
            className={`w-full border rounded-xl px-3 py-2 text-sm ${errors.display_name ? "border-rose-400" : "border-cream-300"}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">
            Temporary Password <span className="text-rose-500">*</span>
          </label>
          <input
            type="password"
            {...register("password", { required: true, minLength: 8 })}
            className={`w-full border rounded-xl px-3 py-2 text-sm ${errors.password ? "border-rose-400" : "border-cream-300"}`}
          />
          {errors.password?.type === "minLength" && (
            <p className="text-xs text-rose-500 mt-0.5">Min 8 characters</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1">Role</label>
          <select
            {...register("role")}
            className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm"
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {createUser.error && (
        <p className="text-sm text-rose-600">
          {createUser.error instanceof Error ? createUser.error.message : "Failed to create user."}
        </p>
      )}

      <div className="flex gap-2">
        <Btn type="submit" disabled={createUser.isPending}>
          {createUser.isPending ? "Creating..." : "Create User"}
        </Btn>
        <Btn type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
    </form>
  );
}

function EditUserForm({
  user,
  onSuccess,
  onCancel,
}: {
  user: User;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const updateUser = useUpdateUser(user.id);
  const { register, handleSubmit } = useForm<EditUserFormData>({
    defaultValues: { display_name: user.display_name, role: user.role },
  });

  function onSubmit(data: EditUserFormData) {
    updateUser.mutate(data, { onSuccess });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2 items-end flex-wrap">
      <div>
        <label className="block text-xs text-ink-soft mb-0.5">Display Name</label>
        <input
          type="text"
          {...register("display_name")}
          className="border border-cream-300 rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-ink-soft mb-0.5">Role</label>
        <select
          {...register("role")}
          className="border border-cream-300 rounded px-2 py-1 text-sm"
          disabled={!!user.is_super_admin}
        >
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={updateUser.isPending}
        className="px-3 py-1.5 bg-teal-500 text-cream-50 text-xs rounded hover:bg-teal-600 disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 border border-cream-300 text-ink-soft text-xs rounded hover:bg-cream-50"
      >
        Cancel
      </button>
    </form>
  );
}

function ResetPasswordForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [newPw, setNewPw] = useState("");
  const resetPw = useResetUserPassword(userId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) return;
    resetPw.mutate(newPw, { onSuccess: onClose });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end flex-wrap">
      <div>
        <label className="block text-xs text-ink-soft mb-0.5">New Password</label>
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          minLength={8}
          className="border border-cream-300 rounded px-2 py-1 text-sm"
          placeholder="Min 8 characters"
        />
      </div>
      <Btn type="submit" variant="danger" size="sm" disabled={resetPw.isPending || newPw.length < 8}>
        {resetPw.isPending ? "Saving..." : "Reset Password"}
      </Btn>
      <Btn type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
    </form>
  );
}

export function UserManagement() {
  const { data, isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const users = data?.users ?? [];

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetPwId, setResetPwId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-ink">Users</h2>
        <Btn size="sm" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "Cancel" : "+ Add User"}
        </Btn>
      </div>

      {showAdd && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-teal-900 mb-3">New User</h3>
          <AddUserForm onSuccess={() => setShowAdd(false)} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-faint">Loading users...</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="bg-white rounded-2xl border border-cream-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-ink">{user.display_name}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.role === "admin"
                          ? "bg-teal-50 text-teal-700"
                          : "bg-cream-100 text-ink-soft"
                      }`}
                    >
                      {user.role}
                    </span>
                    {user.is_super_admin && (
                      <span className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-medium">
                        Super Admin
                      </span>
                    )}
                    {user.must_change_pw && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Must change password
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-muted mt-0.5">{user.email}</p>
                </div>
                {!user.is_super_admin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEditingId(editingId === user.id ? null : user.id)}
                      className="text-xs text-teal-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setResetPwId(resetPwId === user.id ? null : user.id)}
                      className="text-xs text-rose-500 hover:text-rose-600"
                    >
                      Reset PW
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete user "${user.display_name}"?`)) {
                          deleteUser.mutate(user.id);
                        }
                      }}
                      disabled={deleteUser.isPending}
                      className="text-xs text-rose-400 hover:text-rose-600"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {editingId === user.id && (
                <div className="mt-3 pt-3 border-t border-cream-100">
                  <EditUserForm
                    user={user}
                    onSuccess={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}

              {resetPwId === user.id && (
                <div className="mt-3 pt-3 border-t border-cream-100">
                  <ResetPasswordForm
                    userId={user.id}
                    onClose={() => setResetPwId(null)}
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
