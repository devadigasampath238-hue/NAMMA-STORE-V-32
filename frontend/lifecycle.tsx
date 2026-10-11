"use client";

// ===========================================================
// lifecycle.tsx - everything about what happens AFTER checkout:
//   <StepBar>          six-step shipment progress
//   <TrackingTimeline> live events (customer, company and super admin views)
//   <ReturnModal>      per-item return request with reason + photo evidence
//   <ReturnStatusChip> Return requested -> ... -> Refunded
//   <ReviewModal>      rating + text + optional photo (verified buyers only)
//   <ReviewsSection>   product-page reviews, verified badge, reactions
// All state comes from the backend; this file never decides eligibility,
// it only reflects what the server allows (and the server re-checks).
// ===========================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createReturn,
  createReview,
  getProductReviews,
  getReturnReasons,
  getReviewEligibility,
  reactToReview,
  uploadEvidence,
} from "./api";
import { SafeImage, useAuth } from "./components";
import { Modal } from "./ui";
import type {
  ItemReturnStatus,
  OrderItem,
  ReturnReason,
  Review,
  ReviewSummary,
  TrackingEvent,
} from "./types";

/* ---------------- helpers ---------------- */

export const FLOW = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export const STEP_LABEL: Record<string, string> = {
  PLACED: "Placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function nextStep(status?: string | null): string | null {
  const i = FLOW.indexOf((status ?? "PLACED") as (typeof FLOW)[number]);
  return i < 0 || i >= FLOW.length - 1 ? null : FLOW[i + 1];
}

/** Show a short, human backend message; hide anything that looks technical. */
export function errMsg(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const m = e instanceof Error ? e.message : "";
  if (!m || m.length > 220 || /failed to fetch|networkerror|http \d{3}|exception|<html/i.test(m)) return fallback;
  return m;
}

const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

/* ---------------- shipment progress bar ---------------- */

