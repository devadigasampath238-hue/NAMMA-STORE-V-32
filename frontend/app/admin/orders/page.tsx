"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  adminAdvanceFulfillment,
  adminGetOrders,
  adminListCompanies,
  adminOrderTracking,
} from "../../../api";
import { AdminPageHeader, AdminSidebar, AdminTable, Loading, SafeImage, useAdminSession } from "../../../components";
import { resolveImageUrl } from "../../../imageUrl";
import { StepBar, STEP_LABEL, TrackingTimeline, errMsg, nextStep } from "../../../lifecycle";
import { useToast } from "../../../ui";
import type { Company, Order, OrderItem } from "../../../types";

/* =========================================================
   ORDERS - per-seller fulfilment

   An order can hold products from several companies. Each
   company moves ITS OWN items one step at a time:
     Placed -> Confirmed -> Packed -> Shipped -> Out for delivery -> Delivered
   Products with no company (the Super Admin's own catalogue)
   are moved by the Super Admin through the very same steps.
   The Super Admin can follow every seller's progress live but
   can never change a company's shipment. The server enforces all
   of this; the buttons below just mirror it.
========================================================= */

type Group = {
  key: string;
  companyId: number | null;
  name: string;
  items: OrderItem[];
  status: string; // slowest line in the group
};

const FLOW = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

function groupItems(order: Order, companyNames: Map<number, string>): Group[] {
  const map = new Map<string, Group>();
  for (const item of order.items) {
    const key = item.companyId == null ? "house" : String(item.companyId);
    const name = item.companyId == null ? "Namma Store" : (companyNames.get(item.companyId) ?? `Company #${item.companyId}`);
    const g = map.get(key) ?? { key, companyId: item.companyId ?? null, name, items: [], status: "DELIVERED" };
    g.items.push(item);
    map.set(key, g);
  }
  for (const g of map.values()) {
    // slowest non-cancelled line decides the group's step
    const active = g.items.filter((i) => (i.itemStatus ?? order.status) !== "CANCELLED");
    if (active.length === 0) {
      g.status = "CANCELLED";
    } else {
      g.status = active
        .map((i) => i.itemStatus ?? order.status)
        .reduce((low, s) => (FLOW.indexOf(s) < FLOW.indexOf(low) ? s : low), "DELIVERED");
    }
  }
  return [...map.values()];
}

