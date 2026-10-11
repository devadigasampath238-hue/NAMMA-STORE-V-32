# NAMMA STORE — FULL HANDOFF FOR GOOGLE AI STUDIO

> How to use this file: upload it to AI Studio **together with the project zip** (`NAMMA-STORE-FINAL-V28.zip`)
> and paste the "MASTER PROMPT" from Section 12 as your first message. The code in the zip is the source of
> truth; this file is the *intent* behind it.
>
> Honesty note: this is a detailed, organised reconstruction of the instructions given across the whole
> conversation (nothing important is left out, but it is condensed — it is not a word-for-word transcript).
> Nothing below has been run against a real database: the backend was **never compiled** in my sandbox
> (no Java/Maven available) and `next build` could not run (SWC binary missing). Only `tsc --noEmit` and the
> Tailwind CSS compile were verified. Expect to fix a few compile errors on first build.

---

## 1. PROJECT SNAPSHOT

**Namma Store** — a Karnataka-first, multi-company e-commerce marketplace.

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript/TSX, Tailwind CSS (no Framer Motion installed) |
| Backend | Java 21, Spring Boot, Spring Data JPA/Hibernate, PostgreSQL |
| Images | Cloudinary (permanent storage, already working), local `/uploads` fallback |
| Auth | Own signed-token system (Firebase was removed), password hashing, roles |
| Roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `CUSTOMER` (+ influencers are *not* users — internal records only) |

Tech freedom: the owner said *any* language/framework is acceptable (Dart, Kotlin, Angular, plain HTML/CSS…)
**as long as the result is a rich UI/UX**. Default decision so far: stay on Next.js + Spring Boot; do not add a
framework unless there is a strong reason.

### 1.1 Backend files (`backend/src/main/java/com/nammastore/`)
All in one package, several classes per file:
`Auth.java` (AppUser, roles, login, AppUserRepository, CurrentUserService, TokenService) ·
`Admin.java` (AdminAuthFilter, admin dashboard/orders/status endpoints, CORS) ·
`Affiliate.java` (CommissionService, AffiliateAdminController, ImageDiagnosticsController) ·
`Banners.java` · `Company.java` (Company entity, CompanyController, CompanyDto) ·
`Coupons.java` (Coupon, CouponService.evaluate, admin coupon controller) ·
`Dtos.java` (DtoMapper + all DTOs) · `Influencer.java` (Influencer entity, admin controller, CouponUsage = commission ledger) ·
`Orders.java` (Order, OrderItem, cart, checkout, pricing) · `Payments.java` · `Products.java` (Product, Category, repos, public + admin catalog controllers) ·
`Scope.java` (AdminScope — company scoping) · `Security.java` · `Serviceability.java` (delivery pincode/state) ·
`Storage.java` (StorageService — the ONLY place image URLs are built) · `Wishlist.java` · `GlobalExceptionHandler.java` · `NammaStoreApplication.java`.

`backend/src/main/resources/application.properties` — important keys: `spring.jpa.open-in-view=false`,
`app.public.base-url`, `app.cors.allowed-origin`, Cloudinary keys, `app.debug.images` (`APP_DEBUG_IMAGES`),
`APP_AUTH_JWT_SECRET`, `SUPER_ADMIN_EMAIL/PASSWORD/NAME`. **Secrets are currently in plain text — rotate and move to env vars.**

`database/` — `001…010` older migrations, **`011_affiliate_attribution.sql`**, **`012_repair_legacy_image_paths.sql`**.

