"use client";

// ===========================================================
// components.tsx - every reusable UI piece lives here.
// Navbar, Footer, ProductCard, CategoryCard, SearchBar,
// Loading, AdminSidebar, etc. Import what you need from
// this single file into your pages.
// ===========================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Product, Category, AppUser, Address } from "./types";
import {
  getCart,
  uploadFile,
  adminVerify,
  getMe,
  getStoredToken,
  setStoredToken,
} from "./api";
import { PLACEHOLDER_IMAGE, resolveImageUrlOrNull } from "./imageUrl";

// ---------------- Auth context ----------------
// Wraps the whole app (see layout.tsx). Firebase has been removed - the
// signed-in account is just a token in localStorage (see api.ts). On load,
// if a token is already stored, it is verified against /api/auth/me so a
// refresh doesn't sign anyone out; a bad/expired token is discarded quietly.

type AuthContextValue = {
  appUser: AppUser | null;
  loading: boolean;
  /** Called by the login/register pages right after a successful API call. */
  setSession: (token: string, user: AppUser) => void;
  refreshAppUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  appUser: null,
  loading: true,
  setSession: () => {},
  refreshAppUser: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromStoredToken = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setAppUser(null);
      return;
    }
    try {
      const user = await getMe(token);
      setAppUser(user);
    } catch {
      // Token is missing, expired, or invalid - clear it rather than keep
      // sending a doomed Authorization header on every request.
      setStoredToken(null);
      setAppUser(null);
    }
  }, []);

  useEffect(() => {
    loadFromStoredToken().finally(() => setLoading(false));
  }, [loadFromStoredToken]);

  return (
    <AuthContext.Provider
      value={{
        appUser,
        loading,
        setSession: (token, user) => {
          setStoredToken(token);
          setAppUser(user);
        },
        refreshAppUser: loadFromStoredToken,
        signOut: async () => {
          setStoredToken(null);
          setAppUser(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ---------------- Cart count context ----------------
// Small shared counter so the navbar badge updates whenever any page adds,
// removes, or changes cart items - pages just call refreshCart() after.

type CartContextValue = { count: number; refreshCart: () => Promise<void> };

const CartContext = createContext<CartContextValue>({ count: 0, refreshCart: async () => {} });

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { appUser } = useAuth();
  const [count, setCount] = useState(0);

  const refreshCart = useCallback(async () => {
    if (!appUser) {
      setCount(0);
      return;
    }
    try {
      const items = await getCart(appUser.id);
      setCount(items.reduce((sum, item) => sum + item.quantity, 0));
    } catch {
      setCount(0);
    }
  }, [appUser]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  return <CartContext.Provider value={{ count, refreshCart }}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}

// ---------------- Layout pieces ----------------
// Navbar and Footer now live in ui.tsx, because they need wishlist state
// and this file must not import from ui.tsx (that would be a cycle).

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-gray-500">
      {label}
    </div>
  );
}

// ---------------- Image primitives ----------------

/**
 * <SafeImage> is the ONLY way images should be rendered in this app.
 *
 * It solves the three problems the old <img> tags had:
 *  - a missing/empty url rendered a broken-image icon
 *  - a url that 404s (deleted file, stale row) rendered a broken-image icon
 *  - images of different aspect ratios made the grid jump around
 *
 * It always reserves its box, shows a shimmer while loading, and falls
 * back to an inline placeholder on error. `fit` defaults to "cover"
 * (fills the box, used on cards) - pass "contain" where the whole
 * product must be visible and must not be cropped.
 */
export function SafeImage({
  src,
  mobileSrc,
  alt,
  className = "",
  imgClassName = "",
  fit = "cover",
  sizes,
  priority = false,
}: {
  src?: string | null;
  /** Optional phone-sized crop (<640px). Falls back to `src`. */
  mobileSrc?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  /**
   * cover  - fills the box, may crop.
   * contain - whole image, may leave empty bars.
   * blur   - NEVER crops and never leaves bars: the whole image sits on top of a
   *          blurred, enlarged copy of itself (the Flipkart/Amazon banner look).
   *          Use for category art and banners whose aspect ratio is unknown.
   */
  fit?: "cover" | "contain" | "blur";
  sizes?: string;
  /** Above-the-fold image (hero): load eagerly instead of lazily. */
  priority?: boolean;
}) {
  // Single shared resolver (imageUrl.ts): Cloudinary/absolute URLs are
  // untouched, /uploads/... gets the API origin once, blob:/data: pass through.
  const desktop = resolveImageUrlOrNull(src);
  const mobile = resolveImageUrlOrNull(mobileSrc);
  const primary = desktop ?? mobile;

  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Follow prop changes (gallery navigation, admin re-upload).
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [desktop, mobile]);

  // Server-rendered <img> can finish (or fail) BEFORE React hydrates, so
  // onLoad/onError never fire and the image would stay at opacity-0
  // forever. Check the element's real state after mount.
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !el.complete) return;
    if (el.naturalWidth > 0) setLoaded(true);
    else if (el.currentSrc && !el.currentSrc.startsWith("data:")) {
      console.error("[SafeImage] failed to load (before hydration):", el.currentSrc);
      setFailed(true);
    }
  }, [desktop, mobile, failed]);

  const usePlaceholder = failed || !primary;
  const showMobileSource = !usePlaceholder && !!mobile && !!desktop && mobile !== desktop;

  return (
    <div className={`relative overflow-hidden bg-brand-50 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-brand-50 via-brand-100/60 to-brand-50" />
      )}
      {fit === "blur" && !usePlaceholder && primary && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={primary}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl"
        />
      )}
      <picture className="contents">
        {showMobileSource && <source media="(max-width: 639px)" srcSet={mobile!} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={usePlaceholder ? PLACEHOLDER_IMAGE : primary!}
          alt={alt}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            // Not silent: the exact URL that failed goes to the console so
            // a broken image can be diagnosed from DevTools (Network tab shows why).
            console.error("[SafeImage] failed to load:", primary);
            setFailed(true);
            setLoaded(true);
          }}
          className={`w-full h-full transition-opacity duration-300 ${
            fit === "contain" || fit === "blur" ? "object-contain" : "object-cover"
          } ${fit === "blur" ? "relative" : ""} ${loaded || usePlaceholder ? "opacity-100" : "opacity-0"} ${imgClassName}`}
        />
      </picture>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-brand-100/70 ${className}`} />;
}

