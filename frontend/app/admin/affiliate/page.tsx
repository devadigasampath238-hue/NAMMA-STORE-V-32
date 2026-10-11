"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminCreateCoupon,
  adminUpdateCoupon,
  adminGetAffiliateCoupons,
  adminSetCouponActive,
  affiliateCommissions,
  affiliateGenerateCode,
  affiliateInfluencer,
  affiliateInfluencers,
  affiliatePayout,
  affiliateSetCommissionStatus,
  affiliateSummary,
} from "../../../api";
import { AdminPageHeader, AdminSidebar, AdminTable, StatCard, useAdminSession } from "../../../components";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  Modal,
  Price,
  friendlyError,
  useToast,
} from "../../../ui";
import type {
  AdminCoupon,
  AffiliateInfluencerDetail,
  AffiliateInfluencerRow,
  AffiliateSummary,
  CommissionFilters,
  CommissionRow,
  CommissionStatus,
  CouponPayload,
  CouponType,
} from "../../../types";

/* =========================================================
   INFLUENCER SALES & COMMISSIONS  (internal, super admin only)

   Influencers are external marketers. They are NOT shown to
   customers anywhere. They share a normal product link plus
   their coupon code; the backend works out who earned what.

   This screen only DISPLAYS backend-computed figures and asks
   the backend to change a status. It never calculates money.
========================================================= */

type Tab = "overview" | "influencers" | "coupons" | "commissions" | "payouts";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-200 text-gray-600",
  REVERSED: "bg-red-100 text-red-700",
};

function Pill({ status }: { status?: string | null }) {
  const s = status ?? "—";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLE[s] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {s}
    </span>
  );
}

function Stat({ label, value, money = false }: { label: string; value: number; money?: boolean }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-3 text-center">
      <p className="text-[11px] uppercase tracking-wide text-coffee-700/70">{label}</p>
      <p className="mt-1 font-display text-lg font-bold text-coffee-900">{money ? <Price value={value} /> : value}</p>
    </div>
  );
}

const emptyCouponForm = {
  influencerId: "",
  code: "",
  discountType: "PERCENT" as CouponType,
  discountValue: "",
  commissionType: "PERCENT" as CouponType,
  commissionValue: "",
  minOrderValue: "",
  expiryDate: "",
  usageLimit: "",
  perUserLimit: "",
  active: true,
};

