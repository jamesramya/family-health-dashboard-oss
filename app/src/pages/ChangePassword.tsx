import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { AuthShell } from "@/components/auth/AuthShell";
import { Btn } from "@/components/ui";

interface ChangePasswordFormValues {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export function ChangePassword() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>();

  const newPassword = watch("new_password");

  async function onSubmit(values: ChangePasswordFormValues) {
    setServerError(null);
    try {
      await api.post("/auth/change-password", {
        old_password: values.old_password,
        new_password: values.new_password,
      });
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError("Failed to change password. Please try again.");
      }
    }
  }

  const input = "w-full px-4 py-3 rounded-xl border border-cream-300 bg-white text-[16px] text-ink outline-none focus:border-teal-500";
  const label = "block text-sm font-medium text-ink-soft mb-1.5";

  return (
    <AuthShell heroBody="Update your sign-in password.">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Security</p>
      <h2 className="font-serif text-4xl text-ink mt-1 leading-tight">Change password</h2>
      <p className="text-sm text-ink-soft mt-2">You must change your password before continuing.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 mt-6">
        <div>
          <label htmlFor="old_password" className={label}>Current Password</label>
          <input
            id="old_password"
            type="password"
            autoComplete="current-password"
            className={input}
            {...register("old_password", { required: "Current password is required" })}
          />
          {errors.old_password && <p className="mt-1 text-xs text-rose-500">{errors.old_password.message}</p>}
        </div>

        <div>
          <label htmlFor="new_password" className={label}>New Password</label>
          <input
            id="new_password"
            type="password"
            autoComplete="new-password"
            className={input}
            {...register("new_password", {
              required: "New password is required",
              minLength: { value: 12, message: "At least 12 characters" },
            })}
          />
          {errors.new_password && <p className="mt-1 text-xs text-rose-500">{errors.new_password.message}</p>}
        </div>

        <div>
          <label htmlFor="confirm_password" className={label}>Confirm New Password</label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            className={input}
            {...register("confirm_password", {
              required: "Please confirm your new password",
              validate: (val) => val === newPassword || "Passwords do not match",
            })}
          />
          {errors.confirm_password && <p className="mt-1 text-xs text-rose-500">{errors.confirm_password.message}</p>}
        </div>

        {serverError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-600">
            {serverError}
          </div>
        )}

        <Btn type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Changing password…" : "Change password"}
        </Btn>
      </form>
    </AuthShell>
  );
}