### 1.2 Frontend files (`frontend/`)
`api.ts` (every backend call) · `types.ts` (TypeScript mirrors of backend DTOs) · `components.tsx` (SafeImage, AppShell,
admin shell: AdminSidebar/AdminPageHeader/StatCard/AdminTable/AdminIcon, auth/cart providers, MobileTabBar) ·
`ui.tsx` (Navbar, Footer, ProductCard, CategoryCard, Price, Modal, toasts, skeletons) · `hero.tsx` (campaign carousel) ·
`storefront.tsx` (homepage blocks) · `dashboardCharts.tsx` (SVG charts) · `karnataka.tsx` (decorative motifs) ·
`delivery.tsx` · `referral.tsx` (`?ref=` capture) · `imageUrl.ts` (the ONE image resolver) · `middleware.ts` (admin route guard) ·
`tailwind.config.ts` · `app/globals.css` (design system) ·
`app/` routes: `/` · `/products` · `/products/[id]` · `/categories` · `/cart` · `/checkout` · `/wishlist` · `/account` · `/login` · `/register` · `/customize` ·
`/admin` (dashboard) · `/admin/products` · `/admin/categories` · `/admin/orders` · `/admin/companies` · `/admin/affiliate` · `/admin/influencers` ·
`/admin/coupons` · `/admin/banners` · `/admin/users` · `/admin/serviceability` · `/admin/customize` · `/admin/login`.

---

## 2. HARD RULES FROM THE OWNER (apply to every change)

1. **Do not rebuild from scratch.** Inspect the existing code first, then make targeted changes.
2. **Do not break working features** (auth, customer login/register, products, categories, banners, offers, orders,
   delivery/serviceability, users, customize catalog, companies, influencers, coupons, commissions, payouts, uploads, Cloudinary).
3. **No fake/mock data.** No invented statistics, hard-coded product images, placeholder influencers, fake countdowns,
   fake "sales targets". If data doesn't exist, show an honest empty state or hide the block.
4. **Keep files in sync.** Backend entity ↔ DTO ↔ `types.ts` ↔ `api.ts` ↔ page. Same property names end-to-end.
5. **Do not trust the frontend.** All coupon validation, attribution, commission math, role checks and data scoping
   happen on the backend.
6. **Keep Cloudinary.** Do not remove or re-architect it. One central `StorageService`.
7. **One image resolver** (`imageUrl.ts`) + one `SafeImage`. No competing resolvers, no URL building in random components.
8. Do not change every LAZY relation to EAGER; use `@EntityGraph`/JOIN FETCH/transactions.
9. Report honestly: never claim a UI is "improved" or a build "passes" unless it was actually verified.
10. Final reports should list: root causes, files changed, what changed, build/test results, exact commands, remaining issues.

---

## 3. PROMPT HISTORY (chronological, with every important requirement)

### Round 1 — Full audit & fix ("V22 → V23")
Backend Spring Boot + PostgreSQL + Cloudinary; frontend Next.js + TS. Audit the **entire** project end-to-end using the
**Banners flow as the reference pattern**: `Admin → Upload/Create → Backend API → PostgreSQL → Cloudinary → Public API → Frontend → Display`.

Features to verify: products, categories, banners/festival campaigns, influencers, product galleries, category images, influencer
profile images, cart, wishlist, orders, search, product details, homepage, admin dashboard, admin CRUD, authentication/admin
protection, API image URL handling, mobile/responsive.
For each: entity, repository methods, service, controller, upload endpoint, Cloudinary storage, returned URLs, frontend API
function, TS types, component/page, admin UI, loading/error/empty states.
Specific asks: find repository method errors (missing params), broken/mismatched endpoints, use ONE shared image URL
resolver/SafeImage, preserve valid Cloudinary URLs, never create duplicate localhost URLs, never hard-code images, run/build both sides.
Outcome: fixed admin pages hiding inactive items, public APIs exposing inactive items, category-delete FK crash,
product-delete orphan influencer links, influencer image URLs bypassing StorageService.

### Round 2 — Influencer concept correction + Cloudinary image tracing ("V24")
**Remove** the influencer section/cards/marketplace from the customer homepage. Influencers are an **internal affiliate/referral system**:
- Namma Store gives an influencer a unique coupon (e.g. `RAHUL10`) and they promote a **normal product URL**
  (optionally `/product/123?ref=RAHUL10`) on Instagram/YouTube.
