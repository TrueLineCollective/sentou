"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setConfirmError(null);

    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setConfirmError("New password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        // Omit revokeOtherSessions — keep the current session alive
      });
      if (res.error) {
        throw new Error(res.error.message ?? "Password change failed");
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <Field
        label="Current password"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        autoComplete="current-password"
        disabled={loading}
        required
      />
      <Field
        label="New password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
        disabled={loading}
        required
        hint="At least 8 characters."
      />
      <Field
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        disabled={loading}
        required
        error={confirmError ?? undefined}
      />

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-3 border border-red-400/30 bg-red-400/[0.04] rounded-lg text-sm text-red-400"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div
          className="px-4 py-3 border border-transit-mint/30 bg-transit-mint/[0.04] rounded-lg text-sm text-transit-mint"
          role="status"
        >
          Password updated.
        </div>
      )}

      <Button
        intent="primary"
        type="submit"
        disabled={loading || !currentPassword || !newPassword || !confirmPassword}
        className="self-start"
      >
        {loading ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