export function StepBar({ status, compact = false }: { status?: string | null; compact?: boolean }) {
  if (status === "CANCELLED") {
    return <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700">Cancelled</p>;
  }
  const at = Math.max(0, FLOW.indexOf((status ?? "PLACED") as (typeof FLOW)[number]));
  return (
    <ol className="flex w-full min-w-[420px] items-start" aria-label="Shipment progress">
      {FLOW.map((s, i) => {
        const done = i <= at;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-3 h-0.5 w-full ${i <= at ? "bg-brand-600" : "bg-brand-100"}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition ${
                done ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800"
              } ${i === at && s !== "DELIVERED" ? "ring-4 ring-gold-300/60" : ""}`}
            >
              {done ? "✓" : i + 1}
            </span>
            {!compact && (
              <span className={`mt-1 text-[11px] leading-tight ${done ? "font-semibold text-coffee-900" : "text-coffee-700/75"}`}>
                {STEP_LABEL[s]}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- tracking timeline ---------------- */

export function TrackingTimeline({
  load,
  reloadKey,
}: {
  load: () => Promise<TrackingEvent[]>;
  /** change this value to refetch (e.g. after a status update) */
  reloadKey?: number | string;
}) {
  const [events, setEvents] = useState<TrackingEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    load()
      .then((e) => !cancelled && setEvents(e))
      .catch((e) => !cancelled && setError(errMsg(e, "Could not load tracking right now.")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!events) return <div className="h-16 animate-pulse rounded-lg bg-brand-50" />;
  if (events.length === 0) return <p className="text-sm text-coffee-700/70">No tracking updates yet.</p>;

  const ordered = [...events].reverse(); // newest first
  return (
    <ol className="relative space-y-4 border-l-2 border-brand-100 pl-5">
      {ordered.map((e, i) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${
              i === 0 ? "bg-brand-600 ring-4 ring-gold-300/50" : "bg-brand-300"
            }`}
          />
          <p className="text-sm font-semibold text-coffee-900">
            {e.label}
            {e.companyName && <span className="ml-2 text-xs font-normal text-coffee-700/70">by {e.companyName}</span>}
          </p>
          {e.note && <p className="text-sm text-coffee-700">{e.note}</p>}
          <p className="text-xs text-coffee-700/75">{when(e.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- return status ---------------- */

const RETURN_STYLE: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-900",
  UNDER_REVIEW: "bg-blue-100 text-blue-900",
  APPROVED: "bg-green-100 text-green-900",
  REJECTED: "bg-red-100 text-red-800",
  REFUND_PROCESSING: "bg-indigo-100 text-indigo-900",
  REFUNDED: "bg-emerald-100 text-emerald-900",
};
export const RETURN_LABEL: Record<string, string> = {
  REQUESTED: "Return requested",
  UNDER_REVIEW: "Under review",
  APPROVED: "Return approved",
  REJECTED: "Return rejected",
  REFUND_PROCESSING: "Refund processing",
  REFUNDED: "Refunded",
};

export function ReturnStatusChip({ status }: { status?: ItemReturnStatus | string | null }) {
  if (!status) return null;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${RETURN_STYLE[status] ?? "bg-gray-100 text-gray-800"}`}>
      {RETURN_LABEL[status] ?? status}
    </span>
  );
}

/* ---------------- photo picker ---------------- */

function PhotoPicker({
  purpose,
  max,
  stored,
  onChange,
}: {
  purpose: "return" | "review";
  max: number;
  stored: string[];
  onChange: (stored: string[]) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr("");
    setBusy(true);
    try {
      const nextStored = [...stored];
      const nextPrev = [...previews];
      for (const f of Array.from(files)) {
        if (nextStored.length >= max) break;
        if (!f.type.startsWith("image/")) throw new Error("Please choose an image file.");
        if (f.size > 5 * 1024 * 1024) throw new Error("Each photo must be under 5 MB.");
        nextStored.push(await uploadEvidence(f, purpose));
        nextPrev.push(URL.createObjectURL(f));
      }
      setPreviews(nextPrev);
      onChange(nextStored);
    } catch (e) {
      setErr(errMsg(e, "Could not upload that photo."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative h-20 w-20 overflow-hidden rounded-lg border border-brand-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => {
                setPreviews(previews.filter((_, k) => k !== i));
                onChange(stored.filter((_, k) => k !== i));
              }}
              className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-coffee-900/80 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
        {stored.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="grid h-20 w-20 place-items-center rounded-lg border-2 border-dashed border-brand-200 text-xs text-brand-700 transition hover:bg-brand-50 disabled:opacity-60"
          >
            {busy ? "Uploading…" : "+ Add photo"}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple={max > 1} className="hidden" onChange={(e) => pick(e.target.files)} />
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

/* ---------------- return request ---------------- */

export function ReturnModal({
  item,
  onClose,
  onDone,
}: {
  item: OrderItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [code, setCode] = useState("");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    setCode("");
    setDetails("");
    setPhotos([]);
    setError("");
    getReturnReasons().then(setReasons).catch(() => setError("Could not load return reasons. Please try again."));
  }, [item]);

  const reason = reasons.find((r) => r.code === code);

  async function submit() {
    if (!item || !reason) {
      setError("Please choose what went wrong.");
      return;
    }
    if (reason.requiresDetails && details.trim().length < 10) {
      setError("Please describe the problem in a few words (at least 10 characters).");
      return;
    }
    if (reason.requiresImage && photos.length === 0) {
      setError("Please add a clear photo of the problem.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createReturn({ orderItemId: item.id, reasonCode: reason.code, details: details.trim(), evidenceUrls: photos });
      onDone();
    } catch (e) {
      setError(errMsg(e, "Could not submit your return request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!item} title="Return this item" onClose={onClose}>
      {item && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3 rounded-xl bg-brand-50/60 p-3">
            <SafeImage fit="blur" src={item.productImageUrl} alt="" className="h-14 w-14 shrink-0 overflow-hidden rounded-lg" />
            <p className="font-medium text-coffee-900">{item.productName}</p>
          </div>

          <fieldset>
            <legend className="mb-2 font-medium text-coffee-900">What went wrong?</legend>
            <div className="grid gap-2">
              {reasons.map((r) => (
                <label
                  key={r.code}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                    code === r.code ? "border-brand-600 bg-brand-50" : "border-brand-100 hover:bg-brand-50/50"
                  }`}
                >
                  <input type="radio" name="reason" checked={code === r.code} onChange={() => setCode(r.code)} className="accent-[#BF2A1E]" />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {reason && (
            <>
              <div>
                <label className="mb-1 block font-medium text-coffee-900" htmlFor="ret-details">
                  Tell the seller more {reason.requiresDetails ? "" : "(optional)"}
                </label>
                <textarea
                  id="ret-details"
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={2000}
                  className="ns-input"
                  placeholder="What exactly is wrong with the item?"
                />
              </div>
              <div>
                <p className="mb-1 font-medium text-coffee-900">
                  Photos {reason.requiresImage ? <span className="text-red-700">(required)</span> : "(optional, up to 4)"}
                </p>
                <PhotoPicker purpose="return" max={4} stored={photos} onChange={setPhotos} />
              </div>
            </>
          )}

          <p className="rounded-lg bg-gold-50 p-3 text-xs text-coffee-700">
            The seller reviews every request. A refund is only issued if your return is approved — you can follow each step in My Orders.
          </p>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="ns-btn-outline">
              Cancel
            </button>
            <button onClick={submit} disabled={busy || !code} className="ns-btn-primary">
              {busy ? "Submitting…" : "Submit return request"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- stars + review form ---------------- */

export function Stars({ value, onChange, size = "text-xl" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <span className={`inline-flex ${size}`} role={onChange ? "radiogroup" : "img"} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={`${n <= Math.round(value) ? "text-gold-500" : "text-brand-200"} ${onChange ? "transition hover:scale-125" : "cursor-default"}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export function ReviewModal({
  open,
  orderItemId,
  productName,
  onClose,
  onDone,
}: {
  open: boolean;
  orderItemId: number | null;
  productName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setRating(0);
      setText("");
      setPhotos([]);
      setError("");
    }
  }, [open, orderItemId]);

  async function submit() {
    if (!orderItemId) return;
    if (rating < 1) return setError("Please choose a star rating.");
    if (text.trim().length < 5) return setError("Please write a few words about the product.");
    setBusy(true);
    setError("");
    try {
      await createReview({ orderItemId, rating, text: text.trim(), imageUrl: photos[0] });
      onDone();
    } catch (e) {
      setError(errMsg(e, "Could not post your review."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Write a review" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="font-medium text-coffee-900">{productName}</p>
        <div>
          <p className="mb-1 text-coffee-700">Your rating</p>
          <Stars value={rating} onChange={setRating} size="text-3xl" />
        </div>
        <div>
          <label htmlFor="rv-text" className="mb-1 block text-coffee-700">
            Your review
          </label>
          <textarea
            id="rv-text"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            className="ns-input"
            placeholder="What did you like or dislike? How is the quality?"
          />
        </div>
        <div>
          <p className="mb-1 text-coffee-700">Add a photo (optional)</p>
          <PhotoPicker purpose="review" max={1} stored={photos} onChange={setPhotos} />
        </div>
        <p className="text-xs text-coffee-700/70">✓ Your review will carry a “Verified buyer” badge because you received this product.</p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="ns-btn-outline">
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="ns-btn-primary">
            {busy ? "Posting…" : "Post review"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- reviews on the product page ---------------- */

export function ReviewsSection({ productId, productName }: { productId: number; productName: string }) {
  const { appUser } = useAuth();
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [error, setError] = useState("");
  const [eligible, setEligible] = useState<{ orderItemId: number | null; alreadyReviewed: boolean } | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setSummary(await getProductReviews(productId));
    } catch (e) {
      setError(errMsg(e, "Could not load reviews right now."));
    }
    if (appUser) {
      getReviewEligibility(productId)
        .then((r) => setEligible({ orderItemId: r.eligible ? r.orderItemId : null, alreadyReviewed: r.alreadyReviewed }))
        .catch(() => setEligible(null));
    } else {
      setEligible(null);
    }
  }, [productId, appUser]);

  useEffect(() => {
    load();
  }, [load]);

  async function react(r: Review, type: "HELPFUL" | "LOVE") {
    if (!appUser) return;
    try {
      const res = await reactToReview(r.id, type);
      setSummary((s) =>
        s
          ? {
              ...s,
              reviews: s.reviews.map((x) =>
                x.id !== r.id
                  ? x
                  : type === "HELPFUL"
                    ? { ...x, helpfulCount: res.count, iFoundHelpful: res.active }
                    : { ...x, loveCount: res.count, iLoved: res.active }
              ),
            }
          : s
      );
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <section aria-labelledby="reviews-title" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-kannada text-sm font-semibold text-gold-600">ಗ್ರಾಹಕರ ವಿಮರ್ಶೆಗಳು</p>
          <h2 id="reviews-title" className="font-display text-2xl font-bold text-coffee-900">
            Customer reviews
          </h2>
        </div>
        {eligible?.orderItemId && (
          <button onClick={() => setWriting(true)} className="ns-btn-primary kar-shine">
            ★ Write a review
          </button>
        )}
        {eligible?.alreadyReviewed && !eligible.orderItemId && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">You reviewed this product ✓</span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {!summary ? (
        <div className="mt-4 h-28 animate-pulse rounded-2xl bg-brand-50" />
      ) : summary.count === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-white p-6 text-sm text-coffee-700">
          No reviews yet. Only customers who received this product can review it, so every review here is genuine.
        </p>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="ns-card p-5 text-center md:text-left">
            <p className="font-display text-5xl font-bold text-coffee-900">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} />
            <p className="mt-1 text-xs text-coffee-700/70">{summary.count} verified review{summary.count === 1 ? "" : "s"}</p>
            <div className="mt-3 space-y-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const n = summary.distribution[star - 1] ?? 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-coffee-700">{star}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-50">
                      <span className="block h-full rounded-full bg-gold-400" style={{ width: `${(n / summary.count) * 100}%` }} />
                    </span>
                    <span className="w-5 text-right text-coffee-700/70">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <ul className="space-y-3">
            {summary.reviews.map((r) => (
              <li key={r.id} className="ns-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} size="text-base" />
                  <span className="text-sm font-semibold text-coffee-900">{r.reviewerName}</span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">✓ Verified buyer</span>
                  <span className="ml-auto text-xs text-coffee-700/75">{new Date(r.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-coffee-700">{r.text}</p>
                {r.imageUrl && (
                  <a href={r.imageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                    <SafeImage fit="blur" src={r.imageUrl} alt="Photo from the buyer" className="h-24 w-24 overflow-hidden rounded-lg border border-brand-100" />
                  </a>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => react(r, "HELPFUL")}
                    disabled={!appUser || r.mine}
                    title={!appUser ? "Log in to react" : r.mine ? "You can't react to your own review" : "Mark as helpful"}
                    className={`rounded-full border px-3 py-1 transition ${r.iFoundHelpful ? "border-brand-600 bg-brand-50 text-brand-800" : "border-brand-100 text-coffee-700 hover:bg-brand-50"} disabled:opacity-60`}
                  >
                    👍 Helpful{r.helpfulCount > 0 ? ` (${r.helpfulCount})` : ""}
                  </button>
                  <button
                    onClick={() => react(r, "LOVE")}
                    disabled={!appUser || r.mine}
                    className={`rounded-full border px-3 py-1 transition ${r.iLoved ? "border-brand-600 bg-brand-50 text-brand-800" : "border-brand-100 text-coffee-700 hover:bg-brand-50"} disabled:opacity-60`}
                  >
                    ❤️ Love it{r.loveCount > 0 ? ` (${r.loveCount})` : ""}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!appUser && (
        <p className="mt-3 text-xs text-coffee-700/70">
          <Link href="/login" className="font-medium text-brand-700 underline">
            Log in
          </Link>{" "}
          to react to reviews. Reviews can be written by customers who received this product.
        </p>
      )}

      <ReviewModal
        open={writing}
        orderItemId={eligible?.orderItemId ?? null}
        productName={productName}
        onClose={() => setWriting(false)}
        onDone={() => {
          setWriting(false);
          load();
        }}
      />
    </section>
  );
}
