// ===========================================================
// api.ts - every fetch call to the backend lives here.
// Change the backend URL, headers, or error handling in ONE
// place: this file.
//
// STAGE 1 additions:
//  - resolveImageUrl() / PLACEHOLDER_IMAGE for safe image handling
//  - product + category image management endpoints (upload,
//    delete, set primary, reorder) so images are managed from
//    the admin UI instead of pgAdmin
//  - cart summary + richer checkout payload (server-priced)
//  - profile update + profile photo upload
// ===========================================================

import type {
  Product,
  Category,
  CartItem,
  CartSummary,
  Order,
  AppUser,
  Address,
  CustomizableProduct,
  DashboardStats,
  CheckoutPayload,
  Coupon,
  CouponEvaluation,
  CouponPayload,
  WishlistStatus,
  Banner,
  BannerPayload,
  Serviceability,
  DeliveryState,
  DeliveryPincode,
  Company,
  Influencer,
  InfluencerPayload,
  AdminCoupon,
  TrackingEvent,
  ReturnReason,
  ItemReturn,
  Review,
  ReviewSummary,
  AffiliateSummary,
  AffiliateInfluencerRow,
  AffiliateInfluencerDetail,
  CommissionRow,
  CommissionFilters,
  CommissionStatus,
} from "./types";

import { API_ORIGIN } from "./imageUrl";

export const BASE_URL = API_ORIGIN;

// Image helpers live in imageUrl.ts (single source of truth). Re-exported
// here so existing "from './api'" imports keep working.
export {
  PLACEHOLDER_IMAGE,
  resolveImageUrl,
  resolveImageUrlOrNull,
  firstImageUrl,
  productImage,
  bannerImageSources,
} from "./imageUrl";

/**
 * ===========================================================
 * OUR OWN SESSION TOKEN (Firebase has been removed completely)
 * -----------------------------------------------------------
 * After a successful /api/auth/login or /api/auth/register call,
 * the backend returns { token, user }. setStoredToken() saves
 * that token to localStorage; every subsequent request picks it
 * up automatically via currentToken() below and sends it as
 * "Authorization: Bearer <token>", exactly like the Firebase ID
 * token used to be sent - the backend-facing shape is unchanged,
 * only where the token comes from has changed.
 *
 * The backend still never trusts a userId in a URL or request
 * body by itself: every customer-scoped endpoint (cart, orders,
 * wishlist, addresses, profile) resolves the caller from this
 * token and refuses to serve someone else's rows.
 * ===========================================================
 */