- Customer buys and applies the coupon. **Coupon code is the authoritative attribution**; `?ref=` is only a hint kept per session.
- Backend records: influencer, coupon, product, customer, order, discount, commission, order status, commission status.
- Commission lifecycle: `PENDING` → `APPROVED` (order delivered) → `PAID` (admin payout). Cancelled/refunded orders are never payable
  (`CANCELLED`; if already paid → `REVERSED` = to recover).
- Admin: influencer CRUD, activate/deactivate, generate unique coupon, assign products, discount %, commission % or fixed, view orders/sales/
  commission by status, filters (influencer, coupon, product, order, date range, order status, commission status), payouts, dashboard stats.
- Influencer record: id, name, email, phone, platform, handle, status, coupon, discount, commission type/value, created date.
- Order must keep influencer attribution permanently even if the coupon is edited later.
- Must test: invalid coupon, expired coupon, inactive influencer, cancelled order, refunded order, coupon on wrong product, normal order without coupon.

Image bug: *Cloudinary shows the image but the site doesn't*. Trace the whole pipeline (admin upload → Cloudinary `secure_url` → DB →
DTO → frontend → `next/image`/`<img>` → browser network). Add server logs ("Cloudinary uploaded URL = …", "Saving product image URL = …",
"Returning product image URL = …"), no secrets in logs. Check `next.config` remote patterns, property names (`images` vs `imageUrls`),
DB values (not `/uploads`, null, empty, localhost, Windows path).

### Round 3 — V25: multi-company marketplace + permanent image rules
Namma Store supports **many companies/sellers + a Super Admin**.
- Super Admin creates/manages companies (name, logo, description, contact, email, phone, address, Karnataka location, status, code, created date).
- **Every product belongs to exactly one company** via a real FK (not free text). Super Admin picks the company in the product form
  ("Company ▼"); a company admin's own company is forced server-side.
- **Order routing:** an order is derived through `Order → OrderItems → Product → Company`. Super Admin sees all orders; a company sees
  **only orders containing its products** and **only its own lines/amounts**. Multi-company orders are supported (not duplicated).
  Company A must never see Company B's orders/products/revenue/analytics — enforced in the backend, not just hidden in the UI.
- Companies see order id/date/product/qty/price/delivery info/status/payment/shipping/notes — not unrelated companies' data.
- Prevent IDOR: derive company from the authenticated user; never trust `?companyId=`.
- **Super Admin dashboard:** total/active companies, products, customers, orders, today's orders, revenue, pending/completed, low stock, active banners;
  analytics (sales overview, trends, company-wise sales, product & category performance, top products, top companies); management links
  (companies, products, categories, orders, customers, banners, influencers, coupons, reviews, settings). **All from real DB data.**
- **Company dashboard:** only that company's revenue, orders, products, inventory, pending/completed, low stock, analytics.
- Customers see "Sold by <company>" (+ logo and trust info on the product page).
- Banners: keep working with Cloudinary; admin manages image, title, subtitle, CTA, target URL, position, active, start/end date.

**IMAGE ARCHITECTURE (mandatory, never regress):**
- The V24 bug: DB held `//categories/<file>.jpeg`; browsers read it as host `categories` → `ERR_NAME_NOT_RESOLVED`.
- ONE `StorageService`. DB convention: local → `/uploads/<folder>/<file>` (folders: products, categories, banners, avatars, designs,
  influencers, companies); Cloudinary → the full `https://res.cloudinary.com/...` secure URL.
- Separate checks: `isCloudinaryConfigured()` vs `isObjectStorageConfigured()` (S3/R2). Cloudinary config must NEVER cause an S3/R2 URL.
- Conversion rules (`toPublicUrl` / `normalizeStoredPath`):
  `http(s)://…` → unchanged · `//categories/x`, `/categories/x`, `categories/x` → `/uploads/categories/x` (same for products, banners, avatars,
  designs…) · `//real.host/…` → `https://real.host/…` · `/uploads/x` → backend public base URL (dev `http://localhost:8080`) ·
  S3/R2 URL only if object storage is truly configured. **Never** emit `//categories/…` or `https://categories/…` (same for products/banners).
