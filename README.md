# Namma Store

A full-stack Indian e-commerce platform.

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Java 21 + Spring Boot 3.3 + PostgreSQL
- **Auth:** Firebase (client) — see the security note below
- **Payments:** simulated for now, structured for Razorpay later

---

## 1. Run it

### Database (one time)

```bash
createdb namma_store_dev            # if it does not exist yet
```

Start the backend **once** so Hibernate creates the tables, then run the migrations
in order. They are idempotent and delete nothing:

```bash
psql -U postgres -d namma_store_dev -f database/001_align_product_schema.sql
psql -U postgres -d namma_store_dev -f database/002_stage1_orders_and_images.sql
psql -U postgres -d namma_store_dev -f database/003_stage2_wishlist_and_coupons.sql
```

That is the **only** SQL you should ever need to run. Products, categories,
coupons, images, wishlist and orders are all managed from the admin dashboard.

### Backend

```bash
cd backend
cp .env.example .env          # edit DB_PASSWORD etc.
export $(grep -v '^#' .env | xargs)
mvn clean spring-boot:run     # http://localhost:8080
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # fill in your Firebase web config
npm install
npm run dev                        # http://localhost:3000
```

### Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `DB_URL` | backend | `jdbc:postgresql://localhost:5432/namma_store_dev` | JDBC URL |
| `DB_USERNAME` / `DB_PASSWORD` | backend | `postgres` / `postgres` | DB credentials |
| `APP_PUBLIC_BASE_URL` | backend | `http://localhost:8080` | Used to build absolute image URLs |
| `APP_CORS_ORIGIN` | backend | `http://localhost:3000` | Origin allowed to call the API |
| `APP_DELIVERY_CHARGE` | backend | `49` | Flat delivery fee |
| `APP_FREE_DELIVERY_ABOVE` | backend | `499` | Free-delivery threshold |
| `STORAGE_*` | backend | blank | Leave blank for local `./uploads`; fill in for Cloudflare R2 / S3 |
| `RAZORPAY_*` | backend | blank | Not used yet |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:8080` | Backend origin |
| `NEXT_PUBLIC_FIREBASE_*` | frontend | — | Firebase web config |

No secrets are committed. `frontend/.env.local` was **removed** from this zip —
recreate it from `.env.local.example` (your original values are in the zip you
first sent me).

### Making yourself an admin

Admin status is a flag on your user row. Register through the UI first so the
row exists, then promote yourself **once**:

```sql
UPDATE app_users SET admin = TRUE WHERE email = 'you@example.com';
```

After that, `/admin/users` lets you grant or revoke admin from the dashboard —
no more SQL. Log in at `/admin/login` using your Firebase UID.

---

## 2. Authentication — please read

`FirebaseAuthService.verifyTokenAndGetUid()` in `Auth.java` **verifies nothing**.
It takes whatever string is in the `Authorization` header and trusts it as a
Firebase UID.

What that means concretely:

- Anyone who knows or guesses an admin's Firebase UID can send
  `Authorization: Bearer <that-uid>` and get full access to `/api/admin/**`.
- Order, wishlist, address and profile endpoints identify the user by a **path
  parameter**, so any signed-in user can read another user's data by changing
  the id in the URL.

This was preserved deliberately — replacing it changes the login flow — and it is
documented in the source. **Do not deploy this to the internet as-is.** The steps
to make it real are written out in `Auth.java`.

---

## 3. What changed in Stage 2

### Backend — new files

| File | Purpose |
|---|---|
| `Wishlist.java` | Entity, repository, service, controller. Duplicates prevented by a DB unique constraint *and* a friendly service check. Deleting a product purges its wishlist rows. |
| `Coupons.java` | Coupon entity upgraded (type, min order, cap, expiry, usage limit), `CouponService` as the single source of truth for discounts, public `/validate` preview, full admin CRUD. |
| `database/003_stage2_wishlist_and_coupons.sql` | Wishlist table + coupon columns, backfilled from the legacy percentage-only columns. Adds two starter coupons only if the table is empty. |

### Backend — edited

- `Orders.java` — coupon entity moved out; `applyCoupon()` now delegates to
  `CouponService`; redemptions are counted inside the checkout transaction.
- `Admin.java` — the old minimal coupon endpoints removed (superseded by
  `AdminCouponController`).
- `Products.java` — product deletion purges wishlist rows.

### Frontend — new files

| File | Purpose |
|---|---|
| `ui.tsx` | Toasts, wishlist context, icons, empty/error states, skeletons, product gallery, order timeline, modal, success animation, confetti, Navbar, Footer, product/category cards. |
| `app/wishlist/page.tsx` | Wishlist page with move-to-cart and an empty state. |
| `globals.d.ts` | CSS module declarations so `tsc --noEmit` is clean. |

### Frontend — rebuilt

`globals.css` (design system + **logo watermark**), `layout.tsx` (providers, skip
link), home, products (filters + sort), categories, category detail, product
detail (gallery, tabs, PIN check, related), cart (server totals), checkout
(4 steps + dummy payment + animated success), account (profile / orders /
addresses), admin dashboard (real-data charts), admin coupons (full CRUD),
admin categories, admin orders, admin products.

### The logo watermark

`body::before` in `globals.css` paints `/logo.jpeg` fixed and centred. The
opacity (`0.035`) lives **only** on that pseudo-element, never on `body` or any
content wrapper, so text keeps full contrast. `background-size: <n>px auto`
means it is never cropped or stretched, and it scales down at 1024px and 640px.
`mix-blend-mode: multiply` matters — the asset is a JPEG with a solid light
background, and without blending you would see a faint rectangle instead of just
the mark.

### Animations

Plain CSS keyframes in `globals.css`. **`framer-motion` is not a dependency of
this project and there was no network access to add one**, so entrance fades,
the heart pop, the cart bump, the success tick, the confetti and the skeleton
shimmer are all CSS. `prefers-reduced-motion: reduce` is honoured globally.
Toasts are a small in-project provider for the same reason (`react-hot-toast`
is not installed). Icons are inline SVG; charts are inline SVG.

---

## 4. Verification — what I did and did not check

**Verified:**
- `npx tsc --noEmit` → **zero errors** across the whole frontend.
- Java: brace/paren structural validation, resolution of every bean call,
  accessor and repository method against its declaration, duplicate-type scan,
  request-mapping collision review.

**Not verified:**
- `mvn compile` — this environment has a JRE but no `javac` and no Maven.
- `next build` — it needs to download the `@next/swc-linux-x64-gnu` native
  binary and the network is blocked (HTTP 403).

Please run both locally before relying on this. Type-checking is strong evidence
the frontend is sound, but it is not the same as a production build.

---

## 5. Testing checklist

**Auth** — register, login, logout, account loads.

**Products** — listing; search by name/brand/category; each sort option; category,
price, discount and availability filters; filters drawer on mobile.

**Product detail** — gallery thumbnails, prev/next, `1 / n` counter, arrow keys,
mobile swipe, Zoom lightbox (Esc closes); quantity; Add to Cart; Buy Now;
wishlist heart; description/specification tabs; related products.

**Images** — delete a file from `backend/uploads/` and reload: you get the inline
placeholder, not a broken-image icon. Product images are never distorted
(`object-contain` on detail, `object-cover` in fixed-ratio card boxes).

**Wishlist** — heart on a card and on detail; navbar badge; `/wishlist` page;
Move to Cart; Remove; refresh the page and the state persists; double-click the
heart rapidly and the count stays correct.

**Coupons (admin)** — create percentage and fixed coupons; edit; enable/disable;
delete; set a minimum order, a cap, an expiry and a usage limit.

**Coupons (checkout)** — apply a valid code (`NAMMA10`, `FLAT100` ship with the
migration); an invalid code; an expired one; one below its minimum order; check
the cap applies; remove the coupon and watch the total recalculate.

**Checkout** — all four steps; address validation errors; COD confirm; UPI ID +
placeholder QR; card number/name/expiry/CVV validation; net banking bank list;
"Processing payment…" then the animated success screen.

**Order** — confirm the row exists before success is shown:

```sql
SELECT id, order_number, subtotal, discount_amount, delivery_charge,
       total_amount, payment_method, status FROM orders ORDER BY id DESC LIMIT 1;
```

**Order history** — `/account?tab=orders`, status timeline, full price breakdown,
cancel an order that has not shipped.

**Profile** — edit name and phone; upload, replace and remove a profile photo.

**Admin** — dashboard stats and both charts; product CRUD + multi-image upload,
set primary, delete image; category CRUD + image; coupon CRUD; order status
updates; user role changes.

**Responsive** — 1920 / 1440 / 1280 / 1024 / 768 / 480 / 390 / 360. No horizontal
scrolling (`overflow-x: hidden` on `html, body`; wide admin tables scroll inside
their own container).

**Accessibility** — Tab through the site; the skip link appears first; focus
rings are visible; the account dropdown and lightbox close on Escape; badges
carry aria-labels.

---

## 6. Known gaps

- **Ratings and reviews** are referenced in the brief but have no backend
  support, so no rating UI was invented.
- **PIN serviceability** on the product page validates the format and shows the
  standard estimate. There is no serviceability endpoint, so nothing more is
  claimed.
- **"Trending" and "Best Sellers"** have no analytics behind them. Trending
  shows in-stock products and there is no separate Best Sellers section, rather
  than inventing a popularity ranking.
- `_scaffold_unused_namma-store/` is the empty duplicate scaffold from your
  original zip. It is not part of the build; kept rather than deleted.

See `STAGE_1.md` for the Stage 1 backend changes (DTOs, image storage, order model).

---

# Update — September 2026

Four things changed. Everything else in this README still applies.

## 1. Admin authentication is now real

**Before:** `FirebaseAuthService.verifyTokenAndGetUid()` returned the
`Authorization` header verbatim. The frontend sent the raw Firebase **UID** as
the bearer token, and the backend trusted it. Anyone who learned an admin's UID
could send `Authorization: Bearer <uid>` and get full admin access to every
`/api/admin/**` endpoint.

**Now:** the frontend sends a real Firebase **ID token**
(`user.getIdToken()`), and the backend verifies it with
`FirebaseAuth.verifyIdToken()` before looking up the `admin` flag in
PostgreSQL.

**This means the backend now needs a service account.**

```bash
# Firebase console → Project settings → Service accounts → Generate new private key
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
```

Keep that JSON **outside** the repository. Without it the backend still starts,
but every `/api/admin/**` call returns `401` and nobody can log into the admin
panel. Startup logs tell you which mode you are in:

```
Firebase Admin initialised - ID tokens will be verified.     ← good
Firebase Admin NOT initialised (...)                          ← set the env var
```

There is a local-only escape hatch, `APP_AUTH_ALLOW_INSECURE_UID_FALLBACK=true`,
which restores the old trust-the-client behaviour so you can work without
credentials. It logs a warning on every request. Do not enable it anywhere
reachable from the internet.

### Making an account an admin

```sql
-- 1. Register/sign in once as a normal customer so the row exists.
-- 2. Then:
UPDATE app_users SET admin = true WHERE email = 'you@example.com';
```

## 2. `/admin/*` is blocked before it renders

`frontend/middleware.ts` redirects any `/admin/*` request without an admin
session cookie to `/admin/login?next=...`, at the edge, before admin HTML is
generated. Previously the only guard was a `useEffect` inside a client
component, so the panel painted for a moment before redirecting — and did not
redirect at all with JavaScript disabled.

Layered, from outside in:

| Layer | File | Stops |
|---|---|---|
| Edge redirect | `frontend/middleware.ts` | The admin page being rendered or sent |
| Session check | `useAdminSession()` in `components.tsx` | A stale/non-admin session using the UI |
| **API authorisation** | `AdminAuthFilter` in `Admin.java` | **Everything that matters** |

The cookie carries no privileges. Forging it gets you an empty shell whose every
request comes back `401`/`403`.

Verify it yourself:

```
incognito → http://localhost:3000/admin/products   → /admin/login
sign in as a customer → /admin/products            → /admin/login?error=not-admin
sign in as an admin   → /admin/products            → works
```

## 3. Festival / seasonal banners (new)

Admin-managed hero campaigns at **`/admin/banners`**. Create a banner with a
title, subtitle, artwork, CTA text/link, accent colour, display order and an
optional start/end window.

The homepage carousel (`frontend/hero.tsx`) shows only banners that are both
switched on **and** inside their date window — decided by the backend, so a
scheduled campaign cannot be revealed early by changing the clock on the client.
With no live banners the carousel renders nothing and the original static hero
takes over.

No festival is hard-coded anywhere. Deepavali, Dasara, Ugadi, Sankranti,
Republic Day and anything invented in five years are all just rows.

```
GET    /api/banners/active           public
GET    /api/admin/banners            admin
POST   /api/admin/banners
PUT    /api/admin/banners/{id}
DELETE /api/admin/banners/{id}
PUT    /api/admin/banners/{id}/active?value=true|false
POST   /api/admin/banners/{id}/image     multipart, slot=primary|mobile|gallery
DELETE /api/admin/banners/{id}/image?url=...
PUT    /api/admin/banners/reorder
```

Schema: `database/005_banners.sql`. Optional — `ddl-auto=update` creates the
tables on the next start.

## 4. Watermark is visible again

`--ns-watermark-opacity` went from `0.035` to `0.1` (`0.075` on phones) in
`app/globals.css`. It sits on `body::before` only, so body-text contrast is
untouched.

## Commands

```bash
# frontend
cd frontend && npm install && npm run dev      # http://localhost:3000

# backend
cd backend && mvn spring-boot:run              # http://localhost:8080
# (no Maven wrapper is committed - use a local Maven 3.9+ and JDK 21)
```

Admin login: **http://localhost:3000/admin/login**

---

# Update 2 — September 2026

## Critical bug #1: images — root cause found and fixed

The image pipeline was never the problem. `StorageService` stored correct
relative paths, `DtoMapper` returned correct absolute URLs, and
`resolveImageUrl()` in `api.ts` already handled absolute/relative/null/blank.

The bug was one line of static-resource config in `NammaStoreApplication.java`:

```java
String location = Path.of(localDir).toAbsolutePath().toUri().toString();
```

`Path.toUri()` stats the filesystem and **only appends a trailing `/` when the
directory already exists**. On a fresh checkout `./uploads` does not exist at
startup, so the location resolved as `file:/app/uploads` with no slash, and
Spring joined `/uploads/products/x.jpg` onto it as
`file:/app/uploadsproducts/x.jpg` → **404**.

So: upload succeeded, database row was right, API response was right, and the
browser got a 404 for every image — which `SafeImage` correctly rendered as the
"No image" placeholder. The resource mapping is built once at startup, so it
stayed broken for the life of the process even after the first upload created
the folder.

Fixed by creating the directory before mapping it and forcing the trailing
slash. Startup now logs `Serving /uploads/** from file:/.../uploads/` so you can
confirm it.

**Verify:** upload a product image, then open the URL from the API response
directly in a browser. It should return the image, not a 404.

## Critical security: IDOR holes closed

Customer-scoped endpoints identified the caller **purely by a path parameter**,
with no token required and no ownership check:

```
GET /api/orders/42            → anyone's order history
GET /api/users/42/addresses   → anyone's home address and phone
PUT /api/orders/99/cancel     → cancel a stranger's order
GET /api/wishlist/42          → anyone's wishlist
```

Changing a number in the URL was enough. New `CurrentUserService` (in
`Auth.java`) resolves the caller from a **verified Firebase ID token** and
compares it to the row being touched. Enforced on every cart, order, wishlist,
address and profile endpoint, plus `/api/checkout` — which previously let the
request body decide whose cart was charged.

`api.ts` now attaches the signed-in customer's ID token to every request
automatically (dynamic import of `firebase.ts`, so the browser SDK stays out of
the server bundle).

`401` means "not signed in", `403` means "not yours". Both return a plain JSON
message, never a stack trace.

## Order total showing ₹0 (feature #37)

Orders written before the money columns existed have `NULL` subtotal/total,
which serialised as `null` and rendered as ₹0 next to real line items. The DTO
now derives them from the order's **own line items** when the column is NULL —
the stored value is still authoritative, and nothing is recalculated from
client input. `database/006_security_and_cancellation.sql` repairs the rows
permanently.

## Cancellation reasons

`PUT /api/orders/{id}/cancel` accepts an optional `{reason, comments}` body and
persists it with a `cancelledAt` timestamp. The eligibility rule (nothing at or
past SHIPPED) is unchanged and still enforced server-side.

## Migration

```bash
psql -d namma_store_dev -f database/006_security_and_cancellation.sql
```

---

# Update 3 — September 2026

## Pincode / serviceability — why it "wasn't working"

There was no serviceability system. `app/products/[id]/page.tsx` had this:

```ts
function checkPin() {
  if (!/^\d{6}$/.test(pin.trim())) { ... }
  setPinResult(`Delivers to ${pin.trim()} by ${deliveryWindow()}`);
}
```

Any valid 6-digit number got "Delivers to … by …", with a date invented from
today's clock. No state lookup, no coverage check, no backend call. It was a
frontend mock.

Replaced with a real system:

- `backend/.../Serviceability.java` — `DeliveryState` and `DeliveryPincode`
  entities, `GET /api/serviceability?pincode=…`, admin CRUD under
  `/api/admin/serviceability/**`.
- `frontend/delivery.tsx` → `<PincodeCheck />`, used on the product page.
- `/admin/serviceability` — states and pincodes tabs, ranges, per-pincode
  charge and ETA overrides, pause/resume, search.

Lookup order: exact pincode row → state pincode range → not serviceable.
Pausing a state pauses every pincode under it.

**The tables start empty on purpose — Karnataka is not seeded.** With nothing
configured the API returns `configured: false` and the widget says delivery
isn't set up, rather than inventing an answer. Add coverage at
`/admin/serviceability` before testing.

## Banded delivery charge

Calculated in `OrdersController.priceCart()`, server-side, from configuration:

| Order value (after discount) | Delivery |
|---|---|
| under `app.delivery.small-order-threshold` (200) | `small-order-charge` (₹40) |
| 200 up to `free-above` (499) | `app.delivery.charge` (₹49) |
| at or above 499 | free |

So ₹150 + ₹40 = ₹190, as specified. The client never sends a delivery charge.

## Cancellation — custom modal

`confirm("Cancel this order?")` is gone from the order flow. `CancelOrderModal`
in `delivery.tsx` is a two-step dialog: reason radio list + comments, then a
confirmation showing order number, total, payment method and chosen reason,
with a loading state and inline errors. Escape closes it, focus moves into it,
and the body stops scrolling behind it.

The reason and comments are persisted (`cancellation_reason`,
`cancellation_comments`, `cancelled_at`). Eligibility is still decided by the
backend — if the order ships between page load and confirmation, the API
refuses and the error appears inside the modal.

## /api/auth/sync impersonation closed

It took `firebaseUid` from the request body and wrote an `AppUser` row for it.
Posting someone else's UID created or overwrote their row — including its email
— and the rest of the app keys off that row. The UID now comes from the
verified ID token; the body field is ignored for identity.

## Migrations

```bash
psql -d namma_store_dev -f database/006_security_and_cancellation.sql
psql -d namma_store_dev -f database/007_serviceability.sql
```

---

# Update 4 — Marketplace Stage 1 (database models & relationships)

This is Stage 1 of the multi-company marketplace rebuild your brief laid out
in 10 stages. **Only Stage 1 is done.** Stages 2–10 (company/influencer
login, company dashboard, commission engine, Super Admin analytics, audit
log, notifications, the full UI) are not built yet — see "What's not here"
below and the reasoning in-chat for why this stopped here deliberately.

## What Stage 1 adds

- **`Company`** (`Company.java`) — supplier/vendor row, with per-company
  commercial terms (`platformCommissionPercent`, `platformFixedFee`,
  `shippingResponsibility`, `returnResponsibility`, `settlementPeriodDays`)
  as columns on the row, not global constants — your brief was explicit that
  agreements differ per company.
- **`Influencer`** and **`CouponUsage`** (`Influencer.java`) — the influencer
  profile and the append-only conversion ledger the brief asked for by name
  ("Do NOT simply store a coupon string. Create proper database
  relationships"). `CommissionStatus` starts every row at `PENDING`; nothing
  in this codebase sets `PAID` automatically, matching "Super Admin should
  control commission approval/payment."
- **`UserRole`** enum (`SUPER_ADMIN`, `COMPANY_ADMIN`, `INFLUENCER`,
  `CUSTOMER`) added to `AppUser`. The old `boolean admin` field is **kept,
  not removed** — `isAdmin()` is now derived from role, and any existing row
  with `role IS NULL` falls back to reading the old boolean, so every
  existing admin session keeps working unchanged the moment this deploys.
- **`Product.company`**, **`OrderItem.companyId`** + **`OrderItem.itemStatus`**
  — an order item now remembers which company it belongs to (copied from the
  product at checkout, so reassigning or deleting a product later can't
  rewrite history) and can carry its own fulfilment status, independent of
  the other companies' items in the same order.
- **`Coupon.influencerId`, `commissionType`, `commissionValue`, `perUserLimit`**
  — a coupon can now be attributed to an influencer with its own commission
  terms, overriding the influencer's default rate.

Migration: `database/008_marketplace_stage1.sql`. Every new column is
nullable or defaulted; `NULL company_id` means "Namma Store's own catalogue,"
so nothing existing needs reassigning for the site to keep running.

```bash
psql -d namma_store_dev -f database/008_marketplace_stage1.sql
```

## What's deliberately NOT here yet

No company login, no influencer login, no company/influencer/super-admin
dashboards, no commission calculation at checkout, no audit log, no
notification system, no analytics. Those are Stages 2–10. This environment
cannot compile or run the backend (no Maven, no network), and a
multi-tenant auth/authorization layer is exactly the kind of code where an
unverified "it's probably fine" is how one company ends up seeing another
company's orders. Each remaining stage should land, get reviewed, and
ideally get run against a real Postgres + `mvn spring-boot:run` before the
next one starts — which is what your own brief asked for in the first place.

# Update 5 — Firebase removed entirely; own login system; image storage fixed

## Why this update happened

Two problems reported together: (1) both admin and customer login were
failing, and (2) product images kept disappearing. Both turned out to be
config/architecture problems, not bugs to patch:

1. **Login** depended entirely on the Firebase Admin SDK
   (`GOOGLE_APPLICATION_CREDENTIALS`). If that env var was missing, wrong,
   or the Firebase project's Email/Password sign-in wasn't enabled, every
   `/api/admin/**` call returned 401/403 and customers using
   `syncUser`/Firebase auth were blocked too. On top of that, company login
   was never implemented at all (`Company.loginEmail`/`passwordHash` existed
   as unused placeholder columns - see the old Stage 1 note below).
2. **Images** were being written to local disk (`./uploads`) by default.
   On virtually every hosting platform (Render, Railway, Heroku, etc.) that
   folder is wiped on every redeploy and restart, and isn't shared between
   multiple server instances. That's the repeated image loss - not a bug
   in the upload code.

## What changed - backend

- **Firebase is gone.** No `firebase-admin` dependency, no
  `GOOGLE_APPLICATION_CREDENTIALS`, nothing calls out to Google. New file
  `Security.java` implements password hashing (PBKDF2-HMAC-SHA256, 100k
  iterations) and signed session tokens (HMAC-SHA256), using only the JDK -
  no new Maven dependencies, since this environment has no internet access
  to verify a new library would even resolve.
- **`AppUser.passwordHash`** (new column) - every account's password lives
  here and only here, including the super admin and every company admin.
- **`AppUser.firebaseUid` → `AppUser.accountUid`** (Java field renamed,
  underlying column renamed by the migration below) - now simply this
  app's own internally-generated account id.
- **`POST /api/auth/register`** - name, email, phone, password → creates a
  CUSTOMER account, returns `{ token, user }`.
- **`POST /api/auth/login`** - `emailOrPhone` + password → works for
  CUSTOMER, COMPANY_ADMIN and SUPER_ADMIN accounts alike, same endpoint,
  same response shape.
- **`SuperAdminSeeder`** (new) - on every startup, creates/refreshes the
  ONE super admin account from `SUPER_ADMIN_NAME` / `SUPER_ADMIN_EMAIL` /
  `SUPER_ADMIN_PASSWORD`. Forgot the password? Change the env var and
  restart - no database access needed.
- **`CompanyController`** (new, `SUPER_ADMIN`-only) -
  `POST /api/admin/companies` creates a company AND its login account in
  one call: generates a login email (or uses the one you typed) and a
  random password, returns them **once** in the response. Also
  `GET /api/admin/companies` (list), `PUT .../active` (activate/
  deactivate), `POST .../reset-password` (issue a new password).
  `Company.passwordHash` (the old unused duplicate) has been removed - the
  real password lives on the linked `AppUser` row.
- **`AdminAuthFilter`** now verifies our own session token instead of a
  Firebase ID token; **`/api/admin/verify`** also returns the caller's
  `role`/`companyId` so the frontend can show company-management screens
  to a super admin only.

## What changed - frontend

- `firebase.ts` deleted, `firebase` removed from `package.json`.
- `api.ts`: the session token lives in `localStorage` (`namma_token` for
  customers, `namma_admin_token` for the admin panel - separate on purpose,
  since the same browser could have both open). New `registerAccount()`,
  `login()`, and the company-management calls
  (`adminListCompanies`/`adminCreateCompany`/`adminSetCompanyActive`/
  `adminResetCompanyPassword`).
- `components.tsx`: `AuthProvider` and `useAdminSession` rewritten without
  Firebase; `AdminSidebar` shows a **Companies** link only when the
  signed-in admin's role is `SUPER_ADMIN`.
- `/login`, `/register`, `/admin/login` rewritten against the endpoints
  above.
- **New `/admin/companies` page** (super admin only) - create a company,
  copy the generated login email/password, share it with that company.
  They log in at the same `/admin/login` screen everyone else uses.

## Migration (existing databases only)

A brand-new database with `spring.jpa.hibernate.ddl-auto=update` doesn't
need this - Hibernate creates the right columns on first boot. For an
**existing** database:

```bash
psql -d namma_store_dev -f database/009_custom_auth.sql
```

This renames `app_users.firebase_uid` → `account_uid`, adds
`app_users.password_hash`, and drops the unused `companies.password_hash`
column. It does **not** invent passwords for existing accounts created
under the old Firebase flow - they'll need to register fresh, or an admin
sets a password for them directly, once a "forgot password" flow exists.

## Required environment variables (new)

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `APP_AUTH_JWT_SECRET` | backend | dev-only placeholder | Signs every session token. **Change this before going live** - `openssl rand -base64 48`. |
| `SUPER_ADMIN_NAME` | backend | `Namma Store Admin` | Fixed super admin display name. |
| `SUPER_ADMIN_EMAIL` | backend | `admin@nammastore.in` | Fixed super admin login email. |
| `SUPER_ADMIN_PASSWORD` | backend | `ChangeMe123!` | Fixed super admin password - **change this**. Editing + restarting resets it. |

`GOOGLE_APPLICATION_CREDENTIALS` and every `NEXT_PUBLIC_FIREBASE_*`
variable are no longer used anywhere and can be deleted from your
deployment's environment.

## Permanent image storage (Cloudflare R2)

Local disk storage is fine for `npm run dev` on your own laptop, but the
moment this runs on a real host, treat local disk as **temporary**. The
fix already exists in the code (`Storage.java` supports any S3-compatible
bucket) - it just needs credentials. Cloudflare R2 has a free tier
(10 GB storage, no egress fees) and works with the exact same env vars:

1. Cloudflare dashboard → **R2** → **Create bucket** (any name, e.g.
   `namma-store-images`). Make it **public** (R2 → bucket → Settings →
   allow public access, or attach a custom domain) so uploaded images can
   be viewed by customers.
2. R2 → **Manage R2 API Tokens** → **Create API token** → permissions
   "Object Read & Write", scoped to that bucket. Copy the **Access Key
   ID**, **Secret Access Key**, and the **endpoint URL** shown (looks like
   `https://<account-id>.r2.cloudflarestorage.com`).
3. Set these on your backend host (Render/Railway/wherever - its
   Environment/Secrets tab, not this file):
   ```
   STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   STORAGE_BUCKET=namma-store-images
   STORAGE_ACCESS_KEY=<access key id>
   STORAGE_SECRET_KEY=<secret access key>
   STORAGE_PUBLIC_BASE_URL=https://<your-public-bucket-or-custom-domain>
   ```
4. Redeploy the backend. Watch the startup logs: the warning
   `"Image storage is using LOCAL DISK"` should be gone. From this point,
   every new upload survives redeploys and restarts. Existing images
   already lost to a wiped disk need to be re-uploaded once - there's no
   way to recover a file that a host already deleted.

## Known limitation carried forward

A `COMPANY_ADMIN` who logs in currently sees the **same** admin panel as
the super admin - all products and orders across every company, not just
their own. Scoping the dashboard to `AppUser.company` is a real, sizeable
feature on its own (every products/orders query needs a company filter)
and was explicitly listed as a later stage in the marketplace work above -
this update fixes login and credential provisioning, not per-company data
isolation.

# Update 6 — Cloudinary image storage, Influencer/Creator section, Karnataka visual identity

## Why this update happened

Three things from the brief: (1) images were still ultimately dependent on
manually-configured S3/R2 or, worse, local disk that gets wiped on
redeploy; (2) `/influencers` and the customer-facing Creator section did
not exist at all — only backend database tables (`Influencer`,
`CouponUsage`) from the Stage 1 marketplace groundwork; (3) the site's
visual identity, while already warm/sandalwood-themed, had no explicit
Karnataka motifs (temple architecture, Yakshagana patterns, Hampi's stone
chariot) beyond the logo.

## Cloudinary — now the primary image backend

`StorageService` (`Storage.java`) gained a **Cloudinary** backend that is
checked **before** S3/R2 and local disk. When `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are set, every
product/category/banner/influencer image upload goes straight to
Cloudinary and the returned permanent `secure_url` is what gets stored in
Postgres — nothing local, nothing an S3 bucket-policy mistake can break,
nothing a redeploy can wipe.

**Important environment note:** this development container has no network
access to Maven Central, so no Cloudinary Java SDK jar could be added as a
dependency. Instead, `Storage.java` calls Cloudinary's plain HTTPS
upload/destroy REST API directly using `java.net.http.HttpClient`, which
ships in the JDK — zero new dependencies, zero `pom.xml` changes. The
request signing (sort params alphabetically, append the API secret,
SHA-1 hash) is the same scheme Cloudinary's own SDKs use, so this is not a
simplified/insecure shortcut.

Existing behaviour is fully preserved: leave `CLOUDINARY_*` blank and the
app falls back to `STORAGE_*` (S3/R2) exactly as before, and finally to
local disk for pure local dev. `toPublicUrl()` already returned absolute
URLs unchanged and `toRelativePath()` already treated unrecognised
absolute URLs as "external, keep as-is" — both needed **zero** changes for
Cloudinary URLs to flow through correctly. Deleting an image now also
deletes the underlying Cloudinary asset (its `public_id` is parsed back
out of the stored `secure_url`), not just the database reference.

### Cloudinary setup (2 minutes)

1. Create a free account at [cloudinary.com](https://cloudinary.com) if
   you don't have one.
2. Go to the **Dashboard** — it shows your **Cloud name**, **API Key** and
   **API Secret** right at the top.
3. Set these on your backend host's environment (Render/Railway/wherever
   — never commit real secrets to `.env`):
   ```
   CLOUDINARY_CLOUD_NAME=<your cloud name>
   CLOUDINARY_API_KEY=<your api key>
   CLOUDINARY_API_SECRET=<your api secret>
   CLOUDINARY_FOLDER=namma-store
   ```
4. Redeploy the backend. Startup logs should show
   `Image storage: Cloudinary (cloud '...', folder 'namma-store')`.
5. Upload a product/banner/category/influencer image from the admin panel
   and confirm the stored URL looks like
   `https://res.cloudinary.com/<cloud>/image/upload/v.../namma-store/products/<file>.jpg`.
   That URL is permanent — it survives redeploys, restarts, and scaling to
   multiple server instances.

No frontend changes or secrets are needed — uploads still go through our
own authenticated `/api/admin/**` endpoints as multipart form posts, which
then talk to Cloudinary server-side. The browser never sees Cloudinary
credentials, unlike an unsigned-upload-preset setup.

## Influencer / Creator section (previously 404, now complete end-to-end)

**Backend** (`Influencer.java`): the `Influencer` entity gained `bio`,
`coverImageUrl`, a `gallery` (ordered list of images), `socialLinks`
(free-text `"Platform|url"` pairs, so a new platform never needs a schema
change), `featured` and `displayOrder`. A new `InfluencerProduct` join
table links influencers to the products they curate (many-to-many, with
an optional note and its own display order) without ever touching the
`Product` table.

New endpoints:
- `GET /api/influencers` / `GET /api/influencers?featured=true` / `GET /api/influencers/{id}` — public, read-only, mirrors how `/api/products` and `/api/banners` already work.
- `POST|PUT|DELETE /api/admin/influencers[/{id}]` — full CRUD, auto-protected by the existing `AdminAuthFilter` (anything under `/api/admin/**` already requires a verified admin session — no new auth code was needed).
- `POST|DELETE /api/admin/influencers/{id}/image` and `/cover` — profile/cover photo upload+replace+delete, Cloudinary-backed.
- `POST|DELETE /api/admin/influencers/{id}/gallery` — add/remove extra photos.
- `POST|DELETE /api/admin/influencers/{id}/products/{productId}` — curate which products an influencer's page shows.

**Frontend:**
- `/influencers` — public grid of active creators with cover+profile photo, bio snippet, social platform, "View profile" CTA. Shows an honest empty state (no fake creators) when the admin hasn't added any yet.
- `/influencers/[id]` — full creator profile: cover photo, bio, clickable social links, photo gallery, and their curated products rendered with the same `ProductCard` used everywhere else in the store (so add-to-cart/wishlist/pricing all just work).
- `/admin/influencers` — full CRUD screen: create/edit creator details, upload/replace/remove profile and cover photos, manage the gallery, add social links dynamically, and search-and-link existing products, all inline per creator.
- Nav: "Creators" added to the header, mobile menu and footer; "Influencers" added to the admin sidebar.
- Homepage: a "Meet Our Creators" rail appears automatically once at least one influencer is marked **Featured** in the admin panel — it does not show placeholder creators.

## Karnataka / Kannada visual identity

New `karnataka.tsx` — hand-coded, royalty-safe inline SVG motifs (nothing
sourced from a photo or stock library, so there is nothing to license):
- `TempleSkylineDivider` — a row of gopuram/shikhara silhouettes (Hampi + Mysuru-style temple towers) used as a section-divider backdrop.
- `YakshaganaPatternStrip` — a slim repeating crown/kirita-inspired triangular border in Kannada-flag colours, used as a decorative rule rather than a literal costume photo.
- `ChariotWheelBadge` — a spoked stone-chariot-wheel badge, nodding to Hampi's Vittala Temple chariot (which already anchors the Namma Store logo) without reproducing any photograph.
- `WaveDivider` — a soft coastal-Karnataka wave shape used between page sections instead of a hard rectangular cut.

The uploaded Hampi/Vijayanagara reference images were used only as visual
*inspiration* for these shapes, exactly as asked — none of the uploaded
files are shipped as assets.

Also in `karnataka.tsx`: `RevealOnScroll` and `useParallaxOffset`, two
small dependency-free hooks (`IntersectionObserver` + a passive, `rAF`-
throttled scroll listener capped at ±24px) that give the reveal-on-scroll
and subtle-parallax feel the brief asked for.

**On Framer Motion specifically:** this container has no network access,
so `npm install framer-motion` cannot be run here, and this codebase's own
`globals.css` already documents the same constraint for its existing
animations ("*plain CSS on purpose: framer-motion is not a dependency of
this project*"). Rather than leave that part of the brief silently
unmet, the two hooks above reproduce the same UX with zero new
dependencies. If you run `npm install framer-motion` yourself after
receiving this project, those two exports are the only places you'd need
to swap in `motion.div`/`whileInView` — nothing else depends on them.

New CSS utilities in `globals.css`: `.ns-reveal`/`.ns-reveal-visible`
(scroll reveal), `.ns-tilt-card` (a slightly stronger hover lift for
showcase cards than the existing `.ns-card-hover`), `.ns-flag-rule` (a
Kannada-flag-coloured accent rule) and `.ns-motif-glow` (a soft glow
behind a decorative SVG badge). All respect
`prefers-reduced-motion` via the existing global media query.

## Files changed

**Backend**
- `backend/src/main/java/com/nammastore/Storage.java` — added the Cloudinary backend (upload, delete, signing, public-ID parsing), no new Maven dependency.
- `backend/src/main/java/com/nammastore/Influencer.java` — extended the `Influencer` entity, added `InfluencerProduct`, `InfluencerDto`, `InfluencerMapper`, `InfluencerPublicController`, `InfluencerRequest`, `AdminInfluencerController`.
- `backend/src/main/resources/application.properties` — added `cloudinary.*` properties.
- `backend/.env.example` — added `CLOUDINARY_*` variables and updated the storage-fallback comment.
- `database/010_influencer_section_and_cloudinary.sql` — new migration (influencer columns + `influencer_gallery` + `influencer_social_links` + `influencer_products` tables). Optional if `ddl-auto=update` is left on, but recommended for deliberate schema control in production.

**Frontend**
- `types.ts` — added `Influencer`, `SocialLink`, `InfluencerPayload`.
- `api.ts` — added the full influencer public+admin API surface.
- `karnataka.tsx` — **new file**: Karnataka SVG motifs + `RevealOnScroll`/`useParallaxOffset`.
- `app/influencers/page.tsx` — **new**: public creator listing.
- `app/influencers/[id]/page.tsx` — **new**: public creator profile + curated products.
- `app/admin/influencers/page.tsx` — **new**: admin CRUD for creators.
- `app/page.tsx` — added the "Meet Our Creators" homepage rail and two Karnataka motifs.
- `ui.tsx` — added a "Creators" link to the header nav, mobile menu, and footer.
- `components.tsx` — added an "Influencers" link to the admin sidebar.
- `app/globals.css` — added the Karnataka-identity + scroll-reveal utility classes.

## What was verified by inspection (no network/Maven available in this environment)

This container has no outbound network access, so `mvn compile` (which
would need to resolve/re-verify the existing dependency tree) and
`npm install`/`tsc` against this exact Next.js version could not be run
end-to-end here — the same constraint noted in this README's earlier
updates. Every change was instead checked by:
- Confirming every new Java class/method against symbols that already exist elsewhere in the same package (`DtoMapper.toDto`, `NoSuchElementException` → 404 via `GlobalExceptionHandler`, `AdminAuthFilter`'s `/api/admin` prefix match, `StorageService.storeImage/deleteQuietly/sameImage`).
- Balanced-brace/paren checks on every touched file.
- Reusing exact existing patterns (the `/admin/banners` page's editor/list layout, `SafeImage`, `useAdminSession`, `authHeaders`) rather than inventing new ones, to minimize the chance of a mismatch.

**Please run a real build (`mvn spring-boot:run` / `npm run dev`, see
Commands below) before deploying**, and open `/influencers`,
`/admin/influencers`, and one image upload end-to-end as a smoke test.

## Migration (existing databases only)

```bash
psql "$DATABASE_URL" -f database/010_influencer_section_and_cloudinary.sql
```
Safe to re-run; every statement is `IF NOT EXISTS`/additive. `ddl-auto=update`
will also create these tables/columns automatically on next backend start.

## Required environment variables (new)

```
CLOUDINARY_CLOUD_NAME=      # from cloudinary.com dashboard
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=namma-store   # optional, defaults to namma-store
```
Everything else (`STORAGE_*`, `DATABASE_URL`, `JWT_SECRET`, etc.) is unchanged
from Update 5.