export default function AdminAffiliatePage() {
  const { token, checked } = useAdminSession();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<AffiliateSummary | null>(null);
  const [influencers, setInfluencers] = useState<AffiliateInfluencerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // commissions tab
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState("");
  const [filters, setFilters] = useState<CommissionFilters>({});

  // coupon modal
  const [couponOpen, setCouponOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState(emptyCouponForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // coupons tab
  const [allCoupons, setAllCoupons] = useState<AdminCoupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);

  // detail modal
  const [detail, setDetail] = useState<AffiliateInfluencerDetail | null>(null);

  // payout modal
  const [payFor, setPayFor] = useState<AffiliateInfluencerRow | null>(null);
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");

  const loadOverview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [s, list] = await Promise.all([affiliateSummary(token), affiliateInfluencers(token)]);
      setSummary(s);
      setInfluencers(list);
    } catch (e) {
      setError(friendlyError(e, "Could not load influencer data."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadRows = useCallback(async () => {
    if (!token) return;
    setRowsLoading(true);
    setRowsError("");
    try {
      setRows(await affiliateCommissions(token, filters));
    } catch (e) {
      setRowsError(friendlyError(e, "Could not load commissions."));
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab === "commissions") loadRows();
  }, [tab, loadRows]);

  const loadCoupons = useCallback(async () => {
    if (!token) return;
    setCouponsLoading(true);
    try {
      const all = await adminGetAffiliateCoupons(token);
      setAllCoupons(all.filter((c) => c.influencerId != null));
    } catch (e) {
      toastError(friendlyError(e, "Could not load coupons."));
    } finally {
      setCouponsLoading(false);
    }
  }, [token, toastError]);

  useEffect(() => {
    if (tab === "coupons") loadCoupons();
  }, [tab, loadCoupons]);

  /* ---------------- coupon create / edit ---------------- */

  function openNewCoupon(influencerId?: number) {
    setEditingCoupon(null);
    setForm({ ...emptyCouponForm, influencerId: influencerId ? String(influencerId) : "" });
    setFormError("");
    setCouponOpen(true);
  }

  function openEditCoupon(c: AdminCoupon) {
    setEditingCoupon(c);
    setForm({
      influencerId: c.influencerId ? String(c.influencerId) : "",
      code: c.code,
      discountType: c.discountType,
      discountValue: String(c.discountValue ?? ""),
      commissionType: (c.commissionType as CouponType) ?? "PERCENT",
      commissionValue: c.commissionValue != null ? String(c.commissionValue) : "",
      minOrderValue: c.minOrderValue ? String(c.minOrderValue) : "",
      expiryDate: c.expiryDate ?? "",
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
      perUserLimit: c.perUserLimit != null ? String(c.perUserLimit) : "",
      active: c.active,
    });
    setFormError("");
    setDetail(null);
    setCouponOpen(true);
  }

  async function generateCode() {
    if (!token) return;
    const inf = influencers.find((i) => String(i.id) === form.influencerId);
    if (!inf) {
      setFormError("Choose the influencer first, then generate a code.");
      return;
    }
    try {
      const res = await affiliateGenerateCode(
        token,
        inf.name,
        form.discountType === "PERCENT" && form.discountValue ? Number(form.discountValue) : undefined
      );
      setForm((f) => ({ ...f, code: res.code }));
      setFormError("");
    } catch (e) {
      setFormError(friendlyError(e, "Could not generate a code."));
    }
  }

  function validateCoupon(): string | null {
    if (!form.influencerId) return "Choose an influencer.";
    if (!/^[A-Z0-9_-]{3,32}$/.test(form.code.trim().toUpperCase())) {
      return "Code must be 3–32 characters: letters, numbers, - or _.";
    }
    const discount = Number(form.discountValue);
    if (!Number.isFinite(discount) || discount <= 0) return "Customer discount must be greater than zero.";
    if (form.discountType === "PERCENT" && discount > 100) return "A percentage discount cannot exceed 100%.";
    if (form.commissionValue !== "") {
      const c = Number(form.commissionValue);
      if (!Number.isFinite(c) || c < 0) return "Commission cannot be negative.";
      if (form.commissionType === "PERCENT" && c > 100) return "A percentage commission cannot exceed 100%.";
    }
    return null;
  }

  async function saveCoupon() {
    if (!token) return;
    const problem = validateCoupon();
    if (problem) {
      setFormError(problem);
      return;
    }
    const inf = influencers.find((i) => String(i.id) === form.influencerId);
    const payload: CouponPayload = {
      code: form.code.trim().toUpperCase(),
      description: inf ? `Influencer coupon - ${inf.name}` : undefined,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : 0,
      expiryDate: form.expiryDate || null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      active: form.active,
      influencerId: Number(form.influencerId),
      commissionType: form.commissionType,
      // Blank = the backend falls back to the influencer's default commission %.
      commissionValue: form.commissionValue === "" ? null : Number(form.commissionValue),
      perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : null,
    };
    setSaving(true);
    setFormError("");
    try {
      if (editingCoupon) await adminUpdateCoupon(token, editingCoupon.id, payload);
      else await adminCreateCoupon(token, payload);
      setCouponOpen(false);
      success(editingCoupon ? "Coupon updated" : "Coupon created");
      await loadOverview();
    } catch (e) {
      setFormError(friendlyError(e, "Could not save the coupon."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleCoupon(c: AdminCoupon) {
    if (!token) return;
    try {
      await adminSetCouponActive(token, c.id, !c.active);
      success(c.active ? "Coupon disabled" : "Coupon enabled");
      if (detail) setDetail(await affiliateInfluencer(token, detail.id));
      await loadOverview();
    } catch (e) {
      toastError(friendlyError(e, "Could not change the coupon."));
    }
  }

  async function openDetail(id: number) {
    if (!token) return;
    try {
      setDetail(await affiliateInfluencer(token, id));
    } catch (e) {
      toastError(friendlyError(e, "Could not load that influencer."));
    }
  }

  /* ---------------- commission actions ---------------- */

  async function setStatus(row: CommissionRow, status: CommissionStatus) {
    if (!token) return;
    let reference: string | undefined;
    if (status === "PAID") {
      const input = window.prompt("Payout reference (UPI / bank transaction id) - optional:", "");
      if (input === null) return;
      reference = input.trim() || undefined;
    }
    if (status === "CANCELLED" && !window.confirm("Cancel this commission? It will no longer be payable.")) return;
    try {
      await affiliateSetCommissionStatus(token, row.id, status, reference ? { reference } : undefined);
      success(`Commission ${status.toLowerCase()}`);
      await Promise.all([loadRows(), loadOverview()]);
    } catch (e) {
      toastError(friendlyError(e, "Could not update that commission."));
    }
  }

  async function doPayout() {
    if (!token || !payFor) return;
    try {
      const res = await affiliatePayout(token, {
        influencerId: payFor.id,
        reference: payRef.trim() || undefined,
        note: payNote.trim() || undefined,
      });
      success(`Paid ${res.commissionsPaid} commission(s) to ${res.influencerName}`);
      setPayFor(null);
      setPayRef("");
      setPayNote("");
      await loadOverview();
      if (tab === "commissions") await loadRows();
    } catch (e) {
      toastError(friendlyError(e, "Could not record that payout."));
    }
  }

  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN") : "—");

  const renderInfluencers = (list: AffiliateInfluencerRow[]) => (
    <>
{list.length === 0 ? (
                  <EmptyState
                    title="No influencers yet"
                    message="Add an influencer, then create a coupon for them."
                  />
                ) : (
                  <AdminTable
                    headers={["Influencer", "Coupon", "Orders", "Sales", "Commission", "Status", "Actions"]}
                    rows={list.map((i) => [
                      <div key={`n-${i.id}`}>
                        <p className="font-medium text-gray-800">{i.name}</p>
                        <p className="text-xs text-gray-400">
                          {[i.socialPlatform, i.socialHandle].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>,
                      i.couponCodes.length ? (
                        <span key={`c-${i.id}`} className="font-mono text-sm text-brand-800">
                          {i.couponCodes.join(", ")}
                        </span>
                      ) : (
                        <span key={`c-${i.id}`} className="text-xs text-gray-400">no coupon yet</span>
                      ),
                      String(i.totalOrders),
                      <Price key={`s-${i.id}`} value={i.totalSales} />,
                      <Price key={`m-${i.id}`} value={i.totalCommission} />,
                      <Pill key={`st-${i.id}`} status={i.active ? "ACTIVE" : "INACTIVE"} />,
                      <div key={`a-${i.id}`} className="flex flex-wrap gap-3">
                        <button onClick={() => openDetail(i.id)} className="text-sm text-brand-700 underline">
                          Details
                        </button>
                        <button onClick={() => openNewCoupon(i.id)} className="text-sm text-gray-600 underline">
                          Add coupon
                        </button>
                      </div>,
                    ])}
                  />
                )}
    </>
  );

  if (!checked || !token) return <ListSkeleton rows={4} />;

  return (
    <div className="flex flex-col md:flex-row">
      <AdminSidebar />

      <div className="adm-page">
        <AdminPageHeader
          eyebrow="Growth · Internal only"
          title="Affiliate sales"
          subtitle="Influencers promote an ordinary product link with their own coupon. The server attributes each sale and calculates the commission - nothing here is visible to customers."
          actions={
            <>
              <Link href="/admin/influencers" className="ns-btn-outline">Add / edit influencers</Link>
              <button onClick={() => openNewCoupon()} className="ns-btn-primary">New influencer coupon</button>
            </>
          }
        />
        <div className="adm-body">
        <div className="mb-6 flex gap-1.5 overflow-x-auto rounded-full border border-brand-100 bg-white p-1.5 shadow-card">
          {(["overview", "influencers", "coupons", "commissions", "payouts"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`adm-tab capitalize ${tab === t ? "adm-tab-active" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <ListSkeleton rows={4} height="h-16" />
        ) : error ? (
          <ErrorState message={error} onRetry={loadOverview} />
        ) : (
          <>
            {tab === "overview" && summary && (
              <>
                <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
                  <StatCard icon="influencers" tone="red" label="Influencers" value={`${summary.activeInfluencers} / ${summary.totalInfluencers}`} hint="active / total" />
                  <StatCard icon="orders" tone="coffee" label="Attributed orders" value={summary.totalOrders} hint={`${summary.successfulOrders} still payable`} />
                  <StatCard icon="affiliate" tone="gold" label="Attributed sales" value={`₹${Number(summary.totalSales).toLocaleString("en-IN")}`} hint="Net of discount, ex-delivery" />
                  <StatCard icon="coupons" tone="green" label="Paid out" value={`₹${Number(summary.paidCommission).toLocaleString("en-IN")}`} />
                  <StatCard icon="coupons" tone="gold" label="Pending commission" value={`₹${Number(summary.pendingCommission).toLocaleString("en-IN")}`} hint="Waiting for delivery" />
                  <StatCard icon="coupons" tone="red" label="Approved (payable)" value={`₹${Number(summary.approvedCommission).toLocaleString("en-IN")}`} hint="Ready to pay" />
                  <StatCard icon="logout" tone="coffee" label="To recover" value={`₹${Number(summary.commissionToRecover).toLocaleString("en-IN")}`} hint="Refunded after payout" />
                </div>

                <h2 className="mb-3 font-display text-lg font-bold text-coffee-900">Top influencers</h2>
                {renderInfluencers(influencers.slice(0, 5))}
              </>
            )}

            {tab === "influencers" && renderInfluencers(influencers)}

            {tab === "coupons" &&
              (couponsLoading ? (
                <ListSkeleton rows={3} height="h-16" />
              ) : allCoupons.length === 0 ? (
                <EmptyState title="No influencer coupons yet" message="Create a coupon and link it to an influencer." />
              ) : (
                <AdminTable
                  headers={["Code", "Influencer", "Customer gets", "Commission", "Usage", "Status", "Actions"]}
                  rows={allCoupons.map((c) => [
                    <span key={`c-${c.id}`} className="font-mono font-semibold text-brand-700">{c.code}</span>,
                    c.influencerName ?? `#${c.influencerId}`,
                    c.summary ?? "-",
                    c.commissionType === "FIXED" ? `₹${c.commissionValue}` : `${c.commissionValue ?? "default"}%`,
                    `${c.usedCount ?? 0}${c.usageLimit ? ` / ${c.usageLimit}` : ""}${c.perUserLimit ? ` · ${c.perUserLimit}/customer` : ""}`,
                    <Pill key={`s-${c.id}`} status={c.statusLabel ?? (c.active ? "ACTIVE" : "INACTIVE")} />,
                    <div key={`a-${c.id}`} className="flex gap-3">
                      <button onClick={() => openEditCoupon(c)} className="text-sm text-brand-700 underline">Edit</button>
                      <button onClick={() => toggleCoupon(c)} className="text-sm text-coffee-700 underline">{c.active ? "Disable" : "Enable"}</button>
                    </div>,
                  ])}
                />
              ))}

            {tab === "commissions" && (
              <>
                <div className="ns-card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                  <select
                    className="ns-input"
                    value={filters.influencerId ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, influencerId: e.target.value ? Number(e.target.value) : undefined }))
                    }
                  >
                    <option value="">All influencers</option>
                    {influencers.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="ns-input"
                    placeholder="Coupon code"
                    value={filters.couponCode ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, couponCode: e.target.value }))}
                  />
                  <input
                    className="ns-input"
                    placeholder="Product id"
                    inputMode="numeric"
                    value={filters.productId ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, productId: e.target.value ? Number(e.target.value) : undefined }))
                    }
                  />
                  <input
                    className="ns-input"
                    placeholder="Order id"
                    inputMode="numeric"
                    value={filters.orderId ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, orderId: e.target.value ? Number(e.target.value) : undefined }))
                    }
                  />
                  <input
                    type="date"
                    className="ns-input"
                    aria-label="From date"
                    value={filters.from ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="ns-input"
                    aria-label="To date"
                    value={filters.to ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                  />
                  <select
                    className="ns-input"
                    value={filters.orderStatus ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, orderStatus: e.target.value }))}
                  >
                    <option value="">Any order status</option>
                    {["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    className="ns-input"
                    value={filters.status ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, status: e.target.value as CommissionStatus | "" }))
                    }
                  >
                    <option value="">Any commission status</option>
                    {["PENDING", "APPROVED", "PAID", "CANCELLED", "REVERSED"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {rowsLoading ? (
                  <ListSkeleton rows={4} height="h-14" />
                ) : rowsError ? (
                  <ErrorState message={rowsError} onRetry={loadRows} />
                ) : rows.length === 0 ? (
                  <EmptyState
                    title="No commissions match"
                    message="A commission appears here the moment a customer buys with an influencer coupon."
                  />
                ) : (
                  <AdminTable
                    headers={["Order", "Influencer", "Coupon", "Product", "Sale", "Commission", "Order status", "Status", "Actions"]}
                    rows={rows.map((r) => [
                      <div key={`o-${r.id}`}>
                        <p className="font-medium">{r.orderNumber ?? `#${r.orderId}`}</p>
                        <p className="text-xs text-gray-400">{when(r.createdAt)}</p>
                      </div>,
                      r.influencerName ?? `#${r.influencerId}`,
                      <span key={`c-${r.id}`} className="font-mono text-sm">{r.couponCode ?? "—"}</span>,
                      <span key={`p-${r.id}`} className="block max-w-[14rem] truncate text-sm">
                        {r.productSummary ?? "—"}
                      </span>,
                      <Price key={`s-${r.id}`} value={r.saleAmount} />,
                      <div key={`m-${r.id}`}>
                        <Price value={r.commissionAmount} />
                        <p className="text-xs text-gray-400">
                          {r.commissionType === "FIXED" ? "fixed" : `${r.commissionRate ?? 0}%`}
                        </p>
                      </div>,
                      <span key={`os-${r.id}`} className="text-sm">
                        {r.orderStatus ?? "—"}
                        {r.paymentStatus === "REFUNDED" ? " · refunded" : ""}
                      </span>,
                      <Pill key={`st-${r.id}`} status={r.commissionStatus} />,
                      <div key={`a-${r.id}`} className="flex flex-wrap gap-3">
                        {r.commissionStatus === "PENDING" && r.orderStatus === "DELIVERED" && (
                          <button onClick={() => setStatus(r, "APPROVED")} className="text-sm text-brand-700 underline">
                            Approve
                          </button>
                        )}
                        {r.commissionStatus === "APPROVED" && (
                          <button onClick={() => setStatus(r, "PAID")} className="text-sm text-green-700 underline">
                            Mark paid
                          </button>
                        )}
                        {(r.commissionStatus === "PENDING" || r.commissionStatus === "APPROVED") && (
                          <button onClick={() => setStatus(r, "CANCELLED")} className="text-sm text-red-600 underline">
                            Cancel
                          </button>
                        )}
                      </div>,
                    ])}
                  />
                )}
              </>
            )}

            {tab === "payouts" && (
              <>
                <p className="mb-3 text-sm text-gray-500">
                  Only <b>approved</b> commissions (order delivered, not refunded) can be paid out.
                </p>
                {influencers.filter((i) => i.approvedCommission > 0 || i.paidCommission > 0).length === 0 ? (
                  <EmptyState
                    title="Nothing to pay yet"
                    message="Commissions become payable once their order is delivered."
                  />
                ) : (
                  <AdminTable
                    headers={["Influencer", "Pending", "Approved (payable)", "Paid", "Actions"]}
                    rows={influencers
                      .filter((i) => i.approvedCommission > 0 || i.paidCommission > 0 || i.pendingCommission > 0)
                      .map((i) => [
                        i.name,
                        <Price key={`p-${i.id}`} value={i.pendingCommission} />,
                        <Price key={`a-${i.id}`} value={i.approvedCommission} />,
                        <Price key={`d-${i.id}`} value={i.paidCommission} />,
                        i.approvedCommission > 0 ? (
                          <button key={`b-${i.id}`} onClick={() => setPayFor(i)} className="text-sm text-green-700 underline">
                            Pay approved
                          </button>
                        ) : (
                          <span key={`b-${i.id}`} className="text-xs text-gray-400">nothing approved</span>
                        ),
                      ])}
                  />
                )}
              </>
            )}
          </>
        )}
        </div>
      </div>

      {/* ---------- coupon modal ---------- */}
      <Modal open={couponOpen} title={editingCoupon ? "Edit influencer coupon" : "New influencer coupon"} onClose={() => setCouponOpen(false)} wide>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            Influencer
            <select
              className="ns-input mt-1 w-full"
              value={form.influencerId}
              onChange={(e) => setForm({ ...form, influencerId: e.target.value })}
            >
              <option value="">Choose…</option>
              {influencers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm md:col-span-2">
            Coupon code
            <div className="mt-1 flex gap-2">
              <input
                className="ns-input w-full font-mono uppercase"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="RAHUL10"
              />
              <button type="button" onClick={generateCode} className="ns-btn-outline whitespace-nowrap">
                Generate
              </button>
            </div>
          </label>

          <label className="text-sm">
            Customer discount type
            <select
              className="ns-input mt-1 w-full"
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as CouponType })}
            >
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed amount</option>
            </select>
          </label>
          <label className="text-sm">
            Customer discount value
            <input
              className="ns-input mt-1 w-full"
              inputMode="decimal"
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              placeholder="10"
            />
          </label>

          <label className="text-sm">
            Commission type
            <select
              className="ns-input mt-1 w-full"
              value={form.commissionType}
              onChange={(e) => setForm({ ...form, commissionType: e.target.value as CouponType })}
            >
              <option value="PERCENT">Percentage of net sale</option>
              <option value="FIXED">Fixed amount per order</option>
            </select>
          </label>
          <label className="text-sm">
            Commission value
            <input
              className="ns-input mt-1 w-full"
              inputMode="decimal"
              value={form.commissionValue}
              onChange={(e) => setForm({ ...form, commissionValue: e.target.value })}
              placeholder="5 (blank = influencer default %)"
            />
          </label>

          <label className="text-sm">
            Minimum order (₹)
            <input
              className="ns-input mt-1 w-full"
              inputMode="decimal"
              value={form.minOrderValue}
              onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Expiry date
            <input
              type="date"
              className="ns-input mt-1 w-full"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Total usage limit
            <input
              className="ns-input mt-1 w-full"
              inputMode="numeric"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              placeholder="unlimited"
            />
          </label>
          <label className="text-sm">
            Uses per customer
            <input
              className="ns-input mt-1 w-full"
              inputMode="numeric"
              value={form.perUserLimit}
              onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
              placeholder="unlimited"
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          The discount applies only to the products assigned to this influencer (set on the influencer&apos;s page).
          If none are assigned it applies to the whole cart. Commission is calculated on the net sale after the
          discount, excluding delivery.
        </p>
        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setCouponOpen(false)} className="ns-btn-outline">
            Cancel
          </button>
          <button onClick={saveCoupon} disabled={saving} className="ns-btn-primary">
            {saving ? "Saving…" : "Save coupon"}
          </button>
        </div>
      </Modal>

      {/* ---------- influencer detail modal ---------- */}
      <Modal open={!!detail} title={detail ? detail.name : ""} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-1 text-gray-600 md:grid-cols-2">
              <p>Email: {detail.email || "—"}</p>
              <p>Phone: {detail.phone || "—"}</p>
              <p>Platform: {[detail.socialPlatform, detail.socialHandle].filter(Boolean).join(" · ") || "—"}</p>
              <p>Default commission: {detail.defaultCommissionPercent != null ? `${detail.defaultCommissionPercent}%` : "—"}</p>
              <p>Joined: {when(detail.createdAt)}</p>
              <p>Status: {detail.active ? "Active" : "Inactive"}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Orders" value={detail.totalOrders} />
              <Stat label="Delivered" value={detail.successfulOrders} />
              <Stat label="Cancelled / refunded" value={detail.cancelledOrRefundedOrders} />
              <Stat label="Sales" value={detail.totalSales} money />
              <Stat label="Pending" value={detail.pendingCommission} money />
              <Stat label="Approved" value={detail.approvedCommission} money />
              <Stat label="Paid" value={detail.paidCommission} money />
              <Stat label="Total commission" value={detail.totalCommission} money />
            </div>

            <div>
              <p className="mb-1 font-medium">Coupons</p>
              {detail.coupons.length === 0 ? (
                <p className="text-gray-400">No coupon yet.</p>
              ) : (
                detail.coupons.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5">
                    <span>
                      <span className="font-mono font-semibold text-brand-800">{c.code}</span>{" "}
                      <span className="text-gray-500">
                        {c.summary} · commission{" "}
                        {c.commissionType === "FIXED" ? `₹${c.commissionValue}` : `${c.commissionValue ?? "default"}%`} ·{" "}
                        {c.statusLabel}
                      </span>
                    </span>
                    <span className="flex gap-3">
                      <button onClick={() => openEditCoupon(c)} className="text-brand-700 underline">Edit</button>
                      <button onClick={() => toggleCoupon(c)} className="text-gray-600 underline">
                        {c.active ? "Disable" : "Enable"}
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>

            <div>
              <p className="mb-1 font-medium">Assigned products</p>
              {detail.assignedProducts.length === 0 ? (
                <p className="text-gray-400">None - the coupon works on any product.</p>
              ) : (
                <p>{detail.assignedProducts.map((p) => p.name).join(", ")}</p>
              )}
            </div>

            <div>
              <p className="mb-1 font-medium">Recent sales</p>
              {detail.recentCommissions.length === 0 ? (
                <p className="text-gray-400">No sales yet.</p>
              ) : (
                detail.recentCommissions.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5">
                    <span>
                      {r.orderNumber ?? `#${r.orderId}`} · {r.productSummary ?? "—"} · <Price value={r.saleAmount} />
                    </span>
                    <span className="flex items-center gap-2">
                      <Price value={r.commissionAmount} /> <Pill status={r.commissionStatus} />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- payout modal ---------- */}
      <Modal open={!!payFor} title={payFor ? `Pay ${payFor.name}` : ""} onClose={() => setPayFor(null)}>
        {payFor && (
          <div className="space-y-3 text-sm">
            <p>
              This marks every <b>approved</b> commission of {payFor.name} (
              <Price value={payFor.approvedCommission} />) as <b>PAID</b>. Make the actual bank/UPI transfer first,
              then record it here.
            </p>
            <input
              className="ns-input w-full"
              placeholder="Payout reference (UPI / bank txn id)"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
            />
            <input
              className="ns-input w-full"
              placeholder="Note (optional)"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className="ns-btn-outline">Cancel</button>
              <button onClick={doPayout} className="ns-btn-primary">Record payout</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