/** Card-shaped placeholder used while a product grid is loading. */
export function ProductCardSkeleton() {
  return (
    <div className="ns-card overflow-hidden">
      <Skeleton className="aspect-square rounded-none" />
      <div className="p-3.5 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

// ---------------- Catalog pieces ----------------
// ProductCard and CategoryCard live in ui.tsx for the same reason as
// Navbar/Footer: they render the wishlist heart.

// ---------------- Image upload widgets ----------------
// Shared by Admin > Add/Edit Product (multiple product images) and the
// customer-facing product customization panel (single design upload).
// Both use the existing public POST /api/upload endpoint via uploadFile()
// in api.ts - no separate storage system.

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGE_MB = 5;

function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" isn't a supported image type. Use PNG, JPG, JPEG or WEBP.`;
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    return `"${file.name}" is larger than ${MAX_IMAGE_MB}MB.`;
  }
  return null;
}

// Admin multi-image manager. Treats thumbnailUrl + images[] as one ordered
// gallery where position 0 is always the primary/main image - matches how
// the backend already models a product (a single thumbnailUrl plus an
// ordered images list), so no new API shape is needed.
export function MultiImageUploader({
  thumbnailUrl,
  images,
  onChange,
}: {
  thumbnailUrl: string;
  images: string[];
  onChange: (next: { thumbnailUrl: string; images: string[] }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const all = [thumbnailUrl, ...images].filter(Boolean);

  function applyAll(nextAll: string[]) {
    const [first, ...rest] = nextAll;
    onChange({ thumbnailUrl: first ?? "", images: rest });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const problem = validateImageFile(file);
      if (problem) {
        setError(problem);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    setUploading(true);
    try {
      const uploaded = await Promise.all(valid.map((f) => uploadFile(f, "products")));
      applyAll([...all, ...uploaded]);
    } catch (e: any) {
      setError(e.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(index: number) {
    applyAll(all.filter((_, i) => i !== index));
  }

  function handleSetPrimary(index: number) {
    if (index === 0) return;
    applyAll([all[index], ...all.filter((_, i) => i !== index)]);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...all];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    applyAll(next);
    setDragIndex(null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-2">
        {all.map((url, i) => (
          <div
            key={`${url}-${i}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            className={`relative w-24 h-24 rounded-lg overflow-hidden border-2 cursor-move group bg-gray-50 ${
              i === 0 ? "border-orange-600" : "border-gray-200"
            }`}
          >
            <SafeImage src={url} alt={`Product image ${i + 1}`} className="w-full h-full" />
            {i === 0 && (
              <span className="absolute top-1 left-1 bg-orange-700 text-white text-[10px] px-1.5 py-0.5 rounded">
                Main
              </span>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1">
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => handleSetPrimary(i)}
                  className="text-[10px] bg-white text-gray-900 rounded px-1.5 py-0.5"
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="text-[10px] bg-red-600 text-white rounded px-1.5 py-0.5"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs text-center cursor-pointer hover:border-orange-500 hover:text-orange-600 transition"
        >
          + Add Images
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {uploading && <p className="text-xs text-gray-500 mb-1">Uploading...</p>}
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      {all.length > 0 && (
        <p className="text-xs text-gray-400">
          Drag to reorder · first image is the main image · hover an image to set primary or remove.
        </p>
      )}
    </div>
  );
}

// Customer-facing single design upload for customizable products. Kept
// deliberately simple (one image, no crop/position UI yet) but designed to
// be extended later with positioning/scaling/rotation/multiple design areas
// without changing this component's public props.
export function ProductDesignUpload({
  designUrl,
  onDesignChange,
}: {
  designUrl: string | null;
  onDesignChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "designs");
      onDesignChange(url);
    } catch (e: any) {
      setError(e.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {!designUrl ? (
        <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 rounded-lg py-8 px-4 text-center cursor-pointer hover:border-orange-500 transition">
          <span className="text-2xl" aria-hidden>
            ⬆️
          </span>
          <span className="text-sm font-medium text-gray-700">Upload Your Design</span>
          <span className="text-xs text-gray-400">PNG / JPG / JPEG / WEBP, up to {MAX_IMAGE_MB}MB</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
          <div className="w-16 h-16 rounded border border-gray-200 overflow-hidden bg-gray-50 shrink-0">
            <SafeImage src={designUrl} alt="Your uploaded design" fit="contain" className="w-full h-full" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-green-700">✓ Design uploaded</span>
            <div className="flex gap-3">
              <label className="text-sm text-orange-700 underline cursor-pointer">
                Change Image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => onDesignChange(null)}
                className="text-sm text-red-600 underline"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {uploading && <p className="text-xs text-gray-500 mt-2">Uploading...</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// Overlays the customer's uploaded design centered on whatever product
// image container this is placed inside (parent needs position: relative).
// Extensible on purpose: later positioning/scaling/rotation controls can
// just change the inline style passed here instead of reworking callers.
export function DesignPreviewOverlay({
  designUrl,
  style,
}: {
  designUrl: string | null;
  style?: React.CSSProperties;
}) {
  if (!designUrl) return null;
  return (
    <div
      className="absolute w-24 h-24 border-2 border-white shadow-lg rounded overflow-hidden bg-white/80"
      style={style ?? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <SafeImage src={designUrl} alt="Your design preview" fit="contain" className="w-full h-full" />
    </div>
  );
}

export function SearchBar({
  defaultValue = "",
  onSearch,
}: {
  defaultValue?: string;
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value);
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search products..."
        className="flex-1 border border-gray-300 rounded px-3 py-2"
      />
      <button type="submit" className="bg-orange-700 text-white px-4 py-2 rounded">
        Search
      </button>
    </form>
  );
}

export function StockBadge({ quantity }: { quantity: number }) {
  let label = "In Stock";
  let color = "text-green-600";
  if (quantity <= 0) {
    label = "Out of Stock";
    color = "text-red-600";
  } else if (quantity <= 5) {
    label = "Low Stock";
    color = "text-yellow-600";
  }
  return <span className={`text-sm font-medium ${color}`}>{label}</span>;
}

// ---------------- Cart / address pieces ----------------

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="inline-flex items-center border border-gray-300 rounded">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="px-2 py-1 text-gray-600 hover:bg-gray-100"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="px-3 text-sm font-medium min-w-[2rem] text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        className="px-2 py-1 text-gray-600 hover:bg-gray-100"
        aria-label="Increase quantity"
        disabled={max !== undefined && value >= max}
      >
        +
      </button>
    </div>
  );
}

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: Address;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  return (
    <div className={`border rounded-lg p-4 ${address.isDefault ? "border-orange-600 bg-orange-50" : "border-gray-200"}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">
            {address.fullName}{" "}
            {address.isDefault && (
              <span className="text-xs bg-orange-700 text-white rounded px-2 py-0.5 ml-1">Default</span>
            )}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {address.houseBuilding}, {address.street}
            {address.area ? `, ${address.area}` : ""}
            <br />
            {address.city}, {address.state} - {address.pincode}
            {address.landmark ? <><br />Landmark: {address.landmark}</> : null}
            <br />
            Phone: {address.phone}
          </div>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-sm">
        <button onClick={onEdit} className="text-orange-700 underline">
          Edit
        </button>
        <button onClick={onDelete} className="text-red-600 underline">
          Delete
        </button>
        {!address.isDefault && (
          <button onClick={onSetDefault} className="text-gray-600 underline">
            Set as default
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- App shell ----------------
// The admin panel must not look like the storefront. Previously the root
// layout wrapped EVERY route in the customer Navbar, Footer and a
// max-w-6xl <main>, so /admin/* inherited customer branding and the
// dashboard was squeezed into a 1152px column.
//
// This splits the two chromes at one place. Admin routes render edge to
// edge with no customer navigation; everything else is unchanged.

export function AppShell({
  navbar,
  footer,
  children,
}: {
  navbar: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdmin) {
    return (
      <main id="main-content" className="min-h-screen bg-ivory">
        {children}
      </main>
    );
  }

  return (
    <>
      {navbar}
      <main id="main-content" className="mx-auto min-h-[70vh] max-w-6xl px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>
      {footer}
      <MobileTabBar />
    </>
  );
}

/**
 * Phone-only bottom navigation (hidden from md up, where the header has it all).
 * Home / Shop / Wishlist / Cart (live count) / Account.
 */
function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  const { count } = useCart();
  const items = [
    { href: "/", label: "Home", icon: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10" },
    { href: "/products", label: "Shop", icon: "M4 4h16v4H4zM4 12h7v8H4zM15 12h5v8h-5z" },
    { href: "/wishlist", label: "Saved", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" },
    { href: "/cart", label: "Cart", icon: "M3 4h2l2.4 11h10.2L20 7H6.5M9 20h.01M17 20h.01" },
    { href: "/account", label: "Account", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c.8-4 3.6-6 8-6s7.2 2 8 6" },
  ];
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-brand-100 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(34,20,15,0.08)] backdrop-blur md:hidden"
    >
      <div className="kar-silk-thin" />
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  active ? "text-brand-700" : "text-coffee-700/70"
                }`}
              >
                <span className="relative">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={it.icon} />
                  </svg>
                  {it.href === "/cart" && count > 0 && (
                    <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>
                {it.label}
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-gold-400" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---------------- Admin session ----------------
// Separate from customer auth on purpose - the same browser could have a
// customer signed in on the storefront AND an admin signed in on /admin.
// Firebase has been removed: the token is just our own signed session
// token (see Security.java / api.ts login()), stored under its own key.
//
// A non-secret marker cookie is set alongside it so middleware.ts can
// redirect /admin/* BEFORE the admin HTML is ever rendered. The cookie
// carries no privileges - every admin API call is re-authorised by
// AdminAuthFilter against the role in PostgreSQL.

export const ADMIN_TOKEN_KEY = "namma_admin_token";
export const ADMIN_SESSION_COOKIE = "namma_admin_session";

/** Marker cookie read by middleware.ts. Contains no token and no secret. */
export function setAdminSessionCookie() {
  if (typeof document === "undefined") return;
  // Session cookie: cleared when the browser closes. SameSite=Lax blocks
  // it from riding along on cross-site requests.
  document.cookie = `${ADMIN_SESSION_COOKIE}=1; path=/; SameSite=Lax`;
}

export function clearAdminSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${ADMIN_SESSION_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

/* ---------------------------------------------------------------
   TAB-SCOPED ADMIN SESSIONS
   The Super Admin and a Company Admin can both be signed in at the same
   time (two tabs, two browsers, two devices) without disturbing each other:
     - each TAB keeps its own token in sessionStorage -> a second login in
       another tab can never replace this tab's identity;
     - localStorage keeps one remembered token PER ROLE, so a brand-new tab
       can pick up where that role left off;
     - logging out ends only this tab's session (and its role entry).
   Server side the tokens are stateless, so concurrent sessions never clash.
   --------------------------------------------------------------- */

const ADMIN_TOKENS_KEY = "namma_admin_tokens";
type AdminTokens = { SUPER_ADMIN?: string; COMPANY_ADMIN?: string; last?: "SUPER_ADMIN" | "COMPANY_ADMIN" };

function readAdminTokens(): AdminTokens {
  try {
    return JSON.parse(window.localStorage.getItem(ADMIN_TOKENS_KEY) ?? "{}") as AdminTokens;
  } catch {
    return {};
  }
}
function writeAdminTokens(t: AdminTokens) {
  try {
    window.localStorage.setItem(ADMIN_TOKENS_KEY, JSON.stringify(t));
  } catch {
    /* storage blocked - this tab still works via sessionStorage */
  }
}

export function hasAnyAdminToken(): boolean {
  if (typeof window === "undefined") return false;
  const t = readAdminTokens();
  return !!(window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || t.SUPER_ADMIN || t.COMPANY_ADMIN);
}

/** This tab's admin token (adopting the last-used role's token in a fresh tab). */
export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  const own = window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (own) return own;

  const t = readAdminTokens();
  const role = t.last && t[t.last] ? t.last : t.SUPER_ADMIN ? "SUPER_ADMIN" : t.COMPANY_ADMIN ? "COMPANY_ADMIN" : null;
  let tok = role ? (t[role] ?? null) : null;

  // Sessions created before this change lived under the old shared key.
  if (!tok) {
    tok = window.localStorage.getItem(ADMIN_TOKEN_KEY);
    if (tok) window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
  if (tok) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, tok);
  return tok;
}

/** Called by app/admin/login/page.tsx right after a successful login + verify. */
export function startAdminSession(token: string, role?: string | null) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  if (role === "SUPER_ADMIN" || role === "COMPANY_ADMIN") {
    const t = readAdminTokens();
    t[role] = token;
    t.last = role;
    writeAdminTokens(t);
  }
  setAdminSessionCookie();
}

/** Ends THIS tab's session only. The other role's session (if any) keeps working. */
export function endAdminSession() {
  if (typeof window === "undefined") return;
  const own = window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
  window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  const t = readAdminTokens();
  (["SUPER_ADMIN", "COMPANY_ADMIN"] as const).forEach((r) => {
    if (own && t[r] === own) delete t[r];
  });
  if (t.last && !t[t.last]) t.last = t.SUPER_ADMIN ? "SUPER_ADMIN" : t.COMPANY_ADMIN ? "COMPANY_ADMIN" : undefined;
  writeAdminTokens(t);
  // The marker cookie is shared by every tab: only drop it when NO admin session remains.
  if (!t.SUPER_ADMIN && !t.COMPANY_ADMIN) clearAdminSessionCookie();
}

type AdminRole = "SUPER_ADMIN" | "COMPANY_ADMIN" | "INFLUENCER" | "CUSTOMER";

export function useAdminSession() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [checked, setChecked] = useState(false);

  const signOutAdmin = useCallback(async () => {
    endAdminSession();
    router.replace("/admin/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const stored = getAdminToken();
      if (!stored) {
        if (!hasAnyAdminToken()) clearAdminSessionCookie();
        if (!cancelled) {
          setToken(null);
          setChecked(true);
        }
        router.replace("/admin/login");
        return;
      }

      try {
        const result = await adminVerify(stored);
        if (cancelled) return;
        setAdminSessionCookie();
        setToken(stored);
        setRole(result.role ?? null);
        setCompanyId(result.companyId ?? null);
        setCompanyName(result.companyName ?? null);
        setCompanyLogoUrl(result.companyLogoUrl ?? null);
        setDisplayName(result.displayName ?? null);
        setMustChangePassword(!!result.mustChangePassword);
        // A company's one-time password must be replaced before anything else.
        if (result.mustChangePassword && !window.location.pathname.startsWith("/admin/change-password")) {
          router.replace("/admin/change-password");
        }
      } catch {
        if (cancelled) return;
        // Token rejected, expired, or the account is no longer an admin.
        endAdminSession();
        setToken(null);
        router.replace("/admin/login?error=not-admin");
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function logoutAdmin() {
    void signOutAdmin();
  }

  return { token, role, companyId, companyName, companyLogoUrl, displayName, mustChangePassword, checked, logoutAdmin };
}

// ---------------- Admin pieces ----------------

/* ===========================================================
   ADMIN SHELL  (Karnataka control-centre look)
   Deep-coffee sidebar, silk-stripe rule, gold active marker.
   Super admin and company admin get DIFFERENT menus - the backend
   enforces the same split, the menu just doesn't offer dead ends.
   =========================================================== */

type AdminIconName =
  | "dashboard" | "products" | "categories" | "banners" | "influencers" | "coupons"
  | "orders" | "delivery" | "users" | "customize" | "companies" | "affiliate" | "store" | "logout" | "menu";

export function AdminIcon({ name, className = "h-5 w-5" }: { name: AdminIconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const paths: Record<AdminIconName, React.ReactNode> = {
    dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
    products: (<><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>),
    categories: (<><path d="M4 6h16M4 12h16M4 18h10" /></>),
    banners: (<><rect x="3" y="5" width="18" height="12" rx="2" /><path d="m3 14 5-4 4 3 3-2 6 4M8 20h8" /></>),
    influencers: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5" /><path d="M17 5.5a3 3 0 0 1 0 5.5M18.5 15c1.6.6 2.5 2 2.8 4" /></>),
    coupons: (<><path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3Z" /><path d="M14 6v12" strokeDasharray="2 2.5" /></>),
    orders: (<><path d="M6 3h12l2 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z" /><path d="M4 7h16M9 11a3 3 0 0 0 6 0" /></>),
    delivery: (<><path d="M2 6h11v10H2zM13 9h5l3 3v4h-8" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>),
    users: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-4 3.5-6 7-6s6.2 2 7 6" /></>),
    customize: (<><path d="m4 20 4-1 11-11a2.1 2.1 0 0 0-3-3L5 16Z" /><path d="m14 7 3 3" /></>),
    companies: (<><path d="M4 21V7l8-4 8 4v14" /><path d="M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01" /></>),
    affiliate: (<><path d="M3 17 9 11l4 4 8-8" /><path d="M15 7h6v6" /></>),
    store: (<><path d="M3 9 5 4h14l2 5" /><path d="M4 9v11h16V9M9 20v-6h6v6" /></>),
    logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>),
    menu: (<><path d="M4 7h16M4 12h16M4 17h16" /></>),
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...p}>
      {paths[name]}
    </svg>
  );
}

type NavLink = { href: string; label: string; icon: AdminIconName };

export function AdminSidebar() {
  const { logoutAdmin, role, companyName, companyLogoUrl, displayName } = useAdminSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isCompany = role === "COMPANY_ADMIN";

  const sections: { title: string; links: NavLink[] }[] = isCompany
    ? [
        {
          title: "Your company",
          links: [
            { href: "/admin", label: "Dashboard", icon: "dashboard" },
            { href: "/admin/products", label: "My Products", icon: "products" },
            { href: "/admin/orders", label: "My Orders", icon: "orders" },
            { href: "/admin/returns", label: "Returns & Refunds", icon: "delivery" },
          ],
        },
      ]
    : [
        {
          title: "Overview",
          links: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }],
        },
        {
          title: "Marketplace",
          links: [
            { href: "/admin/companies", label: "Companies", icon: "companies" },
            { href: "/admin/products", label: "Products", icon: "products" },
            { href: "/admin/categories", label: "Categories", icon: "categories" },
            { href: "/admin/orders", label: "Orders", icon: "orders" },
            { href: "/admin/returns", label: "Returns & Refunds", icon: "delivery" },
            { href: "/admin/users", label: "Customers & Users", icon: "users" },
          ],
        },
        {
          title: "Growth",
          links: [
            { href: "/admin/banners", label: "Banners & Offers", icon: "banners" },
            { href: "/admin/affiliate", label: "Affiliate Sales", icon: "affiliate" },
            { href: "/admin/influencers", label: "Influencers", icon: "influencers" },
            { href: "/admin/coupons", label: "Coupons", icon: "coupons" },
          ],
        },
        {
          title: "Store settings",
          links: [
            { href: "/admin/serviceability", label: "Delivery & Serviceability", icon: "delivery" },
            { href: "/admin/customize", label: "Customize Catalog", icon: "customize" },
          ],
        },
      ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");

  const nav = (
    <div className="kar-lattice-dark flex h-full flex-col bg-coffee-950 text-brand-100">
      <div className="kar-silk" />
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpeg"
            alt=""
            className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-0.5 ring-2 ring-gold-400"
          />
          <div className="min-w-0 leading-tight">
            <p className="font-kannada text-lg font-semibold text-gold-200">ನಮ್ಮ ಸ್ಟೋರ್</p>
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-brand-200/80">
              {isCompany ? "Company portal" : "Control centre"}
            </p>
          </div>
        </div>

        {isCompany && (
          <div className="mt-4 rounded-xl border border-gold-400/30 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-widest text-gold-300">You are managing</p>
            <div className="mt-1 flex items-center gap-2">
              {companyLogoUrl && (
                <SafeImage src={companyLogoUrl} alt="" className="h-7 w-7 shrink-0 overflow-hidden rounded-full" />
              )}
              <p className="truncate font-heading text-sm font-semibold text-white">{companyName ?? "Your company"}</p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Admin sections">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300/70">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.links.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md"
                        : "text-brand-100/80 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {active && <span className="absolute -left-3 top-2 h-6 w-1 rounded-r bg-gold-400" />}
                    <AdminIcon name={l.icon} className={`h-[18px] w-[18px] ${active ? "text-gold-200" : "text-brand-300 group-hover:text-gold-200"}`} />
                    <span className="truncate">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        {displayName && <p className="mb-2 truncate px-3 text-xs text-brand-200/80">Signed in as {displayName}</p>}
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-brand-100/80 transition hover:bg-white/[0.08] hover:text-white"
        >
          <AdminIcon name="store" className="h-[18px] w-[18px]" /> View storefront
        </Link>
        <button
          onClick={logoutAdmin}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-brand-100/80 transition hover:bg-white/[0.08] hover:text-white"
        >
          <AdminIcon name="logout" className="h-[18px] w-[18px]" /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Phone / small tablet: top bar + slide-in drawer. */}
      <div className="sticky top-0 z-[60] flex items-center justify-between bg-coffee-950 px-4 py-3 shadow-lg lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          className="rounded-lg p-2 text-gold-200 transition hover:bg-white/10"
        >
          <AdminIcon name="menu" className="h-6 w-6" />
        </button>
        <span className="font-kannada font-semibold text-gold-200">
          ನಮ್ಮ ಸ್ಟೋರ್ <span className="font-heading text-xs font-normal text-brand-200">{isCompany ? (companyName ?? "Company") : "Admin"}</span>
        </span>
        <span className="w-10" />
      </div>
      <div className="kar-silk-thin lg:hidden" />

      {open && (
        <div className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 h-full w-72 max-w-[84vw] overflow-hidden shadow-2xl"
            style={{ animation: "kar-rise .25s ease-out both" }}
          >
            {nav}
          </aside>
        </div>
      )}

      {/* Laptop / desktop: fixed sidebar. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{nav}</aside>
    </>
  );
}

/**
 * Page header used at the top of every admin screen: title, subtitle and an
 * optional action area, on a lattice strip with a silk rule beneath.
 */
export function AdminPageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="relative overflow-hidden border-b border-brand-100 bg-white">
      <div className="kar-lattice pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-4 px-4 py-6 md:px-8">
        <div className="min-w-0 anim-rise">
          {eyebrow && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-600">{eyebrow}</p>
          )}
          <h1 className="font-display text-2xl font-bold text-coffee-900 md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-coffee-700/80">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 anim-rise-2">{actions}</div>}
      </div>
      <div className="kar-silk-thin" />
    </header>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  trend,
  tone = "red",
}: {
  /** % change vs the previous period (real data). Null/undefined = nothing to compare. */
  trend?: number | null;
  label: string;
  value: string | number;
  icon?: AdminIconName;
  hint?: string;
  tone?: "red" | "gold" | "green" | "coffee";
}) {
  const toneBg: Record<string, string> = {
    red: "linear-gradient(145deg,#BF2A1E,#7A1816)",
    gold: "linear-gradient(145deg,#F5B90A,#A87300)",
    green: "linear-gradient(145deg,#2F8F5B,#1E5E3B)",
    coffee: "linear-gradient(145deg,#4A2E1F,#170D0A)",
  };
  return (
    <div className="adm-kpi kar-corner anim-rise">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-coffee-700/70">{label}</p>
          <p className="mt-2 truncate font-display text-2xl font-bold text-coffee-900 md:text-[1.7rem]">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-coffee-700/75">{hint}</p>}
          {trend != null && Number.isFinite(trend) && (
            <p className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trend >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(0)}% <span className="font-normal opacity-70">vs prev 7 days</span>
            </p>
          )}
        </div>
        {icon && (
          <span className="adm-kpi-icon shrink-0" style={{ background: toneBg[tone] }}>
            <AdminIcon name={icon} className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}

export function AdminTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="ns-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-brand-100 bg-gradient-to-r from-brand-50 to-gold-50/60">
              {headers.map((h) => (
                <th key={h} className="adm-th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-brand-50 transition hover:bg-gold-50/50">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 align-middle text-sm text-coffee-900">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
