"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, adminVerify } from "../../../api";
import { startAdminSession } from "../../../components";

// Admin login is deliberately separate from the customer /login page and
// shares none of its UI.
//
// WORKS FOR ALL THREE ADMIN-CAPABLE ROLES with the SAME form:
//  - the one fixed SUPER_ADMIN account (see SUPER_ADMIN_EMAIL/PASSWORD env vars)
//  - any COMPANY_ADMIN account the super admin created from /admin/companies
//  - the login itself is the SAME /api/auth/login endpoint everyone else
//    uses; what happens next is what differs:
//      1. login() succeeds for ANY valid account (customer or admin).
//      2. adminVerify(token) is then called - the backend re-checks the
//         role in PostgreSQL and rejects with 403 if it isn't an admin.
//      3. Only after BOTH succeed does this page consider the sign-in
//         "real" and store the admin session token.
// A customer account can never reach the dashboard by mistake, and a
// half-signed-in state is never left behind on failure.

function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params?.get("next") ?? "/admin";

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    params?.get("error") === "not-admin"
      ? "That account does not have admin access."
      : ""
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const { token } = await login({ emailOrPhone, password });

      // The single source of truth: the backend re-checks the role.
      const verified = await adminVerify(token);

      startAdminSession(token, verified.role);

      // A company's first sign-in: the one-time password must be replaced first.
      if (verified.mustChangePassword) {
        router.replace("/admin/change-password");
        return;
      }

      // Only ever redirect inside this app - never to an attacker's URL.
      const safeNext = nextPath.startsWith("/admin") ? nextPath : "/admin";
      router.replace(safeNext);
    } catch (err: any) {
      const message = String(err?.message ?? "");
      // A failed attempt must never touch an admin session that is already
      // open in another tab, so nothing is cleared here.
      if (message.includes("403") || message.toLowerCase().includes("admin access")) {
        setError("That account does not have admin access.");
      } else if (message.includes("401") || message.toLowerCase().includes("incorrect")) {
        setError("Incorrect email/mobile number or password.");
      } else if (message.includes("Failed to fetch")) {
        setError("Cannot reach the server. Is the backend running on port 8080?");
      } else {
        setError(message || "Couldn't log in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpeg"
            alt="Namma Store"
            className="h-16 w-16 rounded-full bg-white object-contain p-1 ring-2 ring-amber-500"
          />
          <h1 className="mt-4 text-2xl font-semibold text-white">Admin Login</h1>
          <p className="mt-1 text-sm text-slate-400">
            Namma Store staff and company partner access only.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          noValidate
        >
          <div>
            <label htmlFor="admin-email" className="mb-1 block text-sm font-medium text-slate-700">
              Email or mobile number
            </label>
            <input
              id="admin-email"
              required
              autoComplete="username"
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-16 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-500 transition hover:text-slate-800"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {submitting ? "Verifying…" : "Login to Admin"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Company partner? Use the email/mobile and password shared with
            you by Namma Store.
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Looking for the shop?{" "}
          <a href="/" className="underline hover:text-slate-300">
            Go to Namma Store
          </a>
        </p>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary, otherwise `next build`
// fails this route with a prerender error.
export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-slate-900" aria-busy="true" />}
    >
      <AdminLoginForm />
    </Suspense>
  );
}
