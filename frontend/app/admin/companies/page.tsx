"use client";

import { useEffect, useState } from "react";
import {
  adminListCompanies,
  adminCreateCompany,
  adminSetCompanyActive,
  adminResetCompanyPassword,
  type CompanyCredentials,
} from "../../../api";
import { AdminPageHeader, AdminSidebar, Loading, SafeImage, StatCard, useAdminSession } from "../../../components";
import type { Company } from "../../../types";

/**
 * ===========================================================
 * /admin/companies  (NEW - super admin only)
 * -----------------------------------------------------------
 * The backend rejects every call here with 403 unless the
 * signed-in account's role is SUPER_ADMIN - see
 * CompanyController.requireSuperAdmin on the backend. This page
 * doesn't hide itself from a COMPANY_ADMIN by checking role
 * client-side (AdminSidebar already only links to it for a
 * super admin) - it relies on the server's check either way,
 * because a client-side check is not real security.
 *
 * FLOW: fill in the company's details -> Create -> the server
 * generates a login email (unless you typed one) and a random
 * password -> shown ONCE in the box on the right so you can
 * copy it and send it to that company. It is never shown again;
 * use "Reset password" if it's lost.
 * ===========================================================
 */
export default function AdminCompaniesPage() {
  const { token, checked } = useAdminSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<CompanyCredentials | null>(null);

  const [form, setForm] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    address: "",
    gstNumber: "",
    loginEmail: "",
  });

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setCompanies(await adminListCompanies(token));
    } catch (err: any) {
      setError(err?.message || "Couldn't load companies.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const credentials = await adminCreateCompany(token, {
        name: form.name.trim(),
        contactPerson: form.contactPerson || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        gstNumber: form.gstNumber || undefined,
        loginEmail: form.loginEmail || undefined,
      });
      setJustCreated(credentials);
      setForm({ name: "", contactPerson: "", phone: "", address: "", gstNumber: "", loginEmail: "" });
      await load();
    } catch (err: any) {
      setError(err?.message || "Couldn't create the company.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(company: Company) {
    if (!token) return;
    await adminSetCompanyActive(token, company.id, !company.active);
    await load();
  }

  async function handleResetPassword(company: Company) {
    if (!token) return;
    if (!confirm(`Issue a new password for "${company.name}"? The old one will stop working immediately.`)) {
      return;
    }
    try {
      const credentials = await adminResetCompanyPassword(token, company.id);
      setJustCreated(credentials);
    } catch (err: any) {
      setError(err?.message || "Couldn't reset the password.");
    }
  }

  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!checked || !token) return <Loading />;

  const when = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";
  const activeCount = companies.filter((c) => c.active).length;

  return (
    <div className="flex flex-col lg:flex-row">
      <AdminSidebar />
      <div className="adm-page">
        <AdminPageHeader
          eyebrow="Marketplace"
          title="Companies"
          subtitle="Each company sells its own products. Create one here and Namma Store generates its sign-in automatically - orders for its products are routed to it and to you."
          actions={
            <button onClick={() => setShowForm((v) => !v)} className="ns-btn-primary">
              {showForm ? "Close form" : "+ Add company"}
            </button>
          }
        />

        <div className="adm-body space-y-8">
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <StatCard icon="companies" tone="red" label="Companies" value={companies.length} />
            <StatCard icon="companies" tone="green" label="Active" value={activeCount} />
            <StatCard icon="products" tone="gold" label="Products listed" value={companies.reduce((n, c) => n + (c.productCount ?? 0), 0)} />
          </div>

          {/* ---------- credentials just issued (shown once) ---------- */}
          {justCreated && (
            <div className="kar-lattice relative overflow-hidden rounded-2xl border border-gold-300/60 bg-gradient-to-br from-coffee-900 to-brand-900 p-5 text-white shadow-lift anim-rise md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-gold-300">Sign-in created</p>
                  <h2 className="mt-1 font-display text-xl font-bold md:text-2xl">{justCreated.companyName}</h2>
                  <p className="mt-1 max-w-xl text-sm text-brand-100/85">
                    Share these with the company now. For security the password is shown <b>once</b> and is stored only
                    as a hash - if it is lost, use <b>Reset password</b>.
                  </p>
                </div>
                <button onClick={() => setJustCreated(null)} className="text-sm text-brand-200 underline">Dismiss</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gold-300">Login email</p>
                  <p className="mt-1 break-all font-mono text-sm">{justCreated.loginEmail}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gold-300">Password</p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold">{justCreated.password}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      `Login: ${justCreated.loginEmail}\nPassword: ${justCreated.password}\nSign in at: ${window.location.origin}/admin/login`
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-coffee-900 transition hover:bg-gold-300"
                >
                  {copied ? "Copied ✓" : "Copy sign-in details"}
                </button>
                <span className="text-xs text-brand-200/80">Sign-in page: /admin/login</span>
              </div>
            </div>
          )}

          {/* ---------- create form ---------- */}
          {showForm && (
            <form onSubmit={handleCreate} className="ns-card overflow-hidden anim-rise">
              <div className="kar-silk-thin" />
              <div className="grid gap-0 lg:grid-cols-3">
                <section className="space-y-4 p-5 md:p-6 lg:border-r lg:border-brand-100">
                  <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-brand-700">1 · Company</h2>
                  <div>
                    <label className="ns-label">Company name *</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ns-input" placeholder="e.g. Kundapura Handicrafts" />
                  </div>
                  <div>
                    <label className="ns-label">GST number</label>
                    <input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} className="ns-input" />
                  </div>
                  <div>
                    <label className="ns-label">Address</label>
                    <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="ns-input" rows={3} placeholder="Town, district, Karnataka" />
                  </div>
                </section>

                <section className="space-y-4 p-5 md:p-6 lg:border-r lg:border-brand-100">
                  <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-brand-700">2 · Admin contact</h2>
                  <div>
                    <label className="ns-label">Contact person</label>
                    <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="ns-input" />
                  </div>
                  <div>
                    <label className="ns-label">Phone</label>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="ns-input" inputMode="tel" />
                  </div>
                </section>

                <section className="space-y-4 bg-brand-50/50 p-5 md:p-6">
                  <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-brand-700">3 · Sign-in</h2>
                  <div>
                    <label className="ns-label">Login email (optional)</label>
                    <input type="email" placeholder="Leave blank to auto-generate" value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} className="ns-input" />
                    <p className="mt-1 text-xs text-coffee-700/70">Blank = something like companyname@partners.nammastore.in</p>
                  </div>
                  <div className="rounded-xl border border-gold-300/60 bg-white p-3 text-xs text-coffee-700">
                    🔒 A strong password is generated for you and shown once after creation. It is never stored in plain text.
                  </div>
                  <button type="submit" disabled={creating} className="ns-btn-primary w-full">
                    {creating ? "Creating..." : "Create company & generate sign-in"}
                  </button>
                </section>
              </div>
            </form>
          )}

          {/* ---------- company cards ---------- */}
          <div>
            <h2 className="mb-3 font-display text-xl font-bold text-coffee-900">All companies</h2>
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="ns-card h-48 animate-pulse bg-brand-50" />
                ))}
              </div>
            ) : companies.length === 0 ? (
              <div className="ns-card kar-lattice p-10 text-center">
                <p className="font-display text-lg font-semibold text-coffee-900">No companies yet</p>
                <p className="mt-1 text-sm text-coffee-700/70">Add your first company to start routing orders to sellers.</p>
                <button onClick={() => setShowForm(true)} className="ns-btn-primary mt-4">+ Add company</button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {companies.map((c) => (
                  <article key={c.id} className="ns-card ns-card-hover kar-corner flex flex-col overflow-hidden">
                    <div className={`h-1.5 ${c.active ? "bg-gradient-to-r from-brand-600 via-gold-400 to-brand-600" : "bg-gray-300"}`} />
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start gap-3">
                        {c.logoUrl ? (
                          <SafeImage src={c.logoUrl} alt={c.name} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-brand-100" />
                        ) : (
                          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 font-display text-2xl font-bold text-gold-200">
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-display text-lg font-bold text-coffee-900">{c.name}</h3>
                          <span className={`adm-chip mt-0.5 ${c.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${c.active ? "bg-green-600" : "bg-red-500"}`} />
                            {c.active ? "Active" : "Deactivated"}
                          </span>
                        </div>
                      </div>

                      <dl className="mt-4 space-y-1.5 text-sm">
                        <div className="flex gap-2"><dt className="w-16 shrink-0 text-coffee-700/75">Login</dt><dd className="min-w-0 break-all font-mono text-xs text-coffee-900">{c.loginEmail ?? "-"}</dd></div>
                        <div className="flex gap-2"><dt className="w-16 shrink-0 text-coffee-700/75">Contact</dt><dd className="min-w-0 truncate">{c.contactPerson || "-"}</dd></div>
                        <div className="flex gap-2"><dt className="w-16 shrink-0 text-coffee-700/75">Phone</dt><dd>{c.phone || "-"}</dd></div>
                        <div className="flex gap-2"><dt className="w-16 shrink-0 text-coffee-700/75">Since</dt><dd>{when(c.createdAt)}</dd></div>
                      </dl>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-brand-50 p-3 text-center">
                          <p className="font-display text-xl font-bold text-brand-800">{c.productCount ?? 0}</p>
                          <p className="text-[11px] uppercase tracking-wide text-coffee-700/70">Products</p>
                        </div>
                        <div className="rounded-xl bg-gold-50 p-3 text-center">
                          <p className="font-display text-xl font-bold text-gold-600">{c.orderCount ?? 0}</p>
                          <p className="text-[11px] uppercase tracking-wide text-coffee-700/70">Orders</p>
                        </div>
                      </div>

                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <button onClick={() => handleToggleActive(c)} className="ns-btn-outline !px-3 !py-1.5 text-sm">
                          {c.active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => handleResetPassword(c)} className="ns-btn-outline !px-3 !py-1.5 text-sm">
                          Reset password
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
