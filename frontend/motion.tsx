"use client";

// ===========================================================
// motion.tsx - the customer-site animation toolkit (no library).
//   <Reveal>            fade/slide in when scrolled into view
//   <KannadaMarquee>    scrolling Kannada + English greeting strip
//   <WelcomeSplash>     once-per-session "ನಮಸ್ಕಾರ" curtain welcome
//   <RecentlyViewed>    rail of products the visitor looked at
//   trackViewed()       record a product view (localStorage)
// All motion respects prefers-reduced-motion (see globals.css).
// ===========================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SafeImage } from "./components";
import { Price, ProductCard } from "./ui";
import { getProductsByCategory } from "./api";
import { primeProducts, warmProduct } from "./productCache";
import { productImage } from "./imageUrl";
import type { Product } from "./types";

/* ---------------- scroll reveal ---------------- */

export function Reveal({
  children,
  delay = 0,
  from = "up",
  className = "",
}: {
  children: React.ReactNode;
  /** ms - use small steps (60-90) to stagger siblings */
  delay?: number;
  from?: "up" | "left" | "right" | "zoom";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const dir = from === "left" ? "rv-left" : from === "right" ? "rv-right" : from === "zoom" ? "rv-zoom" : "";
  return (
    <div
      ref={ref}
      className={`rv ${dir} ${shown ? "rv-in" : ""} ${className}`}
      style={{ ["--rv-delay" as string]: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ---------------- greeting marquee ---------------- */

const GREETINGS = [
  "ನಮ್ಮ ಕರ್ನಾಟಕ, ನಮ್ಮ ಹೆಮ್ಮೆ",
  "Karnataka's own marketplace",
  "ಸ್ವಾಗತ — Welcome",
  "ಕನ್ನಡಿಗರ ಸ್ಟೋರ್",
  "Made & sold by Karnataka makers",
  "ನಮ್ಮ ಸ್ಟೋರ್ — ನಮ್ಮ ಆಯ್ಕೆ",
];

export function KannadaMarquee() {
  const row = (
    <div className="flex shrink-0 items-center gap-8 pr-8">
      {GREETINGS.map((g) => (
        <span key={g} className="flex items-center gap-8 whitespace-nowrap">
          <span className="font-kannada text-sm font-medium text-gold-200">{g}</span>
          <span aria-hidden="true" className="text-gold-400">✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden bg-brand-800 py-1.5" aria-label="Greetings">
      <div className="kar-marquee">
        {row}
        {row}
      </div>
    </div>
  );
}

/* ---------------- welcome splash ---------------- */

export function WelcomeSplash() {
  const pathname = usePathname() ?? "";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;
    try {
      if (window.sessionStorage.getItem("namma_welcome")) return;
      window.sessionStorage.setItem("namma_welcome", "1");
    } catch {
      /* storage blocked: just show it once per page load */
    }
    // No splash for visitors who asked for reduced motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 3300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden" role="presentation" onClick={() => setVisible(false)}>
      {/* Karnataka flag: yellow over red, parting like a stage curtain */}
      <div className="kar-curtain-l absolute inset-y-0 left-0 w-1/2 bg-gradient-to-b from-gold-400 from-50% to-brand-600 to-50%" />
      <div className="kar-curtain-r absolute inset-y-0 right-0 w-1/2 bg-gradient-to-b from-gold-400 from-50% to-brand-600 to-50%" />
      <div className="kar-lattice absolute inset-0 opacity-60" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="kar-splash-text rounded-3xl bg-coffee-950/90 px-8 py-7 text-center shadow-lift ring-2 ring-gold-400/70">
          <p className="font-kannada text-5xl font-bold text-gold-300 md:text-7xl">ನಮಸ್ಕಾರ!</p>
          <p className="mt-3 font-kannada text-2xl font-semibold text-white md:text-4xl">ನಮ್ಮ ಸ್ಟೋರ್‌ಗೆ ಸ್ವಾಗತ</p>
          <p className="mt-2 font-display text-lg text-brand-100 md:text-xl">Welcome to Namma Store</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- recently viewed ---------------- */

const VIEWED_KEY = "namma_recent";
const VIEWED_MAX = 12;

type Viewed = Pick<
  Product,
  "id" | "name" | "effectivePrice" | "thumbnailUrl" | "images" | "onSale" | "discountPercent" | "companyName" | "categoryId"
>;

function readViewed(): Viewed[] {
  try {
    return JSON.parse(window.localStorage.getItem(VIEWED_KEY) ?? "[]") as Viewed[];
  } catch {
    return [];
  }
}

/** Call from the product page once the product has loaded. */
export function trackViewed(p: Product) {
  try {
    const entry: Viewed = {
      id: p.id,
      name: p.name,
      effectivePrice: p.effectivePrice,
      thumbnailUrl: p.thumbnailUrl,
      images: p.images?.slice(0, 1),
      onSale: p.onSale,
      discountPercent: p.discountPercent,
      companyName: p.companyName,
      categoryId: p.categoryId ?? p.category?.id ?? null,
    };
    const next = [entry, ...readViewed().filter((x) => x.id !== p.id)].slice(0, VIEWED_MAX);
    window.localStorage.setItem(VIEWED_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable - feature quietly off */
  }
}

export function RecentlyViewed({ excludeId, title = "Recently viewed" }: { excludeId?: number; title?: string }) {
  const [items, setItems] = useState<Viewed[]>([]);
  useEffect(() => {
    setItems(readViewed().filter((x) => x.id !== excludeId));
  }, [excludeId]);

  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="ns-section-title font-display">{title}</h2>
      <span className="kar-underline mb-4 mt-1 block h-[3px] w-14 rounded-full bg-gradient-to-r from-brand-600 to-gold-400" />
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.id}`}
            className="kar-tilt ns-card w-36 shrink-0 snap-start overflow-hidden sm:w-40"
          >
            <SafeImage fit="blur" src={productImage(p as Product)} alt={p.name} className="aspect-square w-full" />
            <div className="p-2.5">
              <p className="line-clamp-2 min-h-[2.4rem] text-xs font-medium text-coffee-900">{p.name}</p>
              <Price value={p.effectivePrice} className="text-sm font-semibold text-brand-700" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}


/* ---------------- fast product navigation ---------------- */

/**
 * Link to a product page that warms the product cache the moment the visitor
 * shows intent (hover / touch / keyboard focus) - by the time the click lands the
 * detail page can paint from memory instead of waiting on the network.
 */
export function ProductLink({
  id,
  className,
  children,
  ariaLabel,
}: {
  id: number;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const warm = () => warmProduct(id);
  return (
    <Link
      href={`/products/${id}`}
      prefetch
      aria-label={ariaLabel}
      className={className}
      onMouseEnter={warm}
      onTouchStart={warm}
      onFocus={warm}
    >
      {children}
    </Link>
  );
}

/** Drop-in: hands the products a page already has to the cache. Renders nothing. */
export function PrimeProducts({ products }: { products: Product[] }) {
  useEffect(() => {
    primeProducts(products);
  }, [products]);
  return null;
}


/* ---------------- personalised picks ---------------- */

/**
 * "Picked for you": products from the categories this visitor has been browsing
 * (their own recently-viewed history), minus what they already looked at.
 * Pure client-side from real backend data; shows nothing for a first-time visitor.
 */
export function PersonalPicks({
  excludeId,
  title = "Picked for you",
  kn = "ನಿಮಗಾಗಿ",
}: {
  excludeId?: number;
  title?: string;
  kn?: string;
}) {
  const [picks, setPicks] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    const viewed = readViewed();
    if (viewed.length === 0) return;

    // Most-browsed categories first.
    const counts = new Map<number, number>();
    for (const v of viewed) {
      if (v.categoryId != null) counts.set(v.categoryId, (counts.get(v.categoryId) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    if (top.length === 0) return;

    const seen = new Set<number>(viewed.map((v) => v.id));
    if (excludeId != null) seen.add(excludeId);

    Promise.all(top.map((id) => getProductsByCategory(id).catch(() => [] as Product[])))
      .then((lists) => {
        if (cancelled) return;
        const merged: Product[] = [];
        // interleave so one category does not dominate
        for (let i = 0; merged.length < 4 && i < 12; i++) {
          for (const l of lists) {
            const p = l[i];
            if (p && !seen.has(p.id) && p.inStock && !merged.some((m) => m.id === p.id)) merged.push(p);
          }
        }
        primeProducts(merged);
        setPicks(merged.slice(0, 4));
      })
      .catch(() => {
        /* recommendations are optional - fail silent */
      });
    return () => {
      cancelled = true;
    };
  }, [excludeId]);

  if (picks.length === 0) return null;
  return (
    <section aria-label={title}>
      <p className="font-kannada text-sm font-semibold text-gold-600">{kn}</p>
      <h2 className="ns-section-title font-display">{title}</h2>
      <span className="kar-underline mb-4 mt-1 block h-[3px] w-14 rounded-full bg-gradient-to-r from-brand-600 to-gold-400" />
      <div className="ns-stagger ns-grid-products">
        {picks.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
