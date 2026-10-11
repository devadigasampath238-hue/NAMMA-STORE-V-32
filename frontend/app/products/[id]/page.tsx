"use client";

import { fetchProduct, getCachedProduct, primeProducts } from "../../../productCache";
import { PersonalPicks, RecentlyViewed, trackViewed } from "../../../motion";
import { ReviewsSection } from "../../../lifecycle";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getProduct, getRelatedProducts } from "../../../api";
import {
  Loading,
  ProductDesignUpload,
  DesignPreviewOverlay,
  QuantityStepper,
  SafeImage,
  useAuth,
} from "../../../components";
import {
  ProductGallery,
  ProductCard,
  WishlistButton,
  ProductGridSkeleton,
  ErrorState,
  EmptyState,
  Price,
  SkeletonBlock,
  useAddToCart,
  useToast,
  friendlyError,
} from "../../../ui";
import type { Product } from "../../../types";
import { PincodeCheck } from "../../../delivery";

function ProductDetailInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Number(params.id);

  const { appUser, loading: authLoading } = useAuth();
  const addToCart = useAddToCart();
  const { error: toastError } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"description" | "specs">("description");

  // Simple PIN serviceability check. There is no backend endpoint for this,
  // so rather than inventing one it just validates the format and shows the
  // same estimated window used on the order success page.

  const load = useCallback(async () => {
    setError("");
    // Instant path: the visitor has almost always just seen this product in a list.
    // Paint it right away, then refresh price/stock quietly in the background.
    const cached = getCachedProduct(id);
    if (cached) {
      setProduct(cached);
      setQuantity(cached.inStock ? 1 : 0);
      setLoading(false);
      trackViewed(cached);
    } else {
      setLoading(true);
    }
    try {
      const p = await fetchProduct(id);
      setProduct(p);
      trackViewed(p);
      setQuantity((q) => (!p.inStock ? 0 : cached ? Math.max(1, Math.min(q || 1, p.stockQuantity ?? q ?? 1)) : 1));
    } catch (e) {
      // With cached content on screen a failed refresh is not worth interrupting the visitor.
      if (!cached) setError(friendlyError(e, "We could not load this product."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getRelatedProducts(id, 8)
      .then((list) => {
        primeProducts(list);
        setRelated(list);
      })
      .catch(() => setRelated([]));
  }, [id]);

  async function handleAdd(thenGoTo?: string) {
    if (!product) return;
    if (!appUser) {
      router.push("/login");
      return;
    }
    setBusy(true);
    const ok = await addToCart(product.id, Math.max(1, quantity), {
      customImageUrl: product.customizable && designUrl ? designUrl : undefined,
    });
    setBusy(false);
    if (ok && thenGoTo) router.push(thenGoTo);
  }

  // ?buy=1 comes from the "Buy Now" link on product cards.
  const wantsBuyNow = searchParams.get("buy") === "1";
  useEffect(() => {
    if (wantsBuyNow && product?.inStock) {
      // Do not auto-purchase; just scroll the buy panel into view.
      document.getElementById("buy-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [wantsBuyNow, product]);

  if (loading || authLoading) {
    return (
      <div className="grid gap-8 md:grid-cols-2">
        <SkeletonBlock className="aspect-square w-full" />
        <div className="space-y-4">
          <SkeletonBlock className="h-8 w-3/4" />
          <SkeletonBlock className="h-5 w-1/3" />
          <SkeletonBlock className="h-10 w-1/2" />
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  if (!product) {
    return (
      <EmptyState
        title="Product not found"
        message="It may have been removed from the store."
        actionLabel="Browse products"
        actionHref="/products"
      />
    );
  }

  const outOfStock = !product.inStock;
  const displayPrice = product.effectivePrice ?? product.price;

  const specs: Array<[string, string]> = [
    ["Category", product.categoryName ?? "-"],
    ["Product type", product.productType ?? "-"],
    ["Brand", product.brand ?? "-"],
    ["SKU", product.sku ?? "-"],
    ["Customisable", product.customizable ? "Yes" : "No"],
    ["Availability", product.inStock ? `${product.stockQuantity} in stock` : "Out of stock"],
  ];

  return (
    <div className="space-y-12">
      <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
        <Link href="/" className="hover:text-brand-700">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href="/products" className="hover:text-brand-700">Products</Link>
        {product.categoryId && (
          <>
            <span className="mx-1.5">/</span>
            <Link href={`/categories/${product.categoryId}`} className="hover:text-brand-700">
              {product.categoryName}
            </Link>
          </>
        )}
      </nav>

      <div className="ns-animate-fade-up grid gap-8 lg:grid-cols-2">
        {/* ---------------- LEFT: gallery ---------------- */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ProductGallery
            images={product.images}
            alt={product.name}
            overlay={
              product.customizable ? <DesignPreviewOverlay designUrl={designUrl} /> : undefined
            }
          />
          {product.customizable && (
            <p className="mt-2 text-center text-xs text-gray-400">
              Preview is approximate — placement is confirmed before production.
            </p>
          )}
        </div>

        {/* ---------------- RIGHT: info ---------------- */}
        <div id="buy-panel">
          {product.categoryName && (
            <Link
              href={`/categories/${product.categoryId}`}
              className="ns-badge bg-brand-50 text-brand-700"
            >
              {product.categoryName}
            </Link>
          )}

          <h1 className="mt-3 font-heading text-2xl font-bold leading-tight text-brand-900 md:text-3xl">
            {product.name}
          </h1>

          {product.brand && <p className="mt-1 text-sm text-gray-500">by {product.brand}</p>}

          {product.companyName && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand-100 bg-white px-3 py-2">
              {product.companyLogoUrl && (
                <SafeImage
                  src={product.companyLogoUrl}
                  alt={product.companyName}
                  className="h-8 w-8 shrink-0 overflow-hidden rounded-full"
                />
              )}
              <p className="text-sm text-gray-600">
                Sold by <span className="font-medium text-brand-900">{product.companyName}</span>
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <Price value={displayPrice} className="text-3xl font-bold text-brand-700" />
            {product.onSale && (
              <>
                <Price value={product.price} className="text-lg text-gray-400 line-through" />
                <span className="ns-badge bg-green-100 text-green-800">
                  {product.discountPercent}% OFF
                </span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400">Inclusive of all taxes</p>

          <p
            className={`mt-3 text-sm font-medium ${
              outOfStock
                ? "text-red-600"
                : product.stockStatus === "LOW_STOCK"
                ? "text-amber-600"
                : "text-green-700"
            }`}
          >
            {outOfStock
              ? "Currently out of stock"
              : product.stockStatus === "LOW_STOCK"
              ? `Hurry — only ${product.stockQuantity} left`
              : "In stock"}
          </p>

          {product.variants.length > 0 && (
            <div className="mt-5">
              <p className="ns-label">Variants</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <span
                    key={v}
                    className="rounded-lg border border-brand-200 px-3 py-1.5 text-sm text-brand-800"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {product.customizable && (
            <div className="mt-6 rounded-xl2 border border-brand-200 bg-brand-50/60 p-4">
              <h2 className="font-heading font-semibold text-brand-900">Customise this product</h2>
              <p className="mb-3 mt-0.5 text-sm text-gray-600">
                Upload your design and we will print it for you.
              </p>
              <ProductDesignUpload designUrl={designUrl} onDesignChange={setDesignUrl} />
            </div>
          )}

          {/* quantity + actions */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Quantity</span>
            <QuantityStepper
              value={Math.max(1, quantity)}
              min={1}
              max={product.stockQuantity || 1}
              onChange={setQuantity}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => handleAdd()}
              disabled={outOfStock || busy}
              className="ns-btn-primary flex-1 !py-3 text-base"
            >
              {busy ? "Adding…" : "Add to Cart"}
            </button>
            <button
              onClick={() => handleAdd("/checkout")}
              disabled={outOfStock || busy}
              className="ns-btn-outline flex-1 !py-3 text-base"
            >
              Buy Now
            </button>
            <WishlistButton
              productId={product.id}
              showLabel
              className="justify-center rounded-lg border border-brand-100 px-4 py-3 sm:w-auto"
            />
          </div>

          {/* Phone: the buy buttons stay reachable while the visitor reads on
              (sits above the bottom tab bar). */}
          <div className="fixed inset-x-0 bottom-[3.9rem] z-40 flex items-center gap-2 border-t border-brand-100 bg-white/95 px-3 py-2 shadow-[0_-6px_18px_rgba(34,20,15,0.10)] backdrop-blur md:hidden">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs text-coffee-700/70">{product.name}</p>
              <Price value={product.effectivePrice} className="font-display text-lg font-bold text-brand-700" />
            </div>
            <button onClick={() => handleAdd()} disabled={outOfStock || busy} className="ns-btn-outline !px-4 !py-2.5 text-sm">
              {busy ? "…" : "Add to cart"}
            </button>
            <button onClick={() => handleAdd("/checkout")} disabled={outOfStock || busy} className="ns-btn-primary kar-shine !px-4 !py-2.5 text-sm">
              Buy now
            </button>
          </div>

          {/* delivery check - backed by GET /api/serviceability.
              This used to accept ANY valid 6-digit number and reply
              "Delivers to <pin> by <date>", which was pure frontend
              fiction: no state lookup, no configured coverage, and a
              delivery date invented from today. It now asks the backend,
              which answers from the states and pincodes the admin
              configured at /admin/serviceability. */}
          <div className="mt-6">
            <PincodeCheck />
          </div>
        </div>
      </div>

      {/* ---------------- TABS ---------------- */}
      <section className="ns-panel overflow-hidden">
        <div className="flex border-b border-brand-100" role="tablist">
          {(["description", "specs"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium transition ${
                tab === key
                  ? "border-b-2 border-brand-600 text-brand-800"
                  : "text-gray-500 hover:text-brand-700"
              }`}
            >
              {key === "description" ? "Description" : "Specifications"}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "description" ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
              {product.description?.trim() || "No description has been added for this product yet."}
            </p>
          ) : (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {specs.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-brand-50 pb-2">
                  <dt className="text-sm text-gray-500">{label}</dt>
                  <dd className="text-sm font-medium text-gray-800">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* ---------------- RELATED ---------------- */}
      <ReviewsSection productId={product.id} productName={product.name} />

      {related.length > 0 && (
        <section>
          <h2 className="ns-section-title mb-4">You might also like</h2>
          <div className="ns-stagger ns-grid-products">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} onAddToCart={(item) => addToCart(item.id, 1)} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-12 space-y-10">
        <PersonalPicks excludeId={product.id} />
        <RecentlyViewed excludeId={product.id} />
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProductDetailInner />
    </Suspense>
  );
}
