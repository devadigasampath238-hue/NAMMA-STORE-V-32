# V25 notes (built on V24)

## Run
    psql -d namma_store_dev -f database/011_affiliate_attribution.sql
    psql -d namma_store_dev -f database/012_repair_legacy_image_paths.sql   # fixes //categories/x rows
    cd backend  && mvn clean package -DskipTests && mvn spring-boot:run
    cd frontend && npm install && npx tsc --noEmit && npm run dev

## Image bug (//categories/x -> https://categories/x)
Cause: StorageService.toPublicUrl() returned any value starting with "//" unchanged, and the
frontend resolver turned "//x" into "https://x". Both now call ONE rule set:
http(s) untouched; //categories/x, /categories/x, categories/x -> /uploads/categories/x;
//real.host/.. -> https://real.host/..; S3/R2 URL only if isObjectStorageConfigured().
Check your data: GET /api/admin/diagnostics/images (CLOUDINARY / LEGACY_PATH /
LOCAL_UPLOADS / LOCAL_FILE_MISSING / MALFORMED). Missing files must be re-uploaded in admin.

## Multi-company
- Product.company is a real FK. Super admin picks it in the product form (required once companies exist).
  A company admin's products are forced to their own company server-side.
- AdminAuthFilter sandbox: COMPANY_ADMIN may only use dashboard, read-only categories/orders,
  and its OWN products. Everything else under /api/admin is 403.
- /api/admin/orders and /dashboard derive the company from the login token. A company sees only
  orders containing its products and only ITS lines/amounts (no other company, coupon or order-wide total).
- Customers see "Sold by <company>" (+logo on product page).

## Test
1. Create companies A and B (super admin). Create a product for each.
2. Log in as A: Products shows only A's; opening B's product id via API => 403;
   Orders/Dashboard show only A.
3. Customer buys A's and B's product in one order: super admin sees both; A sees only its line (multiCompany=true).
4. Image: upload product image, check log lines, diagnostics, storefront.
