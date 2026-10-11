"use client";

import { PayNowButton, payForOrder } from "../../razorpay";
import { getStoredReferral } from "../../referral";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  checkServiceability,
  checkout,
  getAddresses,
  getCart,
  getCartSummary,
  getProduct,
  validateCoupon,
} from "../../api";
import { Loading, SafeImage, useAuth, useCart } from "../../components";
import {
  EmptyState,
  ErrorState,
  CheckIcon,
  CloseIcon,
  CartIcon,
  Spinner,
  Price,
  SuccessCheck,
  Confetti,
  useToast,
  friendlyError,
  deliveryWindow,
} from "../../ui";
import type {
  Address,
  CartItem,
  CartSummary,
  Order,
  PaymentMethod,
  Product,
} from "../../types";

/* =========================================================
   Four steps: Address -> Summary -> Payment -> Confirmation.
========================================================= */
const STEPS = ["Address", "Order Summary", "Payment", "Confirmation"] as const;
type Step = 0 | 1 | 2 | 3;

const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  hint: string;
  icon: string;
}> = [
  { id: "COD", label: "Cash on Delivery", hint: "Pay when your order arrives", icon: "💵" },
  { id: "ONLINE", label: "Pay online", hint: "UPI, cards, net banking & wallets - secure Razorpay checkout", icon: "🔒" },
];

interface AddressForm {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
}

const emptyAddress: AddressForm = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  addressLine: "",
  city: "",
  state: "",
  pincode: "",
};