- Spring must serve `/uploads/**` from `backend/uploads/` locally. Cloudinary is the default permanent store for production.
- `SafeImage` must handle null/empty/malformed/Cloudinary/local/relative values, never rewrite a valid Cloudinary URL, and log
  `[SafeImage] failed to load: ACTUAL_URL`.
- Distinguish: valid local · valid Cloudinary · missing file · malformed. If a DB row points at a missing file, do not fabricate a URL;
  the admin re-uploads. Prefer a migration tool to move local images to Cloudinary.
- Security: Super Admin full; Company own data only; Customer own orders only; backend authorisation everywhere; proper validation/auth/
  not-found/upload/Cloudinary/database error handling with useful frontend messages.
- UI direction: Karnataka-first, Kannada-flavoured, modern, premium, local, trusted — *"Modern Karnataka digital marketplace"*, not a generic
  international clone and not old-fashioned. Responsive: desktop sidebar, tablet collapsible, mobile drawer; no horizontal overflow; skeletons/empty/error states.

### Round 4 — V26: critical bugs + major redesign
**Company login 500** — `POST /api/auth/login` → *"could not initialize proxy [Company#2] - no Session"*. `AppUser.company` is `LAZY`;
login read `getCompany().isActive()/getId()` after the repository returned (`open-in-view=false`).
Required: proper JPA fix (JOIN FETCH / `@EntityGraph` / transactional service), **not** blanket EAGER; keep SUPER_ADMIN, COMPANY_ADMIN,
CUSTOMER login, token system and hashing; credentials created by Super Admin must work immediately; no duplicate companies/accounts;
company must then reach its dashboard, see only its products/orders/inventory, log out and log back in. Don't change company→product→order routing.

**Affiliate API** — frontend `GET /api/admin/affiliate/influencers` returned *"No static resource…"*. Create/verify the proper Spring endpoint using
existing entities (no duplicate affiliate system). Tabs wanted: Overview · Commissions · Payouts · Influencers · Coupons.

**Redesign demands** (the owner was unhappy that earlier changes were "minor CSS"): a strong, recognisable **KARNATAKA + NAMMA STORE** identity,
premium modern e-commerce, not generic orange/brown, not government-site, not cartoonish, not overloaded:
- Inspiration (subtle): Mysore Palace, Mysore silk, textile patterns, Yakshagana accents, Hampi stone, Kannada typography, Karnataka red/yellow
  (used carefully), sandalwood/wood tones, temple geometry, coastal Karnataka. Use as borders, separators, background patterns, icons, card accents,
  hover effects, banner treatments.
- Palette: warm ivory/cream backgrounds, deep coffee/brown text, Karnataka red = primary actions, muted gold = premium highlights, yellow = secondary
  accent, dark brown nav/sidebar, white/cream cards, earthy borders. Good contrast/accessibility.
- Kannada only as a branding layer ("ನಮ್ಮ ಸ್ಟೋರ್", "Karnataka's Local Marketplace", "ನಮ್ಮ ಕರ್ನಾಟಕ"); English stays the working language.
- Customer site: premium header (search, categories, cart, account, location/serviceability), storytelling hero, attractive category cards,
  premium product cards (proper ratios, wishlist, quick actions, price, discount, company), promo banners with real imagery, strong footer.
