// ===========================================================
// productCache.ts - makes product pages open instantly.
//
// Lists (home, categories, search) already download full product
// records. We keep them in memory + sessionStorage so /products/[id]
// can paint immediately from what the visitor just saw, while a
// background request refreshes price/stock (stale-while-revalidate).
// Hovering / touching a card warms the cache even for products that
// were not in a list. In-flight requests are shared, never duplicated.
// ===========================================================

import { getProduct } from "./api";
import type { Product } from "./types";

const TTL_MS = 5 * 60 * 1000;
const STORE_KEY = "namma_pcache_v1";
const MAX_STORED = 60;

type Entry = { p: Product; t: number };
const mem = new Map<number, Entry>();
const inflight = new Map<number, Promise<Product>>();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    for (const e of JSON.parse(raw) as Entry[]) mem.set(e.p.id, e);
  } catch {
    /* storage unavailable: memory-only cache */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const latest = [...mem.values()].sort((a, b) => b.t - a.t).slice(0, MAX_STORED);
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(latest));
  } catch {
    /* quota or blocked - ignore */
  }
}

/** Remember products we already have (called by list pages). */
export function primeProducts(list: Product[]) {
  if (typeof window === "undefined" || !list?.length) return;
  hydrate();
  const now = Date.now();
  for (const p of list) {
    const existing = mem.get(p.id);
    // never replace a fresher single-product fetch with an older list copy
    if (!existing || now - existing.t > 30_000) mem.set(p.id, { p, t: now });
  }
  persist();
}

/** Instant, synchronous read for first paint (may be slightly stale). */
export function getCachedProduct(id: number): Product | null {
  if (typeof window === "undefined") return null;
  hydrate();
  const e = mem.get(id);
  return e ? e.p : null;
}

export function isFresh(id: number): boolean {
  const e = mem.get(id);
  return !!e && Date.now() - e.t < TTL_MS;
}

/** Network fetch with de-duplication; always updates the cache. */
export function fetchProduct(id: number): Promise<Product> {
  const running = inflight.get(id);
  if (running) return running;
  const req = getProduct(id)
    .then((p) => {
      mem.set(id, { p, t: Date.now() });
      persist();
      return p;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, req);
  return req;
}

/** Warm the cache on hover / touch / focus. Fire-and-forget. */
export function warmProduct(id: number) {
  if (isFresh(id) || inflight.has(id)) return;
  fetchProduct(id).catch(() => {
    /* a failed warm-up must never surface to the visitor */
  });
}
