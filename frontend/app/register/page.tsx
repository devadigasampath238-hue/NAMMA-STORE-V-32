"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerAccount } from "../../api";
import { useAuth } from "../../components";

export default function RegisterPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const { token, user } = await registerAccount({ name, email, phone, password });
      setSession(token, user);
      router.push("/account");
    } catch (err: any) {
      setError(err?.message || "Couldn't create your account. Please check your details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto py-8">
      <h1 className="text-2xl font-bold mb-1">Create Account</h1>
      <p className="text-gray-500 text-sm mb-6">Join Namma Store in a minute.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
          <p className="text-xs text-gray-400 mt-1">At least 6 characters.</p>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-700 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-lg font-medium"
        >
          {submitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-orange-700 underline">
          Login
        </Link>
      </p>
    </div>
  );
}
