// ===========================================================
// storefront.tsx - marketplace-style homepage blocks.
//
// Layout language: category rail | hero | promo tiles, a deals
// strip, then per-category showcases (tinted panel + product
// grid). Everything is built from real backend data; a block
// with no data renders nothing instead of invented products.
// Pure presentational, server-safe (no hooks).
// ===========================================================

import Link from "next/link";
import { SafeImage } from "./components";
import { ProductLink } from "./motion";
import { Price, WishlistButton } from "./ui";
import { productImage } from "./imageUrl";
import type { Category, Product } from "./types";

/* ---------------- category rail (desktop) + chips (mobile) ---------------- */

/**
 * Flipkart-style row of round category buttons. Full image visible (blur fit,
 * never cropped), animated gold/red ring on hover.
 */
export function CategoryChips({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <nav aria-label="Browse categories" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-max gap-4 sm:gap-6 md:justify-center">
        <li style={{ animation: "ns-fade-up .5s ease-out both" }}>
          <Link href="/categories" className="kar-chip group flex w-[76px] flex-col items-center gap-2 sm:w-24">
            <span className="kar-chip-ring rounded-full p-[3px] shadow-card">
              <span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 font-kannada text-lg font-bold text-gold-200 sm:h-[86px] sm:w-[86px] sm:text-xl">
                ಎಲ್ಲಾ
              </span>
            </span>
            <span className="text-center text-xs font-medium text-coffee-900 transition group-hover:text-brand-700 sm:text-[13px]">
              All
            </span>
          </Link>
        </li>
        {categories.slice(0, 12).map((c, i) => (
          <li key={c.id} className="rv rv-in" style={{ animation: `ns-fade-up .5s ${i * 60}ms ease-out both` }}>
            <Link href={`/categories/${c.id}`} className="kar-chip group flex w-[76px] flex-col items-center gap-2 sm:w-24">
              <span className="kar-chip-ring rounded-full p-[3px] shadow-card">
                <span className="block rounded-full bg-white p-[3px]">
                  <SafeImage
                    fit="blur"
                    src={c.imageUrl}
                    alt={c.name}
                    className="h-[62px] w-[62px] overflow-hidden rounded-full sm:h-20 sm:w-20"
                  />
                </span>
              </span>
              <span className="line-clamp-2 text-center text-xs font-medium leading-tight text-coffee-900 transition group-hover:text-brand-700 sm:text-[13px]">
                {c.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function CategoryRail({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <>
      {/* laptop / desktop: the rail */}
      <nav
        aria-label="Categories"
        className="ns-card hidden overflow-hidden lg:block"
      >
        <div className="kar-silk-thin" />
        <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700">
          Shop by category
        </p>
        <ul className="px-2 pb-2">
          {categories.slice(0, 8).map((c) => (
            <li key={c.id}>
              <Link
                href={`/categories/${c.id}`}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-coffee-900 transition hover:bg-gold-50 hover:text-brand-700"
              >
                <SafeImage
        fit="blur"
                  src={c.imageUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 overflow-hidden rounded-md"
                />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span aria-hidden="true" className="text-brand-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600">›</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/categories"
          className="block border-t border-brand-100 px-4 py-2.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          All categories →
        </Link>
      </nav>
    </>
  );
}

/* ---------------- promo tiles (right of the hero) ---------------- */

export function PromoTiles() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <Link
        href="/customize"
        className="kar-lattice group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-coffee-900 p-5 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-300">Personalised</p>
          <p className="mt-1 font-display text-lg font-bold leading-snug">Print your own design on mugs, tees &amp; frames</p>
        </div>
        <span className="mt-3 inline-flex w-fit items-center rounded-lg bg-gold-400 px-3 py-1.5 text-sm font-semibold text-coffee-950 transition group-hover:bg-gold-300">
          Customise a gift
        </span>
      </Link>

      <Link
        href="/products"
        className="group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-2xl border border-gold-300/60 bg-gradient-to-br from-gold-50 to-gold-100 p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-brand-700">ನಮ್ಮ ಕರ್ನಾಟಕ</p>
          <p className="mt-1 font-display text-lg font-bold leading-snug text-coffee-900">
            Made &amp; sold by trusted Karnataka companies
          </p>
        </div>
        <span className="mt-3 inline-flex w-fit items-center rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
          Browse all products
        </span>
      </Link>
    </div>
  );
}

/* ---------------- tiles ---------------- */

/**
 * Bordered product grid used by deals, category showcases and the product
 * sections. Each tile carries a right + bottom hairline and the grid is pulled
 * out by 1px (-mr/-mb) inside an overflow-hidden wrapper, so there are no
 * doubled edges and an incomplete last row simply stays blank.
 */
export function TileGrid({
  children,
  cols = "t8",
}: {
  children: React.ReactNode;
  cols?: "t5" | "t8";
}) {
  const c =
    cols === "t5"
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  return (
    <div className="min-w-0 overflow-hidden">
      <div className={`-mb-px -mr-px grid ${c}`}>{children}</div>
    </div>
  );
}

export function MiniTile({ product }: { product: Product }) {
  const showDiscount = product.onSale && (product.discountPercent ?? 0) > 0;
  return (
    <div className="group relative border-b border-r border-brand-100 bg-white transition duration-300 hover:z-10 hover:scale-[1.02] hover:shadow-cardHover">
      <ProductLink id={product.id} className="flex flex-col gap-2 p-3">
        <SafeImage
          fit="blur"
          src={productImage(product)}
          alt={product.name}
          className="aspect-square w-full overflow-hidden rounded-xl"
          imgClassName="group-hover:scale-110 transition-transform duration-700"
          sizes="(max-width: 640px) 45vw, 200px"
        />
        <div className="min-w-0">
          <p className="line-clamp-2 min-h-[2.6em] text-[13.5px] font-medium leading-snug text-coffee-900">
            {product.name}
          </p>
          <p className="mt-0.5 text-xs text-coffee-700/70">
            From <Price value={product.effectivePrice} className="font-semibold text-brand-700" />
            {product.onSale && product.price > product.effectivePrice && (
              <span className="ml-1.5 text-[11px] text-coffee-700/75 line-through">
                <Price value={product.price} />
              </span>
            )}
          </p>
          {product.companyName && (
            <p className="truncate text-[11px] text-coffee-700/75">Sold by {product.companyName}</p>
          )}
        </div>
      </ProductLink>

      {showDiscount && (
        <span className="pointer-events-none absolute left-[18px] top-[18px] rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
          -{Math.round(product.discountPercent)}%
        </span>
      )}

      {/* The existing wishlist toggle, sitting outside the Link so tapping it never navigates. */}
      <WishlistButton
        productId={product.id}
        className="absolute right-[18px] top-[18px] z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-card backdrop-blur transition hover:scale-110"
      />
    </div>
  );
}

/** Card + tile grid for "Trending", "Featured", "New arrivals". */
export function ProductTiles({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <div className="ns-card overflow-hidden">
      <TileGrid cols="t8">
        {products.slice(0, 8).map((p) => (
          <MiniTile key={p.id} product={p} />
        ))}
      </TileGrid>
    </div>
  );
}

/* ---------------- deals strip ---------------- */

export function DealsStrip({ deals }: { deals: Product[] }) {
  if (deals.length === 0) return null;
  return (
    <section className="ns-card grid overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="kar-lattice relative flex flex-col justify-center border-b border-brand-100 bg-gradient-to-br from-gold-50 to-brand-50 p-5 lg:border-b-0 lg:border-r">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700">Offers</p>
        <h2 className="mt-0.5 font-display text-2xl font-bold text-coffee-900">Deals &amp; discounts</h2>
        <p className="mt-1 text-[13px] text-coffee-700/80">Best savings right now across all companies.</p>
        <Link href="/products?sort=discount" className="mt-3 text-sm font-semibold text-brand-700 hover:underline">
          See all deals →
        </Link>
      </div>
      <TileGrid cols="t5">
        {deals.slice(0, 5).map((p) => (
          <MiniTile key={p.id} product={p} />
        ))}
      </TileGrid>
    </section>
  );
}

/* ---------------- per-category showcase ---------------- */

export function CategoryShowcase({
  category,
  products,
}: {
  category: Category;
  products: Product[];
}) {
  if (products.length === 0) return null;
  return (
    <section className="ns-card grid overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="relative flex min-h-[170px] items-end overflow-hidden bg-gradient-to-br from-brand-700 to-coffee-900 p-5">
        <SafeImage
          fit="blur"
          src={category.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full"
        />
        {/* solid scrim at the bottom keeps the white title readable on ANY picture */}
        <div className="absolute inset-0 bg-gradient-to-t from-coffee-950/95 via-coffee-950/55 to-transparent" />
        <div className="kar-zigzag absolute inset-x-0 bottom-0 !h-[6px]" />
        <div className="relative">
          <h2 className="font-display text-2xl font-bold leading-tight text-white">{category.name}</h2>
          <Link
            href={`/categories/${category.id}`}
            className="mt-3 inline-flex rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-coffee-900 shadow transition hover:bg-gold-200"
          >
            Explore all
          </Link>
        </div>
      </div>
      <TileGrid cols="t8">
        {products.slice(0, 8).map((p) => (
          <MiniTile key={p.id} product={p} />
        ))}
      </TileGrid>
    </section>
  );
}
