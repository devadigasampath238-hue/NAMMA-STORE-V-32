// ===========================================================
// imageUrl.ts - the ONE place image URLs are interpreted.
//
// Every image in the app (banners, products, categories,
// influencers, avatars, cart/wishlist/orders, admin previews,
// customizer designs) goes through resolveImageUrl() /
// resolveImageUrlOrNull(), usually via <SafeImage> in
// components.tsx. Nothing else may prefix a host onto a URL.
//
// Rules:
//  - Cloudinary / any absolute http(s) URL is returned untouched.
//  - "//host/x" gets https: (protocol-relative).
//  - data: and blob: URLs (admin upload previews) are untouched.
//  - "res.cloudinary.com/..." without a scheme gets https://.
//  - "/uploads/x.jpg" or "uploads/x.jpg" is prefixed with the API
//    origin exactly once.
//  - A corrupted value such as "http://localhost:8080https://res..."
//    is repaired to the real absolute URL, never doubled.
//  - null / undefined / "" / "null" / "undefined" / the banner
//    upload marker "/uploads/banners/pending" -> no image.
// ===========================================================

import type { Banner, Product } from "./types";

/** API origin (no trailing slash). Same env var api.ts uses for requests. */
export const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
).replace(/\/+$/, "");

/** Inline SVG shown whenever an image is missing or fails to load. */
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
       <rect width="400" height="400" fill="#FDF6EC"/>
       <g fill="none" stroke="#E7C9A3" stroke-width="8" stroke-linecap="round">
         <rect x="118" y="132" width="164" height="128" rx="12"/>
         <path d="M140 232l40-44 32 34 26-24 32 34"/>
       </g>
       <circle cx="168" cy="172" r="12" fill="#E7C9A3"/>
       <text x="200" y="300" font-family="system-ui,sans-serif" font-size="20"
             fill="#B08968" text-anchor="middle">No image</text>
     </svg>`
  );

/** Temporary value the admin banner form stores before the real upload lands. */
const PENDING_MARKER = /^\/?uploads\/banners\/pending$/i;

/**
 * Resolves any backend/Cloudinary image value to a loadable URL,
 * or null when there is genuinely no image.
 */
export function resolveImageUrlOrNull(url?: string | null): string | null {
  if (typeof url !== "string") return null;
  let value = url.trim();
  if (!value) return null;

  const lower = value.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;

  // Local-only URLs: use as is.
  if (lower.startsWith("data:") || lower.startsWith("blob:")) return value;

  // Repair "<origin>https://res.cloudinary.com/..." (a host glued in front
  // of an already-absolute URL). Keep only the last absolute URL.
  const lastAbs = Math.max(
    value.toLowerCase().lastIndexOf("https://"),
    value.toLowerCase().lastIndexOf("http://")
  );
  if (lastAbs > 0) value = value.slice(lastAbs);

  // Already absolute (Cloudinary, R2/S3, backend) - never touch it.
  if (/^https?:\/\//i.test(value)) return value;

  // LEGACY upload paths: "//categories/x.jpg", "/categories/x.jpg", "categories/x.jpg".
  // These are OUR files, not hosts. They become /uploads/<folder>/x.jpg on the
  // API origin - NEVER https://categories/x.jpg (ERR_NAME_NOT_RESOLVED).
  value = value.replace(/\\/g, "/");
  if (/^\/{0,2}(products|categories|banners|avatars|designs|influencers|companies)\//i.test(value)) {
    value = "/uploads/" + value.replace(/^\/+/, "");
  }

  // Protocol-relative with a REAL host (//res.cloudinary.com/...).
  if (value.startsWith("//")) return `https:${value}`;

  // Cloudinary host without a scheme.
  if (/^res\.cloudinary\.com\//i.test(value)) return `https://${value}`;

  // Relative path from the backend (/uploads/...). Normalise slashes.
  value = value.replace(/\\/g, "/");
  if (PENDING_MARKER.test(value)) return null;
  return `${API_ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** Always returns a string: the resolved URL, or the placeholder. */
export function resolveImageUrl(url?: string | null): string {
  return resolveImageUrlOrNull(url) ?? PLACEHOLDER_IMAGE;
}

/** First candidate that resolves to a real image, else null. */
export function firstImageUrl(
  ...candidates: Array<string | null | undefined | Array<string | null | undefined>>
): string | null {
  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const item of c) {
        const r = resolveImageUrlOrNull(item);
        if (r) return r;
      }
    } else {
      const r = resolveImageUrlOrNull(c);
      if (r) return r;
    }
  }
  return null;
}

/** First usable image for a product, with a graceful fallback. */
export function productImage(product?: Partial<Product> | null): string {
  if (!product) return PLACEHOLDER_IMAGE;
  return firstImageUrl(product.thumbnailUrl, product.images) ?? PLACEHOLDER_IMAGE;
}

/**
 * Desktop + mobile artwork for a banner.
 *  desktop: imageUrl -> images[0] -> mobileImageUrl
 *  mobile : mobileImageUrl (null when the admin didn't upload a crop)
 */
export function bannerImageSources(
  banner?: Partial<Banner> | null
): { desktop: string | null; mobile: string | null } {
  if (!banner) return { desktop: null, mobile: null };
  const mobile = resolveImageUrlOrNull(banner.mobileImageUrl);
  const desktop = firstImageUrl(banner.imageUrl, banner.images, banner.mobileImageUrl);
  return { desktop, mobile };
}
