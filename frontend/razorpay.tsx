"use client";

// ===========================================================
// razorpay.tsx - Razorpay Standard Web Checkout (client side)
//
//   payForOrder(order, prefill, hooks)
//     1. POST /api/payments/create-order   (server reads the amount from the saved order)
//     2. loads https://checkout.razorpay.com/v1/checkout.js (once)
//     3. opens the payment modal with the returned order_id
//     4. on success sends razorpay_order_id / payment_id / signature to
//        POST /api/payments/verify - the order becomes PAID only if the
//        server confirms the HMAC-SHA256 signature
//   Handles: user closes the modal, payment.failed (modal stays open so
//   the customer can retry), script load failure, verification failure.
//
//   <PayNowButton order=... onPaid=... />  - reusable "Pay now" action
//
// Only the PUBLIC key id is used here (NEXT_PUBLIC_RAZORPAY_KEY_ID, or the
// key_id the server returns). The key SECRET never reaches the browser.
// ===========================================================

import { useState } from "react";
import { createPaymentOrder, verifyPayment } from "./api";
import { friendlyError, useToast } from "./ui";
import { useAuth } from "./components";
import type { Order } from "./types";

type RzpSuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RzpOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RzpSuccess) => void;
  modal?: { ondismiss?: () => void; confirm_close?: boolean };
};

type RzpInstance = {
  open: () => void;
  on: (event: string, cb: (payload: { error?: { description?: string; reason?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RzpOptions) => RzpInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<boolean> | null = null;

export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(!!window.Razorpay);
    script.onerror = () => {
      scriptPromise = null; // allow a retry
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export type PayOutcome =
  | { status: "paid" }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

export interface PayHooks {
  /** A single attempt failed inside the modal (the customer may still retry there). */
  onAttemptFailed?: (message: string) => void;
}

export async function payForOrder(
  order: Pick<Order, "id" | "orderNumber">,
  prefill: { name?: string; email?: string; contact?: string },
  hooks: PayHooks = {}
): Promise<PayOutcome> {
  let pay;
  try {
    pay = await createPaymentOrder(order.id);
  } catch (e) {
    return { status: "failed", message: friendlyError(e, "We could not start the payment. Please try again.") };
  }

  const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || pay.key_id;
  if (!pay.live || !key) {
    return { status: "failed", message: "Online payments are not available right now." };
  }

  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    return {
      status: "failed",
      message: "The payment window could not load. Check your internet connection and try again.",
    };
  }
  const Razorpay = window.Razorpay;

  return new Promise<PayOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: PayOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const rzp = new Razorpay({
      key,
      amount: pay.amount,
      currency: pay.currency,
      name: "Namma Store",
      description: `Order #${order.orderNumber ?? order.id}`,
      order_id: pay.order_id,
      prefill,
      notes: { order: String(order.id) },
      theme: { color: "#BF2A1E" },
      // Success: the browser only HOLDS the proof; the server decides if it is genuine.
      handler: async (response) => {
        try {
          const res = await verifyPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          finish(res.verified ? { status: "paid" } : { status: "failed", message: "Payment could not be verified." });
        } catch (e) {
          finish({
            status: "failed",
            message: friendlyError(e, "We could not confirm your payment. If money was deducted it will be refunded."),
          });
        }
      },
      modal: {
        // The customer closed the window without paying.
        ondismiss: () => finish({ status: "dismissed" }),
      },
    });

    // A failed attempt does not close the modal; the customer can retry inside it.
    rzp.on("payment.failed", (payload) => {
      hooks.onAttemptFailed?.(payload.error?.description || "The payment failed. Please try another method.");
    });

    rzp.open();
  });
}

/* ---------------- reusable button ---------------- */

export function PayNowButton({
  order,
  onPaid,
  className = "ns-btn-primary",
  label = "Pay now",
}: {
  order: Order;
  onPaid: () => void | Promise<void>;
  className?: string;
  label?: string;
}) {
  const { appUser } = useAuth();
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function pay() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const outcome = await payForOrder(
      order,
      { name: order.customerName ?? appUser?.displayName ?? undefined, email: order.customerEmail ?? undefined, contact: order.customerPhone ?? undefined },
      { onAttemptFailed: (m) => setMessage(m) }
    );
    setBusy(false);
    if (outcome.status === "paid") {
      success("Payment received. Thank you!");
      await onPaid();
    } else if (outcome.status === "failed") {
      setMessage(outcome.message);
      toastError(outcome.message);
    } else {
      setMessage("Payment was cancelled. Your order is saved - you can pay any time from My Orders.");
    }
  }

  return (
    <div>
      <button onClick={pay} disabled={busy} className={className}>
        {busy ? "Opening payment…" : label}
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