- Super Admin: premium control centre, Karnataka sidebar, KPI cards with icons/trends, revenue/orders/products/companies/customers/commissions/payouts.
- Companies page: impressive cards/table — logo, name, status, contact, email, phone, created date, active state, credentials handling per the
  security model (don't expose plaintext passwords elsewhere), product count, order count; premium multi-section create form with validation + success state.
- Company admin: completely different view — "You are managing <Company>", own sales/orders/products/pending/recent orders/inventory/profile; no super-admin items.
- Product management: polished forms, image previews, multiple images, category, price, discount, stock, company, specifications, product type.
- Orders: company-specific routing must be explicit in the UI (Company A's order → Company A + Super Admin; never Company B).
- Affiliate UI internal only, real data, coupon creation (influencer, code, discount, commission, validity, usage).
- Animations subtle (page transitions, hovers, image zoom, modals, tabs, skeletons). Responsive for desktop/laptop/tablet/mobile (don't just shrink desktop).
- Validation expected: `mvn clean compile`, `mvn test`, `npm install`, `npx tsc --noEmit`, `npm run build`, then verify login flows, company flow, affiliate API, images, responsive.

### Round 5 — V27: use two reference screenshots
Reference 1 = marketplace storefront (category list | hero | promo tiles, "Deals & offers" strip with countdown, per-category blocks: tinted panel
+ product grid, recommended grid, footer). Reference 2 = "Pixel Commerce" admin (KPI cards with icon + trend, sales area chart with
income/expenses/balance, sales target gauge, top-selling products carousel with product photos, offers/progress panel).
Instruction: **use these layouts but keep the rich Karnataka theme**; any technology is fine; the goal is a rich UI/UX.

### Round 6 — this message (current)
1. Produce this full extract so AI Studio can continue with **all files in sync** (images will be uploaded later).
2. **Design problem:** the current storefront "looks more like a news website than an apparel/shopping brand". Shopping should
   **attract people to see more and stay longer.** (See Section 10 for the redesign brief.)

---

## 4. BUSINESS RULES (exact)

**Coupon evaluation (server only):** active? · expired? · usage limit? · per-customer limit? · min order? · influencer active? · products eligible
(if the influencer has assigned products the discount applies only to those lines)? · discount capped at the eligible subtotal.
Coupon without an influencer = ordinary store coupon (unchanged).

**Attribution:** `Order.influencerId` + `couponCode` are set only from an *applied* coupon at checkout and never recomputed. A `?ref=` with no coupon earns nothing.
Customer-facing responses never include influencer/commission data (`@JsonIgnore` + separate admin DTO).

**Commission:** `base = eligible line totals − coupon discount` (delivery excluded) ; `commission = base × rate%` (or fixed amount), capped at `base`.
Coupon's own commission wins over the influencer's default %. One ledger row per order (`coupon_usages`, unique on `order_id`) with snapshots
(coupon code, order number, product summary, rate/type, amount, status, approved/paid timestamps, payout reference, note).
Example: ₹1000 product, 10% discount, 5% commission → net ₹900 → commission ₹45.00.
Status sync (`CommissionService.syncWithOrder`): delivered → `APPROVED`; cancelled/refunded/return-completed → `CANCELLED` (or `REVERSED` if already `PAID`); moved back from delivered → `PENDING`.
Admin manual: approve (only if delivered), mark paid (only from approved), cancel; bulk payout per influencer with reference.

**Company-admin sandbox (`AdminAuthFilter`, deny by default):** allowed = dashboard (GET), categories (GET), order-statuses (GET), orders (GET, ownership checked in controller),
`/api/admin/products` list/create, `/api/admin/products/{id}…` only if the product's company == caller's company. Everything else under `/api/admin` → 403.
Company order view (`AdminScope.forCompany`): only that company's items; order totals replaced by the company's own total; discount, delivery charge, coupon, userId stripped; `multiCompany` flag set.
Another company's order id returns 404 (no probing).

---

## 5. ROOT CAUSES ALREADY FOUND & FIXED (don't regress)

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | Hidden products/categories missing in admin | Admin page used the *public* API (active only) | Admin pages use `adminGet*` endpoints |
| 2 | Deactivated product reachable by link | Public detail didn't filter `active` | Filter + 404 |
| 3 | Category delete → 500 | Guard counted only active products | `countByCategoryId` (all) |
| 4 | Orphan influencer links on product delete | No FK, no cleanup | `@Transactional` + `deleteByProductId` |
| 5 | Images broken: `//categories/x` | `toPublicUrl` returned `//…` unchanged; frontend turned it into `https://categories/x` | Central `normalizeStoredPath` in backend **and** `imageUrl.ts`; SQL repair 012 |
| 6 | Company login 500 | Lazy `AppUser.company` + `open-in-view=false` | `@EntityGraph(attributePaths="company")` on `AppUserRepository` finders; same for `ProductRepository` ("Sold by") + defensive `Hibernate.isInitialized` in mapper |
| 7 | `No static resource api/admin/affiliate/influencers` | No controller mapped = **running backend was an older build** (the endpoint exists in V25+) | `mvn clean package` + restart; frontend now explains this error |
| 8 | **Storefront promo tiles/dashboard charts unstyled (screenshot)** | `storefront.tsx` and `dashboardCharts.tsx` were **not in Tailwind `content`**, so their classes (`min-h-[150px]`, `snap-x`, `-rotate-90`, `lg:grid-cols-[240px_1fr]`…) were never generated (same class of bug as the earlier `ui.tsx` one) | `tailwind.config.ts` now scans `./*.{js,ts,jsx,tsx}` — **verified: those classes now appear in compiled CSS** |

---

## 6. API CONTRACT (verify against `api.ts` / controllers — the code wins)

Public: `POST /api/auth/login`, register; products list/detail; categories list/detail (active only); active banners; cart; wishlist; coupon validate; checkout (accepts optional `referralCode`); orders (own only).
Upload: `/api/upload` (multipart → StorageService → Cloudinary `secure_url`).
Admin (require admin token; company admins restricted as in §4):
`GET /api/admin/verify` (returns role, displayName, companyId, companyName, companyLogoUrl) · `GET /api/admin/dashboard` (scope-aware; `topProducts[{name,productId,imageUrl,units,revenue}]`, `categoryPerformance`, `companySales` (super only), counts) ·
`GET /api/admin/orders`, `/orders/{id}`, status/return updates (trigger `commissionService.syncWithOrder`) ·
`/api/admin/products` CRUD (+ `companyId` in `ProductRequest`) · `/api/admin/categories` · `/api/admin/companies` (create returns one-time credentials; `productCount`, `orderCount`) ·
`/api/admin/coupons` (+ `influencerId`, `commissionType`, `commissionValue`, `perUserLimit`) · `/api/admin/influencers` ·
`/api/admin/affiliate/summary | influencers | influencers/{id} | generate-code | commissions (filters) | commissions/{id}/status | payouts` (super admin only) ·
`GET /api/admin/diagnostics/images` (kinds: CLOUDINARY, LEGACY_PATH, LOCAL_UPLOADS, LOCAL_FILE_MISSING, LOCALHOST, MALFORMED, NO_IMAGE_IN_DATABASE).

DTO ↔ TS sync points to keep aligned: `ProductDto` (companyId/companyName/companyLogoUrl, thumbnailUrl, images, effectivePrice, discountPercent, onSale, inStock, categoryId/Name) ·
`OrderDto/OrderItemDto` (companyId, companyTotal, multiCompany) · `CompanyDto` (logoUrl public URL, productCount, orderCount) · `DashboardStats` · `CouponDto/AdminCouponDto` · `CommissionRowDto`.

---

## 7. CURRENT UI STATE (V27/V28)

Built: Karnataka palette (`brand` = Karnataka red scale, `gold`, `coffee`, `ivory`), Fraunces display font, silk/zigzag/lattice CSS motifs; admin shell (coffee sidebar,
role-based menus, page headers, KPI cards with trend chips, area chart, donut, top-sellers carousel, inventory health); companies cards + one-time credentials panel;
affiliate 5 tabs; storefront blocks (category rail, hero/carousel, promo tiles, deals strip, category showcases); footer; phone bottom tab bar.

### 7.1 What the owner's screenshot (localhost:3000) shows — problems
- The two promo tiles on the right are squeezed into ~135 px columns, text wraps one word per line → **cause: Tailwind content bug (#8, fixed in V28)**.
- Hero banner is much shorter than the category rail → large empty gap under it.
- Category thumbnails are **random uploaded logos/posters** (bank logos, text posters) — an *image-content* problem, not code. Needs proper photography; the layout should crop consistently (square/4:5, `object-cover`) and the admin should show upload guidelines.
- The page is dominated by **text, thin cards and white space**; images are small. **It reads like a news/portal site, not a fashion/apparel shopping brand.**

---

## 8. SHOPPING-BRAND REDESIGN BRIEF (the next big task)

Goal: **visual-first, product-first, immersive** — the visitor should want to keep scrolling and exploring. Keep the Karnataka identity
(red/gold/coffee, silk stripe, Kannada branding) as an *accent layer*, not the content.

**Homepage structure (top → bottom):**
1. Slim announcement bar + sticky compact header (logo, big search with category dropdown, wishlist, cart with count, account). Mega-menu on hover for categories with images.
2. **Full-bleed hero** (edge-to-edge, 60–75vh desktop, 4:5 on mobile): large lifestyle/model/product photography, one headline, one CTA, auto-rotating campaign slides from the admin banners; thin progress dots; subtle Ken-Burns zoom. Dark gradient only where text sits. **No dense text.**
3. **Circular/story-style category chips** row (image-led, horizontally scrollable) directly under the hero — like shopping apps.
4. **"Shop by category" large image tiles** (2×N mosaic, mixed sizes, label on image, hover zoom + "Shop now" reveal).
5. **Product carousels** (New arrivals, Trending, Deals) — large 4:5 images, 2nd image on hover, wishlist heart on image, quick-add / size picker on hover, price + strike-through + discount badge, "Sold by" line, rating only if real reviews exist.
6. **Editorial split banners** (image left/right with short copy) for collections, festivals, "Made in Karnataka" makers, corporate gifting — real banner uploads.
7. **Shop-the-look / collections** blocks and a **"Meet the makers"** (company logos + short story) — companies as brands, not as text lists.
8. Social proof band (real reviews/orders count only if real), delivery/returns trust strip (compact, icons).
9. Infinite "Recommended for you" grid with "Load more" (keeps users scrolling).
10. Slim, elegant footer (newsletter, links, Kannada tagline).

**Stickiness / engagement (all using real data):** recently-viewed rail · wishlist + "back in stock" · cart drawer (mini-cart) instead of full navigation ·
free-delivery progress bar in cart (needs a real threshold from backend settings) · related/"complete the look" on product page ·
sticky add-to-cart bar on mobile product page · quick view modal · filter/sort chips with instant results · skeleton loading · smooth image fade-in ·
lazy-loaded images with fixed aspect ratios (no layout shift) · page-transition fades.

**Product listing page:** 2 columns on mobile / 4 on desktop, tall 4:5 images, sticky filter bar, size/colour/price/category/company filters, sort, "Load more".
**Product page:** gallery with zoom + thumbnails, sticky buy box, size selector, delivery pincode check (existing serviceability), "Sold by" company card, details accordions, related products.
**Typography:** big, confident headlines (Fraunces), sparse body copy, generous but *purposeful* spacing — fewer boxes, more imagery.
**Mobile-first:** bottom tab bar (exists), thumb-reachable actions, swipe carousels.
**Motion:** subtle only (hover zoom, fade-up on scroll, carousel easing); respect `prefers-reduced-motion`; no heavy libraries required (Framer Motion is *not* installed — add only if truly needed).
**Content dependency:** the look depends on good photography. Admin should show recommended image sizes/ratios on upload screens (hero 16:7 desktop + 4:5 mobile crop, category 1:1, product 4:5).

---

## 9. KNOWN GAPS / NOT DONE YET
- Backend never compiled/run by me → expect small compile/runtime fixes; run `mvn clean compile` first.
- `next build` never run (sandbox limitation) → run `npm run build`.
- Not yet redesigned: cart, checkout, account, product detail (beyond "Sold by"), listing/filters, admin Banners/Categories/Coupons/Users/Influencers pages (only shared styling).
- Missing features: company order-status updates (companies are read-only on orders), weekly/monthly analytics, customers/reviews admin, company logo upload control + Karnataka location/code fields, migration tool to move local images to Cloudinary, mega-menu, quick view, mini-cart, recently viewed, infinite load, free-delivery threshold.
- Companies list does an O(companies × orders) count (fine for small data; optimise later).
- Security hygiene: rotate Cloudinary secret/DB password; move to env vars.

---

## 10. SYNC CHECKLIST FOR AI STUDIO (before finishing any change)
1. Changed an entity/DTO? → update `types.ts`, `api.ts`, every page using it.
2. New endpoint? → add to `api.ts`, check `AdminAuthFilter` (company sandbox) and `Security.java` rules.
3. New image field? → backend must pass it through `StorageService.toPublicUrl`; frontend renders only via `SafeImage`.
4. New Tailwind classes in a **new file**? → ensure the file matches `tailwind.config.ts` `content` (now `./*.{js,ts,jsx,tsx}` + `./app/**`).
5. New DB column? → add SQL under `database/` and keep JPA `ddl-auto` behaviour in mind.
6. Run: `mvn clean compile` · `npx tsc --noEmit` · `npm run build`; test: super-admin login, customer login, company create → company login/logout/login, company sees only own products/orders, affiliate tabs load, upload → Cloudinary URL → storefront image.

---

## 11. COMMANDS
```bash
psql -d namma_store_dev -f database/011_affiliate_attribution.sql
psql -d namma_store_dev -f database/012_repair_legacy_image_paths.sql

cd backend  && mvn clean compile && mvn spring-boot:run
cd frontend && npm install && npx tsc --noEmit && npm run build && npm run dev
```

---

## 12. MASTER PROMPT (paste this into AI Studio with the zip + this file)

```
You are continuing an EXISTING project: Namma Store, a Karnataka-first multi-company e-commerce marketplace
(Next.js + TypeScript + Tailwind frontend, Java 21 Spring Boot + PostgreSQL backend, Cloudinary images).
I have attached the full project zip and NAMMA_STORE_AI_STUDIO_HANDOFF.md. Read the handoff first — it holds every
business rule, security rule, image rule and past decision. Treat the code as the source of truth for exact names.

NON-NEGOTIABLE
- Do not rebuild from scratch; inspect then change surgically. Do not break existing features.
- No fake data. No hard-coded images, statistics, countdowns or placeholder influencers.
- Keep ALL files in sync: entity ↔ DTO ↔ types.ts ↔ api.ts ↔ pages. Tell me every file you change.
- Backend enforces all authorisation, coupon validation, attribution and commission maths. Company admins only ever see their own company's
  data (derive the company from the token, never from request params).
- One central StorageService and one imageUrl.ts/SafeImage. Never produce //folder/... or https://folder/... URLs. Cloudinary URLs pass through untouched.
- Keep the Karnataka identity (Karnataka red + gold + sandalwood/coffee + ivory, silk-stripe/lattice motifs, Kannada branding such as ನಮ್ಮ ಸ್ಟೋರ್)
  as an accent layer.

TASK 1 (do first): get both sides building. Run/mentally compile `mvn clean compile`, `npx tsc --noEmit`, `npm run build`; fix every error.
TASK 2 (main goal): transform the customer storefront from a text-heavy "news website" look into an immersive, image-first FASHION/APPAREL
shopping experience that makes people want to browse longer — follow Section 8 of the handoff exactly (full-bleed hero, story-style category chips,
large image category tiles, 4:5 product cards with hover second image + quick add, editorial banners, meet-the-makers, recommended grid with
load-more, mini-cart, recently viewed, sticky mobile add-to-cart, filters on the listing page, skeletons, subtle motion). Mobile-first and responsive.
TASK 3: restyle the remaining pages (cart, checkout, account, product detail, listing, and admin Banners/Categories/Coupons/Users/Influencers)
to the same design language; show recommended image sizes on upload screens.
TASK 4: finish gaps in Section 9 in priority order, asking me before anything risky.

I will upload real images later; design every image slot with fixed aspect ratios, object-cover, graceful empty states and no layout shift.
At the end report: root causes, files changed (backend / frontend), what changed, build/test results (only what you actually ran), commands, remaining issues.
```
