"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "../../../api";
import { Loading, endAdminSession, useAdminSession } from "../../../components";
import { errMsg } from "../../../lifecycle";

// First sign-in for a company account: the one-time password the Super Admin
// handed over must be replaced before the dashboard opens. The backend enforces
// this too (every other /api/admin call answers 403 until it is done).
export default function ChangePasswordPage() {
  const router = useRouter();
  const { token, checked, mustChangePassword, displayName } = useAdminSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Nothing to do here once the password has been replaced.
  useEffect(() => {
    if (checked && token && !mustChangePassword && !busy) router.replace("/admin");
  }, [checked, token, mustChangePassword, busy, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
    setError("");
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      return setError("Choose at least 8 characters, with a letter and a number.");
    }
    if (next !== confirm) return setError("The two new passwords do not match.");
    if (next === current) return setError("The new password must be different from the temporary one.");
    setBusy(true);
    try {
      await changePassword(token, current, next);
      router.replace("/admin");
    } catch (err) {
      setError(errMsg(err, "Could not change the password."));
      setBusy(false);
    }
  }

  if (!checked || !token) return <Loading />;

  return (
    <div className="kar-lattice flex min-h-screen items-center justify-center bg-coffee-950 px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-lift" noValidate>
        <div className="text-center">
          <p className="font-kannada text-lg font-semibold text-brand-700">ನಮ್ಮ ಸ್ಟೋರ್</p>
          <h1 className="font-display text-2xl font-bold text-coffee-900">Set your own password</h1>
          <p className="mt-1 text-sm text-coffee-700/80">
            {displayName ? `Welcome, ${displayName}. ` : ""}For your security, replace the one-time password you were given before continuing.
          </p>
        </div>

        <div>
          <label htmlFor="cp-cur" className="ns-label">Temporary password</label>
          <input id="cp-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="ns-input" required />
        </div>
        <div>
          <label htmlFor="cp-new" className="ns-label">New password</label>
          <input id="cp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="ns-input" required />
          <p className="mt-1 text-xs text-coffee-700/70">At least 8 characters, with a letter and a number.</p>
        </div>
        <div>
          <label htmlFor="cp-conf" className="ns-label">Confirm new password</label>
          <input id="cp-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="ns-input" required />
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={busy} className="ns-btn-primary w-full">
          {busy ? "Saving…" : "Save password & continue"}
        </button>
        <button
          type="button"
          onClick={() => {
            endAdminSession();
            router.replace("/admin/login");
          }}
          className="w-full text-center text-sm text-coffee-700 underline"
        >
          Cancel and sign out
        </button>
      </form>
    </div>
  );
}
