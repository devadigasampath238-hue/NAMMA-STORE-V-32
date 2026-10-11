"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login } from "../../api";
import { useAuth } from "../../components";

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const { token, user } = await login({ emailOrPhone, password });
      setSession(token, user);
      router.push("/account");
    } catch (err: any) {
      setError(err?.message || "Couldn't log in. Please check your details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto py-8">
      <h1 className="text-2xl font-bold mb-1">Login</h1>
      <p className="text-gray-500 text-sm mb-6">Welcome back to Namma Store.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email or Mobile Number</label>
          <input
            required
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            placeholder="you@example.com or 9876543210"
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-700 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-lg font-medium"
        >
          {submitting ? "Logging in..." : "Login"}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-6 text-center">
        New to Namma Store?{" "}
        <Link href="/register" className="text-orange-700 underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
