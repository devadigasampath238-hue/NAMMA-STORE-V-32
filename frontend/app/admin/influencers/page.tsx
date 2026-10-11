"use client";

// ===========================================================
// /admin/influencers
//
// Full CRUD for the Influencer/Creator section: profile + cover +
// gallery images (Cloudinary-backed via api.ts), social links, and
// which products each creator curates. Modeled on /admin/banners
// so admins get a familiar layout.
//
// Route protection: middleware.ts blocks this URL before the page
// renders, useAdminSession() re-checks with the backend, and every
// /api/admin/** call below is re-authorised server-side.
// ===========================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminAddInfluencerGalleryImage,
  adminCreateInfluencer,
  adminDeleteInfluencer,
  adminDeleteInfluencerCoverImage,
  adminDeleteInfluencerProfileImage,
  adminGetInfluencers,
  adminGetProducts,
  adminLinkInfluencerProduct,
  adminRemoveInfluencerGalleryImage,
  adminUnlinkInfluencerProduct,
  adminUpdateInfluencer,
  adminUploadInfluencerCoverImage,
  adminUploadInfluencerProfileImage,
} from "../../../api";
import { AdminSidebar, SafeImage, useAdminSession } from "../../../components";
import type { Influencer, InfluencerPayload, Product, SocialLink } from "../../../types";

type FormState = {
  name: string;
  email: string;
  phone: string;
  bio: string;
  socialPlatform: string;
  socialHandle: string;
  socialLinks: SocialLink[];
  featured: boolean;
  active: boolean;
  displayOrder: number;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  phone: "",
  bio: "",
  socialPlatform: "",
  socialHandle: "",
  socialLinks: [],
  featured: false,
  active: true,
  displayOrder: 0,
};

function toPayload(form: FormState): InfluencerPayload {
  return {
    name: form.name.trim(),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    bio: form.bio.trim() || undefined,
    socialPlatform: form.socialPlatform.trim() || undefined,
    socialHandle: form.socialHandle.trim() || undefined,
    socialLinks: form.socialLinks.filter((l) => l.url.trim()),
    featured: form.featured,
    active: form.active,
    displayOrder: form.displayOrder,
  };
}

