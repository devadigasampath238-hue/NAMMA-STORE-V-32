# V31 - order lifecycle, returns, reviews, sessions, speed

## Fulfilment + tracking (backend: Lifecycle.java, Orders.java, Admin.java)
- Checkout now REJECTS a pincode that is not serviceable (server-side); the checkout page also warns and disables Place order.
- Each order LINE has its own status: Placed -> Confirmed -> Packed -> Shipped -> Out for delivery -> Delivered.
  PUT /api/admin/orders/{id}/fulfillment moves the caller's OWN lines exactly one step (no skipping).
  Company: its own lines. Super Admin: only company-less (own-catalogue) lines, through the SAME rules.
- Super Admin cannot change partner shipments or return decisions (403); can watch live.
- Every step is an immutable tracking event: customer GET /api/orders/{id}/tracking, admin GET /api/admin/orders/{id}/tracking
  (company sees only its own events). Order-level status = slowest line; delivered anchors per-item return window.
- Customer cancel is blocked once any seller has shipped.

## Returns (per item) - ItemReturn
POST /api/returns {orderItemId, reasonCode, details, evidenceUrls} (delivered items only, 10-day window, one per item).
Reasons: damaged, wrong product, defective, missing item, quality, not as described, size/fit, other (photo/description rules per reason).
Status: Return requested -> Under review -> Approved/Rejected -> Refund processing -> Refunded. Nothing refunds automatically.
Owning company decides; Super Admin sees all (decides only company-less items). Admin page: /admin/returns.
When every line of an order is Refunded the order is marked returned and influencer commission stops being payable.

## Reviews - ProductReview / ReviewReaction
Only a customer whose order LINE is Delivered, one review per line: rating 1-5, text, optional photo,
Helpful / Love reactions, "Verified buyer" badge. "Write a Review" appears directly under the delivered product in My Orders
and on the product page when eligible.

## Sessions + passwords
- Admin token is per TAB (sessionStorage) + remembered per ROLE (localStorage): Super Admin and a Company Admin can be
  signed in at once; a failed/other login no longer wipes the other session. Server tokens are stateless.
- Company accounts are created/reset with mustChangePassword=true: /admin/change-password is forced and the backend answers 403
  PASSWORD_CHANGE_REQUIRED for everything except /api/admin/verify until the one-time password is replaced.

## Speed
productCache.ts: lists prime the cache, hover/touch warms it, product page paints from cache then refreshes (stale-while-revalidate),
in-flight requests de-duplicated; route-level loading.tsx skeletons; Link prefetch. Personal "Picked for you" + Recently viewed.

## Contrast
Welcome splash text now on a dark plate; small gold text darkened; faint secondary text raised; showcase title on a strong scrim;
first showcase shows the whole category image (blur fit, no crop).

## Run
    psql -d namma_store_dev -f database/013_order_lifecycle.sql   # optional, JPA also adds the columns
    cd backend  && mvn clean compile && mvn spring-boot:run
    cd frontend && npm install && npx tsc --noEmit && npm run build && npm run dev