const TOKEN_STORAGE_KEY = "namma_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function currentIdToken(): Promise<string | null> {
  // Server components (app/page.tsx fetching the catalog) never have a
  // browser token - and don't need one, since they only hit public endpoints.
  return getStoredToken();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // An explicit Authorization header always wins - that is how the admin
  // screens pass their own verified token.
  if (!headers.Authorization) {
    const token = await currentIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `API error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || message;
      // Spring answers "No static resource <path>" when NO controller is mapped
      // to that URL. That means the running backend is older than this frontend.
      if (res.status === 404 && /No static resource/i.test(String(message))) {
        message =
          `The backend has no endpoint for ${path.split("?")[0]}. ` +
          "It is running an older build - run `mvn clean package` and restart the Spring Boot server.";
      }
    } catch {
      // not JSON - fall back to raw text set above
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

/** Multipart variant: the browser must set its own boundary Content-Type. */
async function upload<T>(
  path: string,
  formData: FormData,
  options: { method?: string; idToken?: string } = {}
): Promise<T> {
  // Never set Content-Type by hand for FormData - the browser has to add
  // the multipart boundary itself.
  const token = options.idToken ?? (await currentIdToken());

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "POST",
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Upload failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || message;
      // Spring answers "No static resource <path>" when NO controller is mapped
      // to that URL. That means the running backend is older than this frontend.
      if (res.status === 404 && /No static resource/i.test(String(message))) {
        message =
          `The backend has no endpoint for ${path.split("?")[0]}. ` +
          "It is running an older build - run `mvn clean package` and restart the Spring Boot server.";
      }
    } catch {
      /* raw text */
    }
    throw new Error(message);
  }
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

function authHeaders(idToken: string) {
  return { Authorization: `Bearer ${idToken}` };
}

// ---------------- Public catalog ----------------

export const getProducts = (
  search?: string,
  sort?: string,
  categoryId?: number,
  featured?: boolean
) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (sort) params.set("sort", sort);
  if (categoryId != null) params.set("categoryId", String(categoryId));
  if (featured) params.set("featured", "true");
  const qs = params.toString();
  return request<Product[]>(`/api/products${qs ? `?${qs}` : ""}`);
};

export const getProduct = (id: number) => request<Product>(`/api/products/${id}`);

export const getRelatedProducts = (id: number, limit = 8) =>
  request<Product[]>(`/api/products/${id}/related?limit=${limit}`);

export const getProductsByCategory = (categoryId: number) =>
  request<Product[]>(`/api/products/category/${categoryId}`);

export const getCategories = (withCounts = false) =>
  request<Category[]>(`/api/categories${withCounts ? "?withCounts=true" : ""}`);

export const getCategory = (id: number) => request<Category>(`/api/categories/${id}`);

// ---------------- Auth / profile ----------------

type AuthResponse = { token: string; user: AppUser };

/** Creates a new CUSTOMER account. Throws with a friendly message on failure. */
export const registerAccount = (payload: {
  name: string;
  email: string;
  phone: string;
  password: string;
}) =>
  request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/**
 * Signs in ANY account - customer, company admin, or the super admin -
 * with either an email address or a mobile number, plus password.
 */
export const login = (payload: { emailOrPhone: string; password: string }) =>
  request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getMe = (idToken: string) =>
  request<AppUser>("/api/auth/me", { headers: authHeaders(idToken) });

export const getUserProfile = (userId: number) =>
  request<AppUser>(`/api/users/${userId}`);

export const updateProfile = (
  userId: number,
  payload: { displayName?: string; phone?: string }
) =>
  request<AppUser>(`/api/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const uploadProfilePhoto = (userId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<AppUser>(`/api/users/${userId}/photo`, formData);
};

export const deleteProfilePhoto = (userId: number) =>
  request<AppUser>(`/api/users/${userId}/photo`, { method: "DELETE" });

export const getAddresses = (userId: number) =>
  request<Address[]>(`/api/users/${userId}/addresses`);

export const addAddress = (userId: number, payload: Partial<Address>) =>
  request<Address>(`/api/users/${userId}/addresses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateAddress = (
  userId: number,
  addressId: number,
  payload: Partial<Address>
) =>
  request<Address>(`/api/users/${userId}/addresses/${addressId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteAddress = (userId: number, addressId: number) =>
  request<void>(`/api/users/${userId}/addresses/${addressId}`, { method: "DELETE" });

export const setDefaultAddress = (userId: number, addressId: number) =>
  request<Address>(`/api/users/${userId}/addresses/${addressId}/default`, {
    method: "PUT",
  });

// ---------------- Cart / checkout ----------------

export const getCart = (userId: number) => request<CartItem[]>(`/api/cart/${userId}`);

export const addToCart = (payload: Partial<CartItem>) =>
  request<CartItem>("/api/cart", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const removeFromCart = (itemId: number) =>
  request<void>(`/api/cart/${itemId}`, { method: "DELETE" });

export const updateCartQuantity = (itemId: number, quantity: number) =>
  request<CartItem>(`/api/cart/${itemId}?quantity=${quantity}`, { method: "PUT" });

export const clearCart = (userId: number) =>
  request<void>(`/api/cart/user/${userId}`, { method: "DELETE" });

/** Server-computed totals. The client must never add these up itself. */
export const getCartSummary = (userId: number, couponCode?: string) => {
  const qs = couponCode ? `?couponCode=${encodeURIComponent(couponCode)}` : "";
  return request<CartSummary>(`/api/cart/${userId}/summary${qs}`);
};

export const checkout = (payload: CheckoutPayload) =>
  request<Order>("/api/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getMyOrders = (userId: number) => request<Order[]>(`/api/orders/${userId}`);

export const getOrderDetail = (orderId: number) =>
  request<Order>(`/api/orders/detail/${orderId}`);

export const getOrderByNumber = (orderNumber: string) =>
  request<Order>(`/api/orders/number/${encodeURIComponent(orderNumber)}`);

export const cancelOrder = (
  orderId: number,
  payload?: { reason?: string; comments?: string }
) =>
  request<Order>(`/api/orders/${orderId}/cancel`, {
    method: "PUT",
    // The backend still re-checks that the order is cancellable and that it
    // belongs to the caller; this body only records WHY.
    body: JSON.stringify(payload ?? {}),
  });

/** Only allowed while the order is DELIVERED and inside the 10-day return window. */
export const requestReturn = (orderId: number, reason?: string) =>
  request<Order>(`/api/orders/${orderId}/return`, {
    method: "PUT",
    body: JSON.stringify({ reason: reason ?? null }),
  });

export const adminUpdateReturnStatus = (
  idToken: string,
  id: number,
  status: "APPROVED" | "REJECTED" | "COMPLETED"
) =>
  request<Order>(`/api/admin/orders/${id}/return-status?status=${status}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---------------- Wishlist ----------------

export const getWishlist = (userId: number) =>
  request<Product[]>(`/api/wishlist/${userId}`);

export const getWishlistCount = (userId: number) =>
  request<{ count: number }>(`/api/wishlist/${userId}/count`);

export const isWishlisted = (userId: number, productId: number) =>
  request<{ wishlisted: boolean }>(`/api/wishlist/${userId}/contains/${productId}`);

export const addToWishlist = (userId: number, productId: number) =>
  request<WishlistStatus>("/api/wishlist", {
    method: "POST",
    body: JSON.stringify({ userId, productId }),
  });

/** Adds if absent, removes if present. One round trip for the heart button. */
export const toggleWishlist = (userId: number, productId: number) =>
  request<WishlistStatus>("/api/wishlist/toggle", {
    method: "POST",
    body: JSON.stringify({ userId, productId }),
  });

export const removeFromWishlist = (userId: number, productId: number) =>
  request<WishlistStatus>(`/api/wishlist/${userId}/${productId}`, { method: "DELETE" });

// ---------------- Coupons ----------------

/**
 * Preview only. Validated against the user's live cart subtotal on the
 * server; the real discount is recomputed inside POST /api/checkout.
 */
export const validateCoupon = (code: string, userId: number) =>
  request<CouponEvaluation>(
    `/api/coupons/validate?code=${encodeURIComponent(code)}&userId=${userId}`
  );

// ---------------- Payments (Razorpay Standard Checkout) ----------------
// The amount is ALWAYS read from the saved order on the server. Only the public
// key id ever reaches the browser; the key secret lives in backend/.env.

export interface PaymentOrder {
  /** Razorpay order id (order_xxx) - what checkout.js needs. */
  order_id: string;
  /** In paise. */
  amount: number;
  currency: string;
  receipt: string;
  key_id: string;
  live: boolean;
  orderId: number;
}

export const createPaymentOrder = (orderId: number) =>
  request<PaymentOrder>("/api/payments/create-order", {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });

export const verifyPayment = (payload: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) =>
  request<{ verified: boolean; orderId?: number }>("/api/payments/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });

// ---------------- Generic upload ----------------

/**
 * Generic image upload. Returns an ABSOLUTE url built by the backend.
 * Prefer the dedicated product/category endpoints below when attaching
 * an image to a row - they upload AND link in a single call.
 */
export async function uploadFile(file: File, folder = "misc"): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  const data = await upload<{ url: string; path: string }>("/api/upload", formData);
  return data.url;
}

// ---------------- Customize ----------------

export const getCustomizableProducts = () =>
  request<CustomizableProduct[]>("/api/customize");

export const getCustomizableProduct = (slug: string) =>
  request<CustomizableProduct>(`/api/customize/${slug}`);

// ---------------- Admin ----------------

export const adminVerify = (idToken: string) =>
  request<{
    admin: boolean;
    role?: "SUPER_ADMIN" | "COMPANY_ADMIN" | "INFLUENCER" | "CUSTOMER";
    displayName?: string;
    companyId?: number | null;
    companyName?: string | null;
    companyLogoUrl?: string | null;
    mustChangePassword?: boolean;
  }>("/api/admin/verify", { headers: authHeaders(idToken) });

export const adminGetDashboard = (idToken: string) =>
  request<DashboardStats>("/api/admin/dashboard", { headers: authHeaders(idToken) });

// ---- products ----

export const adminGetProducts = (idToken: string) =>
  request<Product[]>("/api/admin/products", { headers: authHeaders(idToken) });

export const adminCreateProduct = (
  idToken: string,
  payload: Partial<Product> & { categoryId?: number }
) =>
  request<Product>("/api/admin/products", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateProduct = (
  idToken: string,
  id: number,
  payload: Partial<Product> & { categoryId?: number }
) =>
  request<Product>(`/api/admin/products/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteProduct = (idToken: string, id: number) =>
  request<void>(`/api/admin/products/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminSetStock = (idToken: string, id: number, quantity: number) =>
  request<Product>(`/api/admin/products/${id}/stock?quantity=${quantity}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

export const adminSetProductActive = (idToken: string, id: number, active: boolean) =>
  request<Product>(`/api/admin/products/${id}/active?active=${active}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---- product images (this is what replaces pgAdmin) ----

export const adminUploadProductImages = (
  idToken: string,
  productId: number,
  files: File[]
) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return upload<Product>(`/api/admin/products/${productId}/images`, formData, {
    idToken,
  });
};

export const adminDeleteProductImage = (
  idToken: string,
  productId: number,
  url: string
) =>
  request<Product>(
    `/api/admin/products/${productId}/images?url=${encodeURIComponent(url)}`,
    { method: "DELETE", headers: authHeaders(idToken) }
  );

export const adminSetPrimaryImage = (idToken: string, productId: number, url: string) =>
  request<Product>(
    `/api/admin/products/${productId}/images/primary?url=${encodeURIComponent(url)}`,
    { method: "PUT", headers: authHeaders(idToken) }
  );

export const adminReorderProductImages = (
  idToken: string,
  productId: number,
  urls: string[]
) =>
  request<Product>(`/api/admin/products/${productId}/images/reorder`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(urls),
  });

export const adminUploadProductBackground = (
  idToken: string,
  productId: number,
  file: File
) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<Product>(`/api/admin/products/${productId}/background`, formData, {
    idToken,
  });
};

// ---- categories ----

export const adminGetCategories = (idToken: string) =>
  request<Category[]>("/api/admin/categories", { headers: authHeaders(idToken) });

export const adminCreateCategory = (idToken: string, payload: Partial<Category>) =>
  request<Category>("/api/admin/categories", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateCategory = (
  idToken: string,
  id: number,
  payload: Partial<Category>
) =>
  request<Category>(`/api/admin/categories/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteCategory = (idToken: string, id: number) =>
  request<void>(`/api/admin/categories/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminUploadCategoryImage = (
  idToken: string,
  categoryId: number,
  file: File
) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<Category>(`/api/admin/categories/${categoryId}/image`, formData, {
    idToken,
  });
};

export const adminDeleteCategoryImage = (idToken: string, categoryId: number) =>
  request<Category>(`/api/admin/categories/${categoryId}/image`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

// ---- orders ----

export const adminGetOrders = (idToken: string, status?: string) =>
  request<Order[]>(`/api/admin/orders${status ? `?status=${status}` : ""}`, {
    headers: authHeaders(idToken),
  });

export const adminGetOrder = (idToken: string, id: number) =>
  request<Order>(`/api/admin/orders/${id}`, { headers: authHeaders(idToken) });

export const adminGetOrderStatuses = (idToken: string) =>
  request<string[]>("/api/admin/order-statuses", { headers: authHeaders(idToken) });

export const adminUpdateOrderStatus = (idToken: string, id: number, status: string) =>
  request<Order>(`/api/admin/orders/${id}/status?status=${status}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---- users ----

export const adminGetUsers = (idToken: string) =>
  request<AppUser[]>("/api/admin/users", { headers: authHeaders(idToken) });

export const adminSetUserRole = (idToken: string, id: number, admin: boolean) =>
  request<AppUser>(`/api/admin/users/${id}/role?admin=${admin}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

// ---- companies (super admin only) ----
// Every call below is rejected by the backend with 403 unless the signed-in
// account's role is SUPER_ADMIN - see CompanyController.requireSuperAdmin.

export type CompanyCredentials = {
  companyId: number;
  companyName: string;
  loginEmail: string;
  /** Plaintext. Shown ONCE - the server does not keep this anywhere. */
  password: string;
  note: string;
};

export const adminListCompanies = (idToken: string) =>
  request<Company[]>("/api/admin/companies", { headers: authHeaders(idToken) });

export const adminCreateCompany = (
  idToken: string,
  payload: {
    name: string;
    phone?: string;
    address?: string;
    gstNumber?: string;
    contactPerson?: string;
    loginEmail?: string;
  }
) =>
  request<CompanyCredentials>("/api/admin/companies", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateCompany = (
  idToken: string,
  id: number,
  payload: Partial<Company>
) =>
  request<Company>(`/api/admin/companies/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminSetCompanyActive = (idToken: string, id: number, active: boolean) =>
  request<Company>(`/api/admin/companies/${id}/active?active=${active}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

/** Issues a brand new random password for a company that lost theirs. */
export const adminResetCompanyPassword = (idToken: string, id: number) =>
  request<CompanyCredentials>(`/api/admin/companies/${id}/reset-password`, {
    method: "POST",
    headers: authHeaders(idToken),
  });

// ---- customizable catalog ----

export const adminGetCustomizable = (idToken: string) =>
  request<CustomizableProduct[]>("/api/admin/customize", {
    headers: authHeaders(idToken),
  });

export const adminCreateCustomizable = (
  idToken: string,
  payload: Partial<CustomizableProduct>
) =>
  request<CustomizableProduct>("/api/admin/customize", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateCustomizable = (
  idToken: string,
  id: number,
  payload: Partial<CustomizableProduct>
) =>
  request<CustomizableProduct>(`/api/admin/customize/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteCustomizable = (idToken: string, id: number) =>
  request<void>(`/api/admin/customize/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

// ---- coupons ----

export const adminGetCoupons = (idToken: string) =>
  request<Coupon[]>("/api/admin/coupons", { headers: authHeaders(idToken) });

export const adminCreateCoupon = (idToken: string, payload: CouponPayload) =>
  request<Coupon>("/api/admin/coupons", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateCoupon = (idToken: string, id: number, payload: CouponPayload) =>
  request<Coupon>(`/api/admin/coupons/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminSetCouponActive = (idToken: string, id: number, active: boolean) =>
  request<Coupon>(`/api/admin/coupons/${id}/active?active=${active}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

export const adminDeleteCoupon = (idToken: string, id: number) =>
  request<void>(`/api/admin/coupons/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

/* ===========================================================
   BANNERS
   -----------------------------------------------------------
   Public: only banners that are switched on AND inside their
   start/end window. The backend decides that, not the browser,
   so a scheduled campaign cannot be revealed early by changing
   the clock on your laptop.

   Admin: full CRUD. Every /api/admin/** call carries a real
   signed session token and is re-authorised server-side.
   =========================================================== */

/** Live banners for the homepage hero. An empty array is normal. */
export const getActiveBanners = () => request<Banner[]>("/api/banners/active");

export const adminGetBanners = (idToken: string) =>
  request<Banner[]>("/api/admin/banners", { headers: authHeaders(idToken) });

export const adminCreateBanner = (idToken: string, payload: BannerPayload) =>
  request<Banner>("/api/admin/banners", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateBanner = (idToken: string, id: number, payload: BannerPayload) =>
  request<Banner>(`/api/admin/banners/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteBanner = (idToken: string, id: number) =>
  request<void>(`/api/admin/banners/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminSetBannerActive = (idToken: string, id: number, value: boolean) =>
  request<Banner>(`/api/admin/banners/${id}/active?value=${value}`, {
    method: "PUT",
    headers: authHeaders(idToken),
  });

/**
 * Uploads one image straight onto an existing banner.
 * slot: "primary" | "mobile" | "gallery".
 */
export const adminUploadBannerImage = (
  idToken: string,
  id: number,
  file: File,
  slot: "primary" | "mobile" | "gallery" = "primary"
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("slot", slot);
  return upload<Banner>(`/api/admin/banners/${id}/image`, formData, { idToken });
};

export const adminDeleteBannerImage = (idToken: string, id: number, url: string) =>
  request<Banner>(`/api/admin/banners/${id}/image?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminReorderBanners = (idToken: string, ids: number[]) =>
  request<{ updated: number }>("/api/admin/banners/reorder", {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify({ ids }),
  });

/* ===========================================================
   SERVICEABILITY
   The backend owns the answer. The frontend must never infer a
   state from a pincode prefix or decide a delivery charge.
   =========================================================== */

export const checkServiceability = (pincode: string) =>
  request<Serviceability>(`/api/serviceability?pincode=${encodeURIComponent(pincode)}`);

export const adminGetDeliveryStates = (idToken: string) =>
  request<DeliveryState[]>("/api/admin/serviceability/states", {
    headers: authHeaders(idToken),
  });

export const adminCreateDeliveryState = (
  idToken: string,
  payload: Partial<DeliveryState>
) =>
  request<DeliveryState>("/api/admin/serviceability/states", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateDeliveryState = (
  idToken: string,
  id: number,
  payload: Partial<DeliveryState>
) =>
  request<DeliveryState>(`/api/admin/serviceability/states/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteDeliveryState = (idToken: string, id: number) =>
  request<void>(`/api/admin/serviceability/states/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminGetDeliveryPincodes = (idToken: string, search?: string) =>
  request<DeliveryPincode[]>(
    `/api/admin/serviceability/pincodes${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    { headers: authHeaders(idToken) }
  );

export const adminCreateDeliveryPincode = (
  idToken: string,
  payload: { pincode: string; stateId?: number; city?: string; deliveryCharge?: number; estimatedMinDays?: number; estimatedMaxDays?: number; active?: boolean }
) =>
  request<DeliveryPincode>("/api/admin/serviceability/pincodes", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateDeliveryPincode = (
  idToken: string,
  id: number,
  payload: Record<string, unknown>
) =>
  request<DeliveryPincode>(`/api/admin/serviceability/pincodes/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteDeliveryPincode = (idToken: string, id: number) =>
  request<void>(`/api/admin/serviceability/pincodes/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

/* ===========================================================
   INFLUENCERS / CREATORS
   -----------------------------------------------------------
   Public: browse active creators and discover the products they
   curate. Admin: full CRUD + Cloudinary-backed image management +
   product linking, all re-authorised server-side like every other
   /api/admin/** route.
   =========================================================== */

/** All active creators, or just the homepage-featured ones. */
export const adminGetInfluencers = (idToken: string) =>
  request<Influencer[]>("/api/admin/influencers", { headers: authHeaders(idToken) });

export const adminGetInfluencer = (idToken: string, id: number) =>
  request<Influencer>(`/api/admin/influencers/${id}`, { headers: authHeaders(idToken) });

export const adminCreateInfluencer = (idToken: string, payload: InfluencerPayload) =>
  request<Influencer>("/api/admin/influencers", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminUpdateInfluencer = (
  idToken: string,
  id: number,
  payload: InfluencerPayload
) =>
  request<Influencer>(`/api/admin/influencers/${id}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

export const adminDeleteInfluencer = (idToken: string, id: number) =>
  request<void>(`/api/admin/influencers/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminUploadInfluencerProfileImage = (idToken: string, id: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<Influencer>(`/api/admin/influencers/${id}/image`, formData, { idToken });
};

export const adminDeleteInfluencerProfileImage = (idToken: string, id: number) =>
  request<Influencer>(`/api/admin/influencers/${id}/image`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminUploadInfluencerCoverImage = (idToken: string, id: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<Influencer>(`/api/admin/influencers/${id}/cover`, formData, { idToken });
};

export const adminDeleteInfluencerCoverImage = (idToken: string, id: number) =>
  request<Influencer>(`/api/admin/influencers/${id}/cover`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminAddInfluencerGalleryImage = (idToken: string, id: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload<Influencer>(`/api/admin/influencers/${id}/gallery`, formData, { idToken });
};

export const adminRemoveInfluencerGalleryImage = (idToken: string, id: number, url: string) =>
  request<Influencer>(`/api/admin/influencers/${id}/gallery?url=${encodeURIComponent(url)}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });

export const adminLinkInfluencerProduct = (
  idToken: string,
  id: number,
  productId: number,
  note?: string
) =>
  request<Influencer>(`/api/admin/influencers/${id}/products/${productId}`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(note ? { note } : {}),
  });

export const adminUnlinkInfluencerProduct = (idToken: string, id: number, productId: number) =>
  request<Influencer>(`/api/admin/influencers/${id}/products/${productId}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });


/* ===========================================================
   Affiliate / influencer commissions (SUPER ADMIN only).
   Every figure is computed by the backend; the browser only
   displays it and asks for status changes.
=========================================================== */

export const affiliateSummary = (idToken: string) =>
  request<AffiliateSummary>("/api/admin/affiliate/summary", { headers: authHeaders(idToken) });

export const affiliateInfluencers = (idToken: string) =>
  request<AffiliateInfluencerRow[]>("/api/admin/affiliate/influencers", {
    headers: authHeaders(idToken),
  });

export const affiliateInfluencer = (idToken: string, id: number) =>
  request<AffiliateInfluencerDetail>(`/api/admin/affiliate/influencers/${id}`, {
    headers: authHeaders(idToken),
  });

export const affiliateGenerateCode = (idToken: string, name: string, discount?: number) =>
  request<{ code: string }>(
    `/api/admin/affiliate/generate-code?name=${encodeURIComponent(name)}${
      discount != null && Number.isFinite(discount) ? `&discount=${discount}` : ""
    }`,
    { headers: authHeaders(idToken) }
  );

export const affiliateCommissions = (idToken: string, filters: CommissionFilters = {}) => {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.set(k, String(v));
  });
  const q = qs.toString();
  return request<CommissionRow[]>(`/api/admin/affiliate/commissions${q ? `?${q}` : ""}`, {
    headers: authHeaders(idToken),
  });
};

export const affiliateSetCommissionStatus = (
  idToken: string,
  id: number,
  status: CommissionStatus,
  extra?: { reference?: string; note?: string }
) =>
  request<CommissionRow>(`/api/admin/affiliate/commissions/${id}/status`, {
    method: "PUT",
    headers: { ...authHeaders(idToken), "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...extra }),
  });

export const affiliatePayout = (
  idToken: string,
  payload: { influencerId: number; commissionIds?: number[]; reference?: string; note?: string }
) =>
  request<{
    influencerId: number;
    influencerName: string;
    commissionsPaid: number;
    amountPaid: number;
    reference?: string;
  }>("/api/admin/affiliate/payouts", {
    method: "POST",
    headers: { ...authHeaders(idToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const adminGetAffiliateCoupons = (idToken: string) =>
  request<AdminCoupon[]>("/api/admin/coupons", { headers: authHeaders(idToken) });


/* ===========================================================
   ORDER LIFECYCLE - tracking, per-item returns, verified reviews
=========================================================== */

// ---- tracking ----
export const getOrderTracking = (orderId: number) =>
  request<TrackingEvent[]>(`/api/orders/${orderId}/tracking`);

export const adminOrderTracking = (idToken: string, orderId: number) =>
  request<TrackingEvent[]>(`/api/admin/orders/${orderId}/tracking`, {
    headers: authHeaders(idToken),
  });

/** Moves the caller's OWN lines exactly one step forward (the server enforces order and ownership). */
export const adminAdvanceFulfillment = (
  idToken: string,
  orderId: number,
  status?: string,
  note?: string
) =>
  request<Order>(`/api/admin/orders/${orderId}/fulfillment`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify({ status, note }),
  });

// ---- evidence / review photos ----
export async function uploadEvidence(file: File, purpose: "return" | "review"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const token = getStoredToken();
  const res = await fetch(
    `${BASE_URL}/api/uploads/evidence?purpose=${purpose}`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    }
  );
  if (!res.ok) {
    let msg = "Could not upload that photo.";
    try {
      const j = await res.json();
      msg = j.error || j.message || msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  // Stored value goes back to the server; the public URL is for the preview.
  return data.stored ?? data.url;
}

// ---- returns ----
export const getReturnReasons = () => request<ReturnReason[]>("/api/returns/reasons");

export const createReturn = (payload: {
  orderItemId: number;
  reasonCode: string;
  details?: string;
  evidenceUrls?: string[];
}) =>
  request<ItemReturn>("/api/returns", { method: "POST", body: JSON.stringify(payload) });

export const getMyReturns = () => request<ItemReturn[]>("/api/returns/mine");

export const adminGetReturns = (idToken: string) =>
  request<ItemReturn[]>("/api/admin/returns", { headers: authHeaders(idToken) });

export const adminDecideReturn = (
  idToken: string,
  id: number,
  payload: { status: string; note?: string; refundAmount?: number }
) =>
  request<ItemReturn>(`/api/admin/returns/${id}/status`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });

// ---- reviews ----
export const getProductReviews = (productId: number) =>
  request<ReviewSummary>(`/api/products/${productId}/reviews`);

export const getReviewEligibility = (productId: number) =>
  request<{ eligible: boolean; orderItemId: number | null; alreadyReviewed: boolean }>(
    `/api/products/${productId}/review-eligibility`
  );

export const createReview = (payload: {
  orderItemId: number;
  rating: number;
  text: string;
  imageUrl?: string;
}) => request<Review>("/api/reviews", { method: "POST", body: JSON.stringify(payload) });

export const reactToReview = (reviewId: number, type: "HELPFUL" | "LOVE") =>
  request<{ type: string; active: boolean; count: number }>(`/api/reviews/${reviewId}/react`, {
    method: "POST",
    body: JSON.stringify({ type }),
  });

// ---- password (company first sign-in) ----
export const changePassword = (idToken: string, currentPassword: string, newPassword: string) =>
  request<{ changed: boolean }>("/api/auth/change-password", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
