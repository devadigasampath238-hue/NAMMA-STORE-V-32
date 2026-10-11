"use client";

import { useEffect } from "react";

/* =========================================================
   ?ref=CODE capture.

   An influencer shares a normal product link, optionally with
   ?ref=RAHUL10. We remember that code for this browser session
   so it survives cart -> checkout, and send it along with the
   order. It is ONLY a hint: the backend re-validates it, and
   money is attributed solely through an applied coupon code.
   Nothing about it is shown to the customer.
========================================================= */

const KEY = "namma_ref";

export function getStoredReferral(): string | undefined {
  try {
    return window.sessionStorage.getItem(KEY) || undefined;
  } catch {
    return undefined; // storage blocked (private mode) - attribution still works via the coupon
  }
}

export function RefCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      const code = ref?.trim().toUpperCase();
      if (code && /^[A-Z0-9_-]{3,32}$/.test(code)) {
        window.sessionStorage.setItem(KEY, code);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