export default function CheckoutPage() {
  const router = useRouter();
  const { appUser, loading: authLoading } = useAuth();
  const { refreshCart } = useCart();
  const { success, error: toastError } = useToast();

  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [items, setItems] = useState<CartItem[]>([]);
  const [productMap, setProductMap] = useState<Map<number, Product>>(new Map());
  const [summary, setSummary] = useState<CartSummary | null>(null);

  const [form, setForm] = useState<AddressForm>(emptyAddress);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AddressForm, string>>>({});
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);

  // coupon
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponOk, setCouponOk] = useState(false);
  const [couponBusy, setCouponBusy] = useState(false);

  // payment
  const [method, setMethod] = useState<PaymentMethod>("COD");
  // Card / UPI / bank details are entered inside Razorpay's secure window,
  // never on this page, so nothing sensitive is collected or stored here.
  const [payNote, setPayNote] = useState("");
  const [processing, setProcessing] = useState(false);
  // Orders are only accepted for serviceable pincodes (the server enforces it too).
  const [deliverable, setDeliverable] = useState<boolean | null>(null);
  const [deliverMsg, setDeliverMsg] = useState("");
  const [placeError, setPlaceError] = useState("");

  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  /* ---------------- load cart ---------------- */
  const load = useCallback(
    async (couponCode?: string | null) => {
      if (!appUser) {
        setLoading(false);
        return;
      }
      try {
        const cart = await getCart(appUser.id);
        setItems(cart);

        const ids = Array.from(
          new Set(cart.filter((i) => i.productId).map((i) => i.productId as number))
        );
        const products = await Promise.all(ids.map((id) => getProduct(id).catch(() => null)));
        setProductMap(
          new Map(products.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p]))
        );

        setSummary(await getCartSummary(appUser.id, couponCode ?? undefined));
      } catch (e) {
        setLoadError(friendlyError(e, "We could not load your checkout."));
      } finally {
        setLoading(false);
      }
    },
    [appUser]
  );

  useEffect(() => {
    if (!authLoading) load(appliedCoupon);
    // appliedCoupon changes go through applyCoupon(), which reloads itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, appUser]);

  // Prefill from the account and any saved default address.
  useEffect(() => {
    if (!appUser) return;
    setForm((current) => ({
      ...current,
      customerName: current.customerName || appUser.displayName || "",
      customerEmail: current.customerEmail || appUser.email || "",
      customerPhone: current.customerPhone || appUser.phone || "",
    }));

    getAddresses(appUser.id)
      .then((list) => {
        setSavedAddresses(list);
        const preferred = list.find((a) => a.isDefault) ?? list[0];
        if (preferred) applySavedAddress(preferred);
      })
      .catch(() => setSavedAddresses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser]);

  function applySavedAddress(address: Address) {
    setForm((current) => ({
      ...current,
      customerName: address.fullName || current.customerName,
      customerPhone: address.phone || current.customerPhone,
      addressLine: [address.houseBuilding, address.street, address.area, address.landmark]
        .filter(Boolean)
        .join(", "),
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode || "",
    }));
  }

  /* ---------------- validation ---------------- */
  function validateAddress(): boolean {
    const errors: Partial<Record<keyof AddressForm, string>> = {};

    if (!form.customerName.trim()) errors.customerName = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(form.customerEmail.trim()))
      errors.customerEmail = "Please enter a valid email address.";
    if (!/^[6-9]\d{9}$/.test(form.customerPhone.replace(/\D/g, "")))
      errors.customerPhone = "Please enter a valid 10-digit mobile number.";
    if (form.addressLine.trim().length < 8)
      errors.addressLine = "Please enter your full address.";
    if (!form.city.trim()) errors.city = "Please enter your city.";
    if (!form.state.trim()) errors.state = "Please enter your state.";
    if (!/^\d{6}$/.test(form.pincode.trim())) errors.pincode = "PIN code must be 6 digits.";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /* ---------------- coupon ---------------- */
  async function applyCoupon() {
    if (!appUser) return;
    const code = couponInput.trim().toUpperCase();
    if (!code) return;

    setCouponBusy(true);
    setCouponMessage(null);
    try {
      // Preview only: the server recomputes the real discount at checkout.
      const result = await validateCoupon(code, appUser.id);
      setCouponOk(result.valid);
      setCouponMessage(result.message ?? null);

      if (result.valid) {
        setAppliedCoupon(code);
        await load(code);
        success(`Coupon ${code} applied`);
      } else {
        setAppliedCoupon(null);
        await load(null);
      }
    } catch (e) {
      setCouponOk(false);
      setCouponMessage(friendlyError(e, "We could not check that coupon."));
    } finally {
      setCouponBusy(false);
    }
  }

  async function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponMessage(null);
    setCouponOk(false);
    await load(null);
    success("Coupon removed");
  }

  /* ---------------- payment validation ---------------- */
  function validatePayment(): string | null {
    // Payment details are collected by Razorpay's own window, so there is nothing to check here.
    return null;
  }

  /* ---------------- place order ---------------- */
  useEffect(() => {
    const pin = form.pincode.trim();
    if (!/^\d{6}$/.test(pin)) {
      setDeliverable(null);
      return;
    }
    let cancelled = false;
    checkServiceability(pin)
      .then((r) => {
        if (cancelled) return;
        setDeliverable(!!r.serviceable);
        setDeliverMsg(r.message ?? "");
      })
      .catch(() => !cancelled && setDeliverable(null)); // can't tell -> let the server decide
    return () => {
      cancelled = true;
    };
  }, [form.pincode]);

  async function placeOrder() {
    if (!appUser) return;

    const paymentProblem = validatePayment();
    if (paymentProblem) {
      setPlaceError(paymentProblem);
      return;
    }

    setPlaceError("");
    setProcessing(true);

    try {
      const order = await checkout({
        userId: appUser.id,
        paymentMethod: method,
        couponCode: appliedCoupon ?? undefined,
        referralCode: getStoredReferral(),
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerPhone: form.customerPhone.trim(),
        addressLine: form.addressLine.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
      });

      // The order is committed (and the cart emptied) whatever happens next.
      await refreshCart();
      setPayNote("");

      if (method === "ONLINE") {
        const outcome = await payForOrder(
          order,
          { name: form.customerName.trim(), email: form.customerEmail.trim(), contact: form.customerPhone.trim() },
          { onAttemptFailed: (m) => setPlaceError(m) }
        );
        if (outcome.status === "paid") {
          setPlacedOrder({ ...order, paymentStatus: "PAID" });
          success("Payment received - order confirmed");
        } else {
          // Saved but unpaid: the customer can pay now or later from My Orders.
          setPlacedOrder(order);
          setPayNote(
            outcome.status === "failed"
              ? outcome.message
              : "Payment was cancelled. Your order is saved - complete the payment whenever you like."
          );
        }
      } else {
        setPlacedOrder(order);
        success("Order placed successfully");
      }
      setStep(3);
    } catch (e) {
      setPlaceError(friendlyError(e, "We could not place your order. Please try again."));
      toastError("Order could not be placed");
    } finally {
      setProcessing(false);
    }
  }

  /* ---------------- render guards ---------------- */
  if (authLoading || loading) return <Loading label="Preparing checkout…" />;

  if (!appUser) {
    return (
      <EmptyState
        title="Sign in to check out"
        message="You need an account so we can save your order."
        actionLabel="Sign In"
        actionHref="/login"
        icon={<CartIcon className="h-9 w-9" />}
      />
    );
  }

  if (loadError) return <ErrorState message={loadError} onRetry={() => load(appliedCoupon)} />;

  if (step === 3 && placedOrder) {
    return (
      <OrderSuccess
        order={placedOrder}
        note={payNote}
        onPaid={() => {
          setPayNote("");
          setPlacedOrder({ ...placedOrder, paymentStatus: "PAID" });
        }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        message="Add something to it before checking out."
        actionLabel="Browse Products"
        actionHref="/products"
        icon={<CartIcon className="h-9 w-9" />}
      />
    );
  }

  return (
    <div>
      <h1 className="ns-section-title mb-6">Checkout</h1>

      <StepIndicator current={step} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {/* ---------------- STEP 1: ADDRESS ---------------- */}
          {step === 0 && (
            <section className="ns-panel ns-animate-fade-up p-5">
              <h2 className="mb-4 font-heading text-lg font-semibold text-brand-900">
                Delivery Address
              </h2>

              {savedAddresses.length > 0 && (
                <div className="mb-5">
                  <p className="ns-label">Use a saved address</p>
                  <div className="flex flex-wrap gap-2">
                    {savedAddresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => applySavedAddress(a)}
                        className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs text-brand-800 transition hover:bg-brand-50"
                      >
                        {a.fullName} · {a.city} {a.isDefault && "(default)"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full name"
                  value={form.customerName}
                  error={formErrors.customerName}
                  onChange={(v) => setForm({ ...form, customerName: v })}
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.customerEmail}
                  error={formErrors.customerEmail}
                  onChange={(v) => setForm({ ...form, customerEmail: v })}
                />
                <Field
                  label="Phone"
                  inputMode="numeric"
                  value={form.customerPhone}
                  error={formErrors.customerPhone}
                  onChange={(v) => setForm({ ...form, customerPhone: v.replace(/\D/g, "").slice(0, 10) })}
                />
                <Field
                  label="PIN code"
                  inputMode="numeric"
                  value={form.pincode}
                  error={formErrors.pincode}
                  onChange={(v) => setForm({ ...form, pincode: v.replace(/\D/g, "").slice(0, 6) })}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Address"
                    textarea
                    value={form.addressLine}
                    error={formErrors.addressLine}
                    onChange={(v) => setForm({ ...form, addressLine: v })}
                    placeholder="House / building, street, area, landmark"
                  />
                </div>
                <Field
                  label="City"
                  value={form.city}
                  error={formErrors.city}
                  onChange={(v) => setForm({ ...form, city: v })}
                />
                <Field
                  label="State"
                  value={form.state}
                  error={formErrors.state}
                  onChange={(v) => setForm({ ...form, state: v })}
                />
              </div>

              <button
                onClick={() => {
                  if (validateAddress()) setStep(1);
                }}
                className="ns-btn-primary mt-6 w-full sm:w-auto"
              >
                Continue to Order Summary
              </button>
            </section>
          )}

          {/* ---------------- STEP 2: SUMMARY ---------------- */}
          {step === 1 && (
            <section className="ns-panel ns-animate-fade-up p-5">
              <h2 className="mb-4 font-heading text-lg font-semibold text-brand-900">
                Order Summary
              </h2>

              <div className="divide-y divide-brand-50">
                {items.map((item) => {
                  const product = item.productId ? productMap.get(item.productId) : undefined;
                  return (
                    <div key={item.id} className="flex gap-3 py-3">
                      <SafeImage
                        src={product?.thumbnailUrl}
                        alt={product?.name ?? "Item"}
                        fit="contain"
                        className="h-16 w-16 shrink-0 rounded-lg border border-brand-100 bg-white"
                        imgClassName="p-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {product?.name ?? "Customised item"}
                        </p>
                        <p className="text-xs text-gray-500">Qty {item.quantity}</p>
                      </div>
                      <Price
                        value={(product?.effectivePrice ?? product?.price ?? 0) * item.quantity}
                        className="shrink-0 text-sm font-semibold text-brand-800"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-lg border border-brand-100 bg-brand-50/40 p-4 text-sm">
                <p className="font-medium text-brand-900">Delivering to</p>
                <p className="mt-1 text-gray-600">
                  {form.customerName}, {form.addressLine}, {form.city}, {form.state} —{" "}
                  {form.pincode}
                </p>
                <p className="text-gray-500">{form.customerPhone}</p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => setStep(0)} className="ns-btn-outline">
                  Back
                </button>
                <button onClick={() => setStep(2)} className="ns-btn-primary flex-1">
                  Continue to Payment
                </button>
              </div>
            </section>
          )}

          {/* ---------------- STEP 3: PAYMENT ---------------- */}
          {step === 2 && (
            <section className="ns-panel ns-animate-fade-up p-5">
              <h2 className="font-heading text-lg font-semibold text-brand-900">Payment</h2>

              <p className="mt-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-coffee-700">
                🔒 Online payments are processed by <strong>Razorpay</strong>. Your card or UPI details go straight to
                them - Namma Store never sees or stores them.
              </p>

              <div className="mt-5 space-y-2">
                {PAYMENT_METHODS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                      method === option.id
                        ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-300"
                        : "border-brand-100 hover:border-brand-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      checked={method === option.id}
                      onChange={() => {
                        setMethod(option.id);
                        setPlaceError("");
                      }}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="text-xl" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                      <span className="block text-xs text-gray-500">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {/* method-specific panels */}
              <div className="mt-5">
                {method === "COD" && (
                  <div className="rounded-lg border border-brand-100 bg-white p-4 text-sm text-gray-600">
                    Pay <Price value={summary?.totalAmount} className="font-semibold text-brand-800" />{" "}
                    in cash when your order is delivered. Please keep exact change ready.
                  </div>
                )}

                {method === "ONLINE" && (
                  <div className="rounded-lg border border-brand-100 bg-white p-4 text-sm text-gray-600">
                    You will pay <Price value={summary?.totalAmount} className="font-semibold text-brand-800" /> in a
                    secure Razorpay window using UPI, a card, net banking or a wallet. Your order is confirmed as soon
                    as the payment succeeds.
                  </div>
                )}
              </div>

              {placeError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {placeError}
                </p>
              )}

              {deliverable === false && (
                <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {deliverMsg || "Sorry, we don't deliver to this pincode yet."} Please go back and use an address we can deliver to.
                </p>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => setStep(1)}
                  disabled={processing}
                  className="ns-btn-outline"
                >
                  Back
                </button>
                <button
                  onClick={placeOrder}
                  disabled={processing || deliverable === false}
                  className="ns-btn-primary flex-1 !py-3"
                >
                  {processing ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Processing…
                    </>
                  ) : method === "COD" ? (
                    "Confirm Order"
                  ) : (
                    <>
                      Pay <Price value={summary?.totalAmount} />
                    </>
                  )}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* ---------------- price rail ---------------- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="ns-panel p-5">
            <h2 className="mb-4 font-heading text-sm font-semibold uppercase tracking-wide text-brand-900">
              Price Details
            </h2>

            {/* coupon box */}
            <div className="mb-4 border-b border-brand-100 pb-4">
              {appliedCoupon && couponOk ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-green-800">
                    <CheckIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate font-medium">{appliedCoupon}</span>
                  </span>
                  <button
                    onClick={removeCoupon}
                    className="shrink-0 text-green-700 transition hover:text-green-900"
                    aria-label="Remove coupon"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <label htmlFor="coupon" className="sr-only">
                    Coupon code
                  </label>
                  <input
                    id="coupon"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyCoupon();
                    }}
                    placeholder="Enter coupon code"
                    className="ns-input !py-2 uppercase"
                  />
                  <button
                    onClick={applyCoupon}
                    disabled={couponBusy || !couponInput.trim()}
                    className="ns-btn-outline shrink-0 !px-4 !py-2 text-sm"
                  >
                    {couponBusy ? "…" : "APPLY"}
                  </button>
                </div>
              )}

              {couponMessage && (
                <p
                  className={`mt-2 text-xs ${couponOk ? "text-green-700" : "text-red-600"}`}
                >
                  {couponMessage}
                </p>
              )}
            </div>

            <dl className="space-y-2.5 text-sm">
              <SummaryRow label={`Subtotal (${summary?.itemCount ?? 0} items)`} value={summary?.subtotal} />
              {(summary?.discountAmount ?? 0) > 0 && (
                <SummaryRow label="Coupon discount" value={summary?.discountAmount} negative />
              )}
              <SummaryRow
                label="Delivery"
                value={summary?.deliveryCharge}
                free={(summary?.deliveryCharge ?? 0) === 0}
              />
            </dl>

            <div className="mt-4 flex items-center justify-between border-t border-brand-100 pt-4">
              <span className="font-heading font-semibold text-brand-900">Total payable</span>
              <Price value={summary?.totalAmount} className="text-xl font-bold text-brand-800" />
            </div>

            <p className="mt-3 text-xs text-gray-400">
              The final amount is recalculated by the server when your order is placed.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ===========================================================
   SUB-COMPONENTS
   =========================================================== */

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol className="ns-no-scrollbar flex gap-2 overflow-x-auto" aria-label="Checkout progress">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition ${
                done
                  ? "border-brand-600 bg-brand-600 text-white"
                  : active
                  ? "border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100"
                  : "border-brand-200 bg-white text-brand-300"
              }`}
            >
              {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={`truncate text-xs sm:text-sm ${
                active ? "font-semibold text-brand-800" : done ? "text-brand-700" : "text-gray-400"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className={`hidden h-0.5 flex-1 sm:block ${done ? "bg-brand-500" : "bg-brand-100"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  textarea = false,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  textarea?: boolean;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "email" | "tel";
}) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="ns-label">
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          className={`ns-input min-h-[80px] ${error ? "!border-red-300 !ring-red-200" : ""}`}
        />
      ) : (
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          className={`ns-input ${error ? "!border-red-300 !ring-red-200" : ""}`}
        />
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  negative = false,
  free = false,
}: {
  label: string;
  value?: number;
  negative?: boolean;
  free?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-600">{label}</dt>
      <dd className={negative ? "font-medium text-green-700" : "text-gray-800"}>
        {free ? (
          <span className="font-medium text-green-700">FREE</span>
        ) : (
          <>
            {negative && "−"}
            <Price value={value} />
          </>
        )}
      </dd>
    </div>
  );
}

/** Decorative placeholder only — deliberately not a scannable code. */
function DummyQr() {
  const cells = Array.from({ length: 144 }, (_, i) => (i * 7919) % 11 > 5);
  return (
    <div
      className="grid h-36 w-36 grid-cols-12 gap-0.5 rounded-lg border border-brand-100 bg-white p-2"
      aria-label="Placeholder QR code"
      role="img"
    >
      {cells.map((filled, i) => (
        <span key={i} className={filled ? "bg-brand-900" : "bg-transparent"} />
      ))}
    </div>
  );
}

/* ===========================================================
   ORDER SUCCESS
   -----------------------------------------------------------
   Only ever rendered from the Order the backend returned, so it
   cannot be shown for an order that was not actually saved.
   =========================================================== */

function OrderSuccess({ order, note, onPaid }: { order: Order; note?: string; onPaid: () => void }) {
  const awaitingPayment = order.paymentMethod !== "COD" && order.paymentStatus !== "PAID";
  const methodLabel =
    PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label ?? order.paymentMethod ?? "COD";

  return (
    <div className="relative mx-auto max-w-xl py-8 text-center">
      <Confetti />

      <div className="ns-animate-scale-in flex justify-center">
        <SuccessCheck />
      </div>

      <h1 className="ns-animate-fade-up mt-4 font-heading text-2xl font-bold text-brand-900">
        {awaitingPayment ? "Order saved - payment pending" : "Order Placed Successfully!"}
      </h1>
      <p className="ns-animate-fade-up mt-1 text-sm text-gray-500">
        {awaitingPayment
          ? "Complete the payment below and we will start preparing your order."
          : "A confirmation has been saved to your account."}
      </p>

      <div className="ns-panel ns-animate-fade-up mt-6 divide-y divide-brand-50 text-left">
        <Detail label="Order ID" value={`#${order.orderNumber ?? order.id}`} strong />
        <Detail label="Payment method" value={methodLabel} />
        <Detail
          label="Payment status"
          value={
            order.paymentStatus === "PAID"
              ? "Paid online ✓"
              : order.paymentMethod === "COD"
                ? "Pay on delivery"
                : "Awaiting payment"
          }
        />
        <Detail label="Items" value={String(order.itemCount ?? order.items.length)} />
        <Detail
          label="Total"
          value={`₹${Number(order.totalAmount).toLocaleString("en-IN")}`}
          strong
        />
        <Detail label="Estimated delivery" value={deliveryWindow(order.createdAt)} />
      </div>

      {awaitingPayment && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
          {note && <p className="mb-3 text-sm text-amber-900">{note}</p>}
          <PayNowButton order={order} onPaid={onPaid} label="Complete payment" className="ns-btn-primary w-full !py-3" />
          <p className="mt-2 text-xs text-amber-800">You can also pay later from My Orders.</p>
        </div>
      )}

      <div className="ns-animate-fade-up mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/account?tab=orders" className="ns-btn-primary !px-6 !py-3">
          View Order
        </Link>
        <Link href="/products" className="ns-btn-outline !px-6 !py-3">
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

function Detail({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm ${strong ? "font-semibold text-brand-800" : "text-gray-800"}`}>
        {value}
      </span>
    </div>
  );
}
