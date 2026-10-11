"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDecideReturn, adminGetReturns } from "../../../api";
import { AdminPageHeader, AdminSidebar, Loading, SafeImage, useAdminSession } from "../../../components";
import { RETURN_LABEL, ReturnStatusChip, errMsg } from "../../../lifecycle";
import { useToast } from "../../../ui";
import type { ItemReturn } from "../../../types";

// Returns & refunds.
//  - The company that sold the item decides (review -> approve/reject -> refund).
//  - The Super Admin sees every return and its decision live, but cannot decide
//    a partner company's return (products with no company are decided by the Super Admin).
//  - Nothing refunds automatically: "Refunded" is recorded only after the money
//    has really been returned to the customer.

const NEXT: Record<string, { status: string; label: string; needsNote?: boolean; tone: string }[]> = {
  REQUESTED: [{ status: "UNDER_REVIEW", label: "Start review", tone: "bg-blue-600" }],
  UNDER_REVIEW: [
    { status: "APPROVED", label: "Approve return", tone: "bg-green-600" },
    { status: "REJECTED", label: "Reject return", needsNote: true, tone: "bg-red-600" },
  ],
  APPROVED: [{ status: "REFUND_PROCESSING", label: "Start refund", tone: "bg-indigo-600" }],
  REFUND_PROCESSING: [{ status: "REFUNDED", label: "Mark refunded", tone: "bg-emerald-600" }],
};

const FILTERS = ["ALL", "REQUESTED", "UNDER_REVIEW", "APPROVED", "REFUND_PROCESSING", "REFUNDED", "REJECTED"];

export default function AdminReturnsPage() {
  const { token, checked, role, companyId, companyName } = useAdminSession();
  const { success, error: toastError } = useToast();
  const isCompany = role === "COMPANY_ADMIN";

  const [rows, setRows] = useState<ItemReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      setRows(await adminGetReturns(token));
    } catch (e) {
      setError(errMsg(e, "Could not load returns."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => (filter === "ALL" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);

  /** Mirrors the server: company -> its own returns; super admin -> returns of its own (company-less) products. */
  const canDecide = (r: ItemReturn) => (isCompany ? r.companyId === companyId : r.companyId == null);

  async function decide(r: ItemReturn, status: string, needsNote?: boolean) {
    if (!token) return;
    const note = (notes[r.id] ?? "").trim();
    if (needsNote && note.length < 5) {
      toastError("Please tell the customer why the return is rejected.");
      return;
    }
    setBusy(r.id);
    try {
      await adminDecideReturn(token, r.id, { status, note: note || undefined });
      success(`Return marked: ${RETURN_LABEL[status] ?? status}`);
      setNotes((n) => ({ ...n, [r.id]: "" }));
      await load();
    } catch (e) {
      toastError(errMsg(e, "Could not update this return."));
    } finally {
      setBusy(null);
    }
  }

  if (!checked || !token) return <Loading />;

  return (
    <div className="flex flex-col lg:flex-row">
      <AdminSidebar />
      <div className="adm-page">
        <AdminPageHeader
          eyebrow={isCompany ? (companyName ?? "Your company") : "Marketplace"}
          title="Returns & refunds"
          subtitle={
            isCompany
              ? "Review each request, decide fairly and record the refund once the money has been returned."
              : "Follow every return and its decision live. Partner companies decide their own returns."
          }
        />
        <div className="adm-body">
          <div className="mb-4 flex gap-1.5 overflow-x-auto rounded-full border border-brand-100 bg-white p-1.5 shadow-card">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`adm-tab ${filter === f ? "adm-tab-active" : ""}`}>
                {f === "ALL" ? "All" : RETURN_LABEL[f]}
                {f !== "ALL" && <span className="ml-1 text-xs opacity-70">{rows.filter((r) => r.status === f).length}</span>}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {loading ? (
            <Loading />
          ) : shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-brand-200 bg-white p-8 text-center text-coffee-700/70">
              No returns {filter === "ALL" ? "yet" : "in this state"}.
            </p>
          ) : (
            <div className="space-y-4">
              {shown.map((r) => {
                const actions = NEXT[r.status] ?? [];
                const mine = canDecide(r);
                return (
                  <article key={r.id} className="ns-card p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <SafeImage fit="blur" src={r.productImageUrl} alt="" className="h-16 w-16 shrink-0 overflow-hidden rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-coffee-900">{r.productName}{r.quantity ? ` × ${r.quantity}` : ""}</p>
                        <p className="text-xs text-coffee-700/70">
                          Order #{r.orderNumber ?? r.orderId} · {r.customerName || "Customer"}
                          {r.customerPhone ? ` · ${r.customerPhone}` : ""} · {new Date(r.createdAt).toLocaleDateString("en-IN")}
                        </p>
                        {!isCompany && <p className="text-xs text-coffee-700/70">Seller: {r.companyName}</p>}
                      </div>
                      <ReturnStatusChip status={r.status} />
                    </div>

                    <div className="mt-3 rounded-xl bg-brand-50/50 p-3 text-sm">
                      <p><span className="font-medium text-coffee-900">Reason:</span> {r.reasonLabel}</p>
                      {r.details && <p className="mt-1 whitespace-pre-line text-coffee-700">{r.details}</p>}
                      {r.evidenceUrls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.evidenceUrls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer" aria-label="Open customer photo">
                              <SafeImage fit="blur" src={u} alt="Customer photo" className="h-20 w-20 overflow-hidden rounded-lg border border-brand-100" />
                            </a>
                          ))}
                        </div>
                      )}
                      {r.refundAmount != null && <p className="mt-2 text-xs text-coffee-700/70">Refund value if approved: ₹{r.refundAmount}</p>}
                      {r.decisionNote && <p className="mt-2 text-sm"><span className="font-medium">Note:</span> {r.decisionNote}</p>}
                    </div>

                    {actions.length > 0 &&
                      (mine ? (
                        <div className="mt-3 space-y-2">
                          <input
                            value={notes[r.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            placeholder={r.status === "UNDER_REVIEW" ? "Note for the customer (required to reject)" : "Optional note / refund reference"}
                            className="ns-input"
                          />
                          <div className="flex flex-wrap gap-2">
                            {actions.map((a) => (
                              <button
                                key={a.status}
                                onClick={() => decide(r, a.status, a.needsNote)}
                                disabled={busy === r.id}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 ${a.tone}`}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-lg bg-gold-50 p-3 text-sm text-coffee-700">
                          🔒 {r.decidedBy ?? "The seller"} decides this return. You can follow it live here.
                        </p>
                      ))}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