export default function AdminInfluencersPage() {
  const { token, checked } = useAdminSession();

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [productQuery, setProductQuery] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [infs, prods] = await Promise.all([
        adminGetInfluencers(token),
        adminGetProducts(token).catch(() => []),
      ]);
      setInfluencers(infs);
      setProducts(prods);
    } catch (e: any) {
      setError(e?.message ?? "Could not load influencers.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const editing = influencers.find((i) => i.id === editingId) || null;

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(inf: Influencer) {
    setEditingId(inf.id);
    setForm({
      name: inf.name,
      email: "",
      phone: "",
      bio: inf.bio ?? "",
      socialPlatform: inf.socialPlatform ?? "",
      socialHandle: inf.socialHandle ?? "",
      socialLinks: inf.socialLinks.length ? [...inf.socialLinks] : [],
      featured: inf.featured,
      active: inf.active,
      displayOrder: inf.displayOrder ?? 0,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token || saving) return;
    if (!form.name.trim()) {
      setError("Give the creator a name.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        await adminUpdateInfluencer(token, editingId, toPayload(form));
        setNotice("Creator updated.");
      } else {
        await adminCreateInfluencer(token, toPayload(form));
        setNotice("Creator added.");
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not save this creator.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(inf: Influencer) {
    if (!token) return;
    if (!window.confirm(`Remove "${inf.name}"? This cannot be undone.`)) return;
    setBusyId(inf.id);
    try {
      await adminDeleteInfluencer(token, inf.id);
      if (editingId === inf.id) resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not remove this creator.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(inf: Influencer, field: "active" | "featured") {
    if (!token) return;
    setBusyId(inf.id);
    try {
      await adminUpdateInfluencer(token, inf.id, { name: inf.name, [field]: !inf[field] });
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not update this creator.");
    } finally {
      setBusyId(null);
    }
  }

  async function pickProfileImage(inf: Influencer, file: File | null) {
    if (!token || !file) return;
    setBusyId(inf.id);
    try {
      await adminUploadInfluencerProfileImage(token, inf.id, file);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not upload the profile photo.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeProfileImage(inf: Influencer) {
    if (!token) return;
    setBusyId(inf.id);
    try {
      await adminDeleteInfluencerProfileImage(token, inf.id);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not remove the profile photo.");
    } finally {
      setBusyId(null);
    }
  }

  async function pickCoverImage(inf: Influencer, file: File | null) {
    if (!token || !file) return;
    setBusyId(inf.id);
    try {
      await adminUploadInfluencerCoverImage(token, inf.id, file);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not upload the cover photo.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeCoverImage(inf: Influencer) {
    if (!token) return;
    setBusyId(inf.id);
    try {
      await adminDeleteInfluencerCoverImage(token, inf.id);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not remove the cover photo.");
    } finally {
      setBusyId(null);
    }
  }

  async function addGalleryImage(inf: Influencer, file: File | null) {
    if (!token || !file) return;
    setBusyId(inf.id);
    try {
      await adminAddInfluencerGalleryImage(token, inf.id, file);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not add that photo.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeGalleryImage(inf: Influencer, url: string) {
    if (!token) return;
    setBusyId(inf.id);
    try {
      await adminRemoveInfluencerGalleryImage(token, inf.id, url);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not remove that photo.");
    } finally {
      setBusyId(null);
    }
  }

  async function linkProduct(inf: Influencer, productId: number) {
    if (!token) return;
    setBusyId(inf.id);
    try {
      await adminLinkInfluencerProduct(token, inf.id, productId);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not add that product.");
    } finally {
      setBusyId(null);
    }
  }

  async function unlinkProduct(inf: Influencer, productId: number) {
    if (!token) return;
    setBusyId(inf.id);
    try {
      await adminUnlinkInfluencerProduct(token, inf.id, productId);
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Could not remove that product.");
    } finally {
      setBusyId(null);
    }
  }

  function addSocialLinkField() {
    setForm({ ...form, socialLinks: [...form.socialLinks, { platform: "Instagram", url: "" }] });
  }
  function updateSocialLinkField(i: number, patch: Partial<SocialLink>) {
    const next = [...form.socialLinks];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, socialLinks: next });
  }
  function removeSocialLinkField(i: number) {
    setForm({ ...form, socialLinks: form.socialLinks.filter((_, idx) => idx !== i) });
  }

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [products, productQuery]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Checking your session…
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />

      <div className="flex-1 p-4 md:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Influencers &amp; Creators</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage creator profiles, photos, social links and which products each one curates.
            Live at <code className="rounded bg-slate-100 px-1">/influencers</code>.
          </p>
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        {/* ---------------- EDITOR ---------------- */}
        <form
          onSubmit={handleSave}
          className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="mb-4 font-medium text-slate-900">
            {editingId ? `Edit ${editing?.name ?? "creator"}` : "New creator"}
          </h2>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ananya Rao"
                className={inputClass}
              />
            </Field>
            <Field label="Email (private, optional)">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Phone (private, optional)">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Display order">
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) || 0 })}
                className={inputClass}
              />
            </Field>
            <Field label="Primary platform">
              <input
                value={form.socialPlatform}
                onChange={(e) => setForm({ ...form, socialPlatform: e.target.value })}
                placeholder="Instagram"
                className={inputClass}
              />
            </Field>
            <Field label="Handle">
              <input
                value={form.socialHandle}
                onChange={(e) => setForm({ ...form, socialHandle: e.target.value })}
                placeholder="@namma.style"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Bio">
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={3}
                placeholder="A short line about this creator..."
                className={inputClass}
              />
            </Field>
          </div>

          {/* ---- social links ---- */}
          <div className="mt-4">
            <span className="mb-1 block text-sm font-medium text-slate-700">Social links</span>
            <div className="space-y-2">
              {form.socialLinks.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={link.platform}
                    onChange={(e) => updateSocialLinkField(i, { platform: e.target.value })}
                    placeholder="Platform"
                    className={`${inputClass} w-32 shrink-0`}
                  />
                  <input
                    value={link.url}
                    onChange={(e) => updateSocialLinkField(i, { url: e.target.value })}
                    placeholder="https://..."
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeSocialLinkField(i)}
                    className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSocialLinkField}
              className="mt-2 text-sm font-medium text-brand-700 hover:underline"
            >
              + Add a social link
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Active (visible on the storefront)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Featured (shown on the homepage rail)
            </label>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-400"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Add creator"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
          {!editingId && (
            <p className="mt-3 text-xs text-slate-400">
              Save the creator first, then upload their photos and curate products below.
            </p>
          )}
        </form>

        {/* ---------------- LIST ---------------- */}
        {loading ? (
          <p className="text-sm text-slate-500">Loading creators…</p>
        ) : influencers.length === 0 ? (
          <p className="text-sm text-slate-500">No creators yet — add the first one above.</p>
        ) : (
          <div className="space-y-5">
            {influencers.map((inf) => {
              const linkedIds = new Set((inf.products ?? []).map((p) => p.id));
              return (
                <div key={inf.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 overflow-hidden rounded-full border border-slate-200">
                        <SafeImage src={inf.profileImageUrl} alt={inf.name} className="h-full w-full" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{inf.name}</p>
                        <p className="text-xs text-slate-500">
                          {inf.active ? "Active" : "Hidden"} · {inf.featured ? "Featured" : "Not featured"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggle(inf, "active")}
                        disabled={busyId === inf.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {inf.active ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => toggle(inf, "featured")}
                        disabled={busyId === inf.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {inf.featured ? "Unfeature" : "Feature"}
                      </button>
                      <button
                        onClick={() => startEdit(inf)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(inf)}
                        disabled={busyId === inf.id}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* ---- images ---- */}
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <ImageSlot
                      label="Profile photo"
                      src={inf.profileImageUrl}
                      onPick={(f) => pickProfileImage(inf, f)}
                      onRemove={inf.profileImageUrl ? () => removeProfileImage(inf) : undefined}
                      aspect="aspect-square"
                    />
                    <ImageSlot
                      label="Cover photo"
                      src={inf.coverImageUrl}
                      onPick={(f) => pickCoverImage(inf, f)}
                      onRemove={inf.coverImageUrl ? () => removeCoverImage(inf) : undefined}
                      aspect="aspect-[3/1]"
                    />
                  </div>

                  {/* ---- gallery ---- */}
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Gallery
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {inf.gallery.map((img) => (
                        <div key={img} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                          <SafeImage src={img} alt="" className="h-full w-full" />
                          <button
                            onClick={() => removeGalleryImage(inf, img)}
                            className="absolute inset-0 hidden items-center justify-center bg-black/50 text-xs text-white group-hover:flex"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 hover:bg-slate-50">
                        + Add
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => addGalleryImage(inf, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </div>

                  {/* ---- curated products ---- */}
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Curated products
                    </p>
                    {(inf.products ?? []).length === 0 ? (
                      <p className="mb-2 text-xs text-slate-400">No products linked yet.</p>
                    ) : (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {(inf.products ?? []).map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                          >
                            {p.name}
                            <button
                              onClick={() => unlinkProduct(inf, p.id)}
                              className="text-slate-400 hover:text-red-600"
                              aria-label={`Remove ${p.name}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <details className="text-sm">
                      <summary className="cursor-pointer text-brand-700 hover:underline">
                        + Add a product
                      </summary>
                      <div className="mt-2">
                        <input
                          value={productQuery}
                          onChange={(e) => setProductQuery(e.target.value)}
                          placeholder="Search products by name…"
                          className={`${inputClass} mb-2`}
                        />
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                          {filteredProducts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              disabled={linkedIds.has(p.id)}
                              onClick={() => linkProduct(inf, p.id)}
                              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span>{p.name}</span>
                              <span className="text-xs text-slate-400">
                                {linkedIds.has(p.id) ? "Added" : "Add"}
                              </span>
                            </button>
                          ))}
                          {filteredProducts.length === 0 && (
                            <p className="px-2 py-1.5 text-xs text-slate-400">No matching products.</p>
                          )}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageSlot({
  label,
  src,
  onPick,
  onRemove,
  aspect,
}: {
  label: string;
  src?: string | null;
  onPick: (file: File | null) => void;
  onRemove?: () => void;
  aspect: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className={`relative ${aspect} overflow-hidden rounded-xl border border-slate-200 bg-slate-50`}>
        {src ? (
          <SafeImage src={src} alt="" className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {src ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
