"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminGetDashboard, adminGetOrders } from "../../api";
import { AdminPageHeader, AdminSidebar, SafeImage, StatCard, useAdminSession } from "../../components";
import {
  ErrorState,
  SkeletonBlock,
  OrderStatusBadge,
  Price,
  formatDate,
  friendlyError,
} from "../../ui";
import type { DashboardStats, Order } from "../../types";
import { AreaChart, Donut, ProgressRow, TopSellers } from "../../dashboardCharts";

export default function AdminDashboardPage() {
  const { token, checked, role, companyName, companyLogoUrl, displayName } = useAdminSession();
  const isCompany = role === "COMPANY_ADMIN";

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      // Both charts below are built from REAL orders. Nothing is invented:
      // if there are no orders, the charts say so rather than drawing a
      // pleasant-looking fake trend.
      const [dashboard, allOrders] = await Promise.all([
        adminGetDashboard(token),
        adminGetOrders(token).catch(() => [] as Order[]),
      ]);
      setStats(dashboard);
      setOrders(allOrders);
    } catch (e) {
      setError(friendlyError(e, "Could not load dashboard statistics."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---- last 14 days of real order data ---- */
  const series = useMemo(() => {
    const days: Array<{ label: string; revenue: number; orders: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 13; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      days.push({
        label: day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        revenue: 0,
        orders: 0,
      });
    }

    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - 13);

    for (const order of orders) {
      if (order.status === "CANCELLED") continue;
      const created = new Date(order.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      created.setHours(0, 0, 0, 0);

      const index = Math.round(
        (created.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (index >= 0 && index < days.length) {
        days[index].revenue += Number(order.totalAmount) || 0;
        days[index].orders += 1;
      }
    }
    return days;
  }, [orders]);

  const hasChartData = series.some((d) => d.orders > 0);

  // Real period-over-period change: last 7 days vs the 7 before (from the same orders).
  const trendOf = (key: "revenue" | "orders"): number | null => {
    const prev = series.slice(0, 7).reduce((n, d) => n + d[key], 0);
    const cur = series.slice(7).reduce((n, d) => n + d[key], 0);
    return prev > 0 ? ((cur - prev) / prev) * 100 : null;
  };
  const totalRevenue14 = series.reduce((n, d) => n + d.revenue, 0);
  const totalOrders14 = series.reduce((n, d) => n + d.orders, 0);
  const avgOrder14 = totalOrders14 > 0 ? totalRevenue14 / totalOrders14 : 0;
  const rupees = (v?: number) =>
    `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  if (!checked || !token) return <SkeletonBlock className="h-64 w-full" />;

  return (
    <div className="flex flex-col md:flex-row">
      <AdminSidebar />

      <div className="adm-page">
        <AdminPageHeader
          eyebrow={isCompany ? "Company portal" : "Namma Store · Control centre"}
          title={isCompany ? `${companyName ?? "Your company"}` : "Marketplace overview"}
          subtitle={
            isCompany
              ? "Your products, orders and sales - only your company's data is ever shown here."
              : `Welcome${displayName ? `, ${displayName}` : ""}. Every number below comes live from the database.`
          }
          actions={
            <>
              <Link href="/admin/orders" className="ns-btn-outline">View orders</Link>
              <Link href="/admin/products" className="ns-btn-primary">
                {isCompany ? "Manage my products" : "Manage products"}
              </Link>
            </>
          }
        />
        <div className="adm-body">

        {isCompany && (
          <div className="kar-lattice relative mb-6 flex items-center gap-4 overflow-hidden rounded-2xl border border-gold-300/50 bg-gradient-to-r from-coffee-900 to-brand-900 p-5 text-white shadow-lift anim-rise">
            {companyLogoUrl ? (
              <SafeImage src={companyLogoUrl} alt="" className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white" />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gold-400 font-display text-2xl font-bold text-coffee-900">
                {(companyName ?? "C").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold-300">You are managing</p>
              <p className="truncate font-display text-xl font-bold md:text-2xl">{companyName ?? "Your company"}</p>
              <p className="text-xs text-brand-100/80">
                Orders containing your products are routed to you and to the Namma Store super admin only.
              </p>
            </div>
          </div>
        )}

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading || !stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <>
            {/* Same screen for both roles: the BACKEND decides the scope. A company
                admin only ever receives their own company's numbers. */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
              <StatCard icon="affiliate" tone="red" label={isCompany ? "Your sales" : "Total revenue"} value={rupees(stats.revenue)} hint="Excludes cancelled orders" trend={trendOf("revenue")} />
              <StatCard icon="orders" tone="coffee" label="Orders" value={stats.totalOrders} hint={`${stats.todaysOrders ?? 0} placed today`} trend={trendOf("orders")} />
              <StatCard icon="products" tone="gold" label="Products" value={stats.totalProducts} hint={`${stats.activeProducts ?? 0} active`} />
              <StatCard icon="users" tone="green" label="Customers" value={stats.totalCustomers ?? 0} hint="Who have ordered" />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 md:mt-4 md:gap-4 lg:grid-cols-4 xl:grid-cols-6">
              <StatCard icon="orders" tone="gold" label="Pending orders" value={stats.pendingOrders} />
              <StatCard icon="orders" tone="green" label="Completed" value={stats.completedOrders} />
              <StatCard icon="orders" tone="coffee" label="Cancelled" value={stats.cancelledOrders} />
              <StatCard icon="products" tone="red" label="Low stock" value={stats.lowStockProducts} />
              <StatCard icon="products" tone="coffee" label="Out of stock" value={stats.outOfStockProducts} />
              {!isCompany && (
                <StatCard
                  icon="companies"
                  tone="gold"
                  label="Companies"
                  value={`${stats.activeCompanies ?? 0} / ${stats.totalCompanies ?? 0}`}
                  hint={`${stats.activeBanners ?? 0} active banners`}
                />
              )}
            </div>

            {/* ---- analytics from the backend ---- */}
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <div className="ns-card p-5">
                <h3 className="mb-3 font-heading font-semibold text-brand-900">Category performance</h3>
                {!stats.categoryPerformance || stats.categoryPerformance.length === 0 ? (
                  <p className="text-sm text-gray-500">No sales yet.</p>
                ) : (
                  <ul className="divide-y divide-brand-50 text-sm">
                    {stats.categoryPerformance.map((c) => (
                      <li key={c.name} className="flex items-center justify-between gap-3 py-2">
                        <span className="truncate">{c.name}</span>
                        <span className="whitespace-nowrap text-gray-500">{rupees(c.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {stats.scope !== "COMPANY" && (
                <div className="ns-card p-5 lg:col-span-2">
                  <h3 className="mb-3 font-heading font-semibold text-brand-900">Company-wise sales</h3>
                  {!stats.companySales || stats.companySales.length === 0 ? (
                    <p className="text-sm text-gray-500">No companies yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-gray-500">
                          <tr>
                            <th className="py-1 pr-4">Company</th>
                            <th className="py-1 pr-4">Orders</th>
                            <th className="py-1">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.companySales.map((c) => (
                            <tr key={c.companyId} className="border-t border-brand-50">
                              <td className="py-2 pr-4">{c.name}</td>
                              <td className="py-2 pr-4">{c.orders}</td>
                              <td className="py-2">{rupees(c.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ---- sales analytic + order status ---- */}
            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="ns-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-bold text-coffee-900">Sales analytic</h3>
                  <div className="flex gap-1 rounded-full border border-brand-100 bg-ivory p-1">
                    {(["revenue", "orders"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMetric(m)}
                        className={`adm-tab !px-3 !py-1 text-xs capitalize ${metric === m ? "adm-tab-active" : ""}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 divide-x divide-brand-100 text-sm">
                  <div className="pr-3"><p className="text-xs text-coffee-700/70">Revenue · 14 days</p><p className="font-display text-lg font-bold text-coffee-900">{rupees(totalRevenue14)}</p></div>
                  <div className="px-3"><p className="text-xs text-coffee-700/70">Orders · 14 days</p><p className="font-display text-lg font-bold text-coffee-900">{totalOrders14}</p></div>
                  <div className="pl-3"><p className="text-xs text-coffee-700/70">Avg order value</p><p className="font-display text-lg font-bold text-coffee-900">{rupees(avgOrder14)}</p></div>
                </div>

                <div className="mt-4">
                  {hasChartData ? (
                    <AreaChart
                      data={series.map((d) => ({ label: d.label, value: metric === "revenue" ? d.revenue : d.orders }))}
                      formatValue={metric === "revenue" ? rupees : (v) => `${Math.round(v)} orders`}
                      color={metric === "revenue" ? "#BF2A1E" : "#D99A00"}
                    />
                  ) : (
                    <p className="py-14 text-center text-sm text-coffee-700/75">No orders in the last 14 days yet.</p>
                  )}
                </div>
              </div>

              <div className="ns-card p-5">
                <h3 className="mb-4 font-display text-xl font-bold text-coffee-900">Order status</h3>
                <Donut
                  centerLabel="orders"
                  centerValue={stats.totalOrders}
                  segments={[
                    { label: "In progress", value: stats.pendingOrders, color: "#F5B90A" },
                    { label: "Delivered", value: stats.completedOrders, color: "#2F8F5B" },
                    { label: "Cancelled", value: stats.cancelledOrders, color: "#7A1816" },
                  ]}
                />
              </div>
            </div>

            {/* ---- top sellers + stock alerts ---- */}
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="ns-card p-5">
                <h3 className="font-display text-xl font-bold text-coffee-900">Top selling products</h3>
                <div className="mt-3">
                  <TopSellers items={stats.topProducts ?? []} formatMoney={rupees} />
                </div>
              </div>

              <div className="ns-card p-5">
                <h3 className="mb-4 font-display text-xl font-bold text-coffee-900">Inventory health</h3>
                <div className="space-y-4">
                  <ProgressRow label="Active products" value={stats.activeProducts ?? 0} total={stats.totalProducts} color="#2F8F5B" />
                  <ProgressRow label="Low stock" value={stats.lowStockProducts} total={stats.totalProducts} color="#F5B90A" />
                  <ProgressRow label="Out of stock" value={stats.outOfStockProducts} total={stats.totalProducts} color="#BF2A1E" />
                  <ProgressRow label="Orders awaiting delivery" value={stats.pendingOrders} total={Math.max(stats.totalOrders, 1)} color="#D99A00" />
                </div>
                <Link href="/admin/products" className="mt-5 inline-flex text-sm font-semibold text-brand-700 hover:underline">
                  Manage inventory →
                </Link>
              </div>
            </div>

            {/* ---- recent orders ---- */}
            <h2 className="ns-section-title mb-3 mt-8 !text-lg">Recent orders</h2>
            {stats.recentOrders.length === 0 ? (
              <p className="text-sm text-gray-500">No orders yet.</p>
            ) : (
              <div className="ns-card divide-y divide-brand-50">
                {stats.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href="/admin/orders"
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition hover:bg-brand-50/50"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-brand-900">
                        #{order.orderNumber ?? order.id}
                      </span>
                      <span className="ml-2 text-sm text-gray-500">
                        {order.customerName || "Customer"} ·{" "}
                        {order.itemCount ?? order.items.length} item(s) ·{" "}
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <OrderStatusBadge status={order.status} />
                      <Price value={order.totalAmount} className="font-semibold text-brand-800" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="ns-card p-5">
      <h3 className="mb-4 font-heading text-sm font-semibold uppercase tracking-wide text-brand-900">
        {title}
      </h3>
      {empty ? (
        <p className="py-10 text-center text-sm text-gray-400">
          No orders in this period yet.
        </p>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Inline SVG bar chart. A charting library would be a heavy dependency for
 * two bar charts, and recharts is not installed in this project.
 */
function BarChart({
  data,
  formatValue,
  accent = "#E97A0C",
}: {
  data: Array<{ label: string; value: number }>;
  formatValue: (value: number) => string;
  accent?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 520;
  const height = 180;
  const padding = { top: 10, bottom: 28, left: 8, right: 8 };
  const chartHeight = height - padding.top - padding.bottom;
  const slot = (width - padding.left - padding.right) / data.length;
  const barWidth = Math.max(6, slot * 0.55);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full min-w-[420px]"
        role="img"
        aria-label={data.map((d) => `${d.label}: ${formatValue(d.value)}`).join(", ")}
      >
        {/* gridlines */}
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + chartHeight * fraction}
            y2={padding.top + chartHeight * fraction}
            stroke="#f0e2d2"
            strokeWidth="1"
          />
        ))}

        {data.map((d, i) => {
          const barHeight = (d.value / max) * chartHeight;
          const x = padding.left + i * slot + (slot - barWidth) / 2;
          const y = padding.top + chartHeight - barHeight;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, d.value > 0 ? 2 : 0)}
                rx="3"
                fill={accent}
                opacity={0.85}
              >
                <title>{`${d.label}: ${formatValue(d.value)}`}</title>
              </rect>
              {/* label every other tick so they never overlap */}
              {i % 2 === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#9a8574"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
