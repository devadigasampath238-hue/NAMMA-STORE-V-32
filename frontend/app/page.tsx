import Link from "next/link";
import { getActiveBanners, getCategories, getProducts } from "../api";
import { BenefitsStrip } from "../ui";
import { SafeImage } from "../components";
import { CategoryChips, CategoryRail, CategoryShowcase, DealsStrip, ProductTiles, PromoTiles } from "../storefront";
import { PersonalPicks, PrimeProducts, RecentlyViewed, Reveal } from "../motion";
import { TempleSkylineDivider } from "../karnataka";
import type { Product } from "../types";
import { HeroCarousel } from "../hero";
import { firstImageUrl } from "../imageUrl";

// Server component: the catalog is fetched on the server so the first paint
// already has products in it. `cache: "no-store"` in api.ts keeps it fresh.
export default async function HomePage() {
  const [categories, products, banners] = await Promise.all([
    getCategories(true).catch(() => []),
    getProducts().catch(() => []),
    // Admin-scheduled festival/seasonal campaigns. A failure here must not
    // take the whole homepage down, so it degrades to "no campaigns".
    getActiveBanners().catch(() => []),
  ]);

  // Every section below is derived from REAL backend data. Where there is
  // not enough data yet, the section hides itself rather than showing
  // invented placeholder products.
  const featured = products.filter((p) => p.featured).slice(0, 8);

  const deals = products
    .filter((p) => p.onSale && (p.discountPercent ?? 0) > 0)
    .sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))
    .slice(0, 8);

  const newArrivals = [...products]
    .sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bt - at;
    })
    .slice(0, 8);

  // "Trending" has no analytics behind it yet, so it is honestly just the
  // in-stock catalog rather than a fabricated popularity ranking.
  const trending = products.filter((p) => p.inStock).slice(0, 8);

  // Category showcases: the categories that actually have products, biggest first.
  const byCategory = new Map<number, Product[]>();
  for (const p of products) {
    const id = p.categoryId ?? p.category?.id;
    if (id == null) continue;
    (byCategory.get(id) ?? byCategory.set(id, []).get(id)!).push(p);
  }
  const showcases = categories
    .map((c) => ({ category: c, items: byCategory.get(c.id) ?? [] }))
    .filter((x) => x.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 3);

  // First product that actually has an image (thumbnail or gallery).
  const heroImage =
    firstImageUrl(
      ...featured.map((p) => [p.thumbnailUrl, ...(p.images ?? [])]),
      ...products.map((p) => [p.thumbnailUrl, ...(p.images ?? [])])
    ) ?? null;

  return (
    <div className="space-y-9 md:space-y-11">
      {/* ---------------- FESTIVAL / SEASONAL CAROUSEL ----------------
          Renders only when the admin has a live campaign. With none
          scheduled it returns null and the static hero below takes over,
          so the page never shows an empty slider. */}
      <PrimeProducts products={products} />
      <CategoryChips categories={categories} />

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_230px]">
        <CategoryRail categories={categories} />

        <div className="min-w-0">
          <HeroCarousel banners={banners} />

      {/* ---------------- HERO (shown when no campaign is live) ---------------- */}
      {banners.length === 0 && (
      <section className="ns-animate-fade-up relative h-full overflow-hidden rounded-2xl border border-gold-300/40 bg-gradient-to-br from-coffee-950 via-brand-900 to-brand-800 shadow-lift lg:min-h-[300px]">
        <div className="kar-silk" />
        <div className="kar-lattice pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl" aria-hidden="true" />
        <div className="relative grid h-full items-center gap-6 p-6 md:grid-cols-2 md:p-9">
          <div>
            <span className="ns-badge border border-gold-300/50 bg-gold-400/15 text-gold-200">★ Made in Karnataka</span>
            <h1 className="kar-hero-in mt-4 font-kannada text-4xl font-bold leading-tight text-gold-200 md:text-5xl">
              ನಮ್ಮ ಸ್ಟೋರ್
            </h1>
            <p className="kar-hero-in-2 mt-2 font-display text-xl font-bold text-white md:text-3xl">
              Karnataka&apos;s trusted local marketplace
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-100/85 md:text-base">
              Mugs, t-shirts, frames and corporate gifting — customise anything with your own
              design and have it delivered across Karnataka.
            </p>
            <div className="kar-hero-in-3 mt-7 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="inline-flex items-center justify-center rounded-lg bg-gold-400 px-7 py-3 text-base font-semibold text-coffee-950 shadow-md transition hover:-translate-y-0.5 hover:bg-gold-300"
              >
                Shop now
              </Link>
              <Link
                href="/customize"
                className="inline-flex items-center justify-center rounded-lg border border-gold-300/60 px-7 py-3 text-base font-medium text-gold-100 transition hover:bg-white/10"
              >
                Customise a gift
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-brand-100/80">
              <li>✓ Sold by verified Karnataka companies</li>
              <li>✓ Delivery across Karnataka</li>
            </ul>
          </div>

          {heroImage && (
            <div className="relative hidden md:block">
              <div className="absolute -inset-4 rounded-full bg-gold-300/25 blur-2xl" aria-hidden="true" />
              {/* SafeImage (not a raw <img>) resolves the path to an absolute
                  URL and falls back to a placeholder instead of a browser
                  broken-image icon if it 404s. */}
              <SafeImage
                src={heroImage}
                alt=""
                fit="contain"
                className="kar-float relative mx-auto h-72 w-full max-w-md rounded-xl2 drop-shadow-xl"
              />
            </div>
          )}
        </div>
      </section>
      )}
        </div>

        <PromoTiles />
      </div>

      {/* ---------------- BENEFITS ---------------- */}
      <Reveal><BenefitsStrip /></Reveal>

      {/* ---------------- DEALS ---------------- */}
      <Reveal from="zoom"><DealsStrip deals={deals} /></Reveal>

      {/* ---------------- CATEGORY SHOWCASES ---------------- */}
      {showcases.map(({ category, items }, i) => (
        <Reveal key={category.id} from={i % 2 === 0 ? "left" : "right"}>
          <CategoryShowcase category={category} products={items} />
        </Reveal>
      ))}

      <TempleSkylineDivider className="mx-auto h-10 w-full max-w-3xl text-brand-300" />

      {/* ---------------- TRENDING ---------------- */}
      {trending.length > 0 && (
        <Section title="Trending Now" kn="ಈಗ ಜನಪ್ರಿಯ" href="/products">
          <ProductTiles products={trending} />
        </Section>
      )}

      {/* ---------------- FEATURED ---------------- */}
      {featured.length > 0 && (
        <Section title="Featured Products" kn="ವಿಶೇಷ ಆಯ್ಕೆ" href="/products">
          <ProductTiles products={featured} />
        </Section>
      )}

      {/* ---------------- NEW ARRIVALS ---------------- */}
      {newArrivals.length > 0 && (
        <Section title="New Arrivals" kn="ಹೊಸ ಆಗಮನ" href="/products?sort=newest">
          <ProductTiles products={newArrivals} />
        </Section>
      )}

      {/* ---------------- PROMO BAND ---------------- */}
      <Reveal from="zoom">
        <section className="kar-lattice relative overflow-hidden rounded-[20px] bg-gradient-to-r from-brand-700 to-brand-900 px-6 py-11 text-center text-white">
          <h2 className="relative font-display text-2xl font-bold md:text-3xl">Corporate gifting, sorted.</h2>
          <p className="relative mx-auto mt-2 max-w-xl text-sm text-brand-100 md:text-base">
            Bulk orders, your logo, your colours. Tell us what you need and we will print it.
          </p>
          <Link
            href="/customize"
            className="kar-shine relative mt-5 inline-flex rounded-xl bg-white px-7 py-3 font-semibold text-brand-800 transition hover:bg-gold-200"
          >
            Start Customising
          </Link>
        </section>
      </Reveal>

      <PersonalPicks />
      <Reveal><RecentlyViewed title="Pick up where you left off" /></Reveal>
    </div>
  );
}

function Section({
  title,
  kn,
  href,
  children,
  empty = false,
  emptyText,
}: {
  title: string;
  /** Kannada companion title - a cultural layer, English stays primary. */
  kn?: string;
  href?: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <Reveal>
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          {kn && <p className="font-kannada text-sm font-semibold text-gold-600">{kn}</p>}
          <h2 className="ns-section-title font-display">{title}</h2>
          <span className="kar-underline mt-1 block h-[3px] w-14 rounded-full bg-gradient-to-r from-brand-600 to-gold-400" />
        </div>
        {href && (
          <Link href={href} className="text-sm font-medium text-brand-700 transition hover:text-brand-900 hover:underline">
            View all →
          </Link>
        )}
      </div>
      {empty ? <p className="text-sm text-gray-500">{emptyText}</p> : children}
    </section>
    </Reveal>
  );
}