export default function AdminOrdersPage() {
  const { token, checked, role, companyId, companyName } = useAdminSession();
  const { success, error: toastError } = useToast();
  const isCompany = role === "COMPANY_ADMIN";

  const [orders, setOrders] = useState<Order[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [trackTick, setTrackTick] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoadError("");
    try {
      const [o, c] = await Promise.all([
        adminGetOrders(token),
        isCompany ? Promise.resolve([] as Company[]) : adminListCompanies(token).catch(() => [] as Company[]),
      ]);
      setOrders(o);
      setCompanies(c);
    } catch (e) {
      setLoadError(errMsg(e, "Could not load orders."));
    } finally {
      setLoading(false);
    }
  }, [token, isCompany]);

  useEffect(() => {
    load();
  }, [load]);

  const names = useMemo(() => {
    const m = new Map<number, string>();
    companies.forEach((c) => m.set(c.id, c.name));
    if (isCompany && companyId != null) m.set(companyId, companyName ?? "Your company");
    return m;
  }, [companies, isCompany, companyId, companyName]);

  /** Mirrors the server rule: company -> its own lines, super admin -> company-less lines. */
  const canAct = (g: Group) => (isCompany ? g.companyId === companyId : g.companyId == null);

  async function advance(order: Order, g: Group) {
    if (!token) return;
    const next = nextStep(g.status);
    if (!next) return;
    setBusyKey(`${order.id}:${g.key}`);
    try {
      await adminAdvanceFulfillment(token, order.id, next);
      success(`Marked as ${STEP_LABEL[next]}`);
      setTrackTick((t) => t + 1);
      await load();
    } catch (e) {
      toastError(errMsg(e, "Could not update this shipment."));
    } finally {
      setBusyKey(null);
    }
  }

  if (!checked || !token) return <Loading />;

  return (
    <div className="flex flex-col lg:flex-row">
      <AdminSidebar />
      <div className="adm-page">
        <AdminPageHeader
          eyebrow={isCompany ? (companyName ?? "Your company") : "Marketplace"}
          title={isCompany ? "My orders" : "All orders"}
          subtitle={
            isCompany
              ? "Update your shipments one step at a time. Customers and the Namma Store team see the same live progress."
              : "Follow every seller's shipment live. Partner companies update their own items; you update products from your own catalogue."
          }
          actions={
            <Link href="/admin/returns" className="ns-btn-outline">
              Returns &amp; refunds
            </Link>
          }
        />
        <div className="adm-body">
          {loadError && (
            <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </p>
          )}
          {loading ? (
            <Loading />
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const groups = groupItems(order, names);
                const open = expanded === order.id;
                return (
                  <article key={order.id} className="ns-card overflow-hidden">
                    <button
                      onClick={() => setExpanded(open ? null : order.id)}
                      aria-expanded={open}
                      className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                    >
                      <div>
                        <p className="font-semibold text-coffee-900">
                          Order #{order.orderNumber ?? order.id}
                          {order.multiCompany && (
                            <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-medium text-gold-600">
                              also contains other sellers&apos; items
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-coffee-700/70">
                          {new Date(order.createdAt).toLocaleDateString("en-IN")} · {order.customerName || "Customer"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">
                          {STEP_LABEL[order.status] ?? order.status}
                        </span>
                        <span className="font-display text-lg font-bold text-coffee-900">
                          ₹{Number(isCompany ? (order.companyTotal ?? order.totalAmount) : order.totalAmount).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </button>

                    {open && (
                      <div className="ns-animate-fade-in space-y-5 border-t border-brand-50 p-4">
                        {/* ---- one block per seller ---- */}
                        {groups.map((g) => {
                          const mine = canAct(g);
                          const next = nextStep(g.status);
                          const busy = busyKey === `${order.id}:${g.key}`;
                          const awaitingPayment = order.paymentMethod !== "COD" && order.paymentStatus !== "PAID";
                          return (
                            <section key={g.key} className="rounded-xl border border-brand-100 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium text-coffee-900">
                                  {g.companyId == null ? "Namma Store (own catalogue)" : g.name}
                                  <span className="ml-2 text-xs font-normal text-coffee-700/70">
                                    {g.items.length} item{g.items.length === 1 ? "" : "s"}
                                  </span>
                                </p>
                                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                                  {STEP_LABEL[g.status] ?? g.status}
                                </span>
                              </div>

                              <div className="mt-3 overflow-x-auto pb-1">
                                <StepBar status={g.status} />
                              </div>

                              {g.status === "CANCELLED" ? null : awaitingPayment && next ? (
                                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                                  ⏳ Waiting for the customer&apos;s online payment. Shipment steps unlock as soon as it is paid.
                                </p>
                              ) : next && mine ? (
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <button
                                    onClick={() => advance(order, g)}
                                    disabled={busy || order.status === "CANCELLED"}
                                    className="ns-btn-primary kar-shine"
                                  >
                                    {busy ? "Updating…" : `Mark as ${STEP_LABEL[next]}`}
                                  </button>
                                  <span className="text-xs text-coffee-700/70">
                                    Steps go in order and can&apos;t be skipped.
                                  </span>
                                </div>
                              ) : !next ? (
                                <p className="mt-3 text-sm font-medium text-green-700">Delivered ✓</p>
                              ) : (
                                <p className="mt-3 rounded-lg bg-gold-50 p-3 text-sm text-coffee-700">
                                  🔒 {g.name} updates this shipment. You can follow it live here, but only the company can change it.
                                </p>
                              )}

                              <ul className="mt-3 divide-y divide-brand-50 text-sm">
                                {g.items.map((item) => (
                                  <li key={item.id} className="flex items-center gap-3 py-2">
                                    <SafeImage
                                      fit="blur"
                                      src={item.productImageUrl}
                                      alt=""
                                      className="h-10 w-10 shrink-0 overflow-hidden rounded-lg"
                                    />
                                    <span className="min-w-0 flex-1 truncate text-coffee-900">{item.productName}</span>
                                    <span className="text-coffee-700/70">× {item.quantity}</span>
                                    <span className="font-medium">₹{item.finalPrice}</span>
                                  </li>
                                ))}
                              </ul>
                            </section>
                          );
                        })}

                        {/* ---- delivery details ---- */}
                        <div className="grid gap-1 text-sm text-coffee-700 sm:grid-cols-2">
                          <p>
                            <span className="font-medium text-coffee-900">Customer:</span> {order.customerName || "-"}
                            {order.customerPhone ? ` · ${order.customerPhone}` : ""}
                          </p>
                          <p>
                            <span className="font-medium text-coffee-900">Payment:</span> {order.paymentMethod || "COD"} (
                            {order.paymentStatus || "PENDING"})
                          </p>
                          <p className="sm:col-span-2">
                            <span className="font-medium text-coffee-900">Ship to:</span> {order.shippingAddressSnapshot || "-"}
                          </p>
                          {!isCompany && (
                            <p className="sm:col-span-2 text-coffee-700/70">
                              Subtotal ₹{order.subtotal} · Discount ₹{order.discountAmount} · Delivery ₹{order.deliveryCharge} ·{" "}
                              <span className="font-medium text-coffee-900">Total ₹{order.totalAmount}</span>
                              {order.couponCode ? ` · Coupon ${order.couponCode}` : ""}
                            </p>
                          )}
                        </div>

                        {/* ---- customisation details (unchanged behaviour) ---- */}
                        {order.items.some((i) => i.customText || i.customImageUrl || i.selectedColor || i.selectedSize || i.printPosition) && (
                          <AdminTable
                            headers={["Product", "Qty", "Customization"]}
                            rows={order.items.map((item) => [
                              item.productName,
                              item.quantity,
                              <div key={item.id} className="text-sm">
                                <div>
                                  {[
                                    item.customText && `Text: "${item.customText}"`,
                                    item.selectedColor && `Color: ${item.selectedColor}`,
                                    item.selectedSize && `Size: ${item.selectedSize}`,
                                    item.printPosition && `Position: ${item.printPosition}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || (item.customImageUrl ? "" : "-")}
                                </div>
                                {item.customImageUrl && (
                                  <a
                                    href={resolveImageUrl(item.customImageUrl)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-flex items-center gap-2 text-brand-700 underline"
                                  >
                                    <SafeImage src={item.customImageUrl} alt="Uploaded design" className="h-8 w-8 rounded border border-brand-100" />
                                    View design
                                  </a>
                                )}
                              </div>,
                            ])}
                          />
                        )}

                        {/* ---- live tracking ---- */}
                        <div>
                          <p className="mb-2 text-sm font-semibold text-coffee-900">Live tracking</p>
                          <div className="rounded-xl bg-brand-50/50 p-4">
                            <TrackingTimeline load={() => adminOrderTracking(token, order.id)} reloadKey={`${order.id}:${trackTick}`} />
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {orders.length === 0 && !loadError && <p className="text-coffee-700/70">No orders yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
