# Affiliate system + image diagnostics (V24)

## Run
    # one-time (or let ddl-auto=update do it on start)
    psql -d namma_store_dev -f database/011_affiliate_attribution.sql
    cd backend  && mvn clean package -DskipTests && mvn spring-boot:run
    cd frontend && npm install && npx tsc --noEmit && npm run dev

## Image test
1. Admin > Products > edit a product, pick an image, press Save (the image only attaches on Save).
2. Backend log shows, in order:
   `Cloudinary uploaded URL = https://res.cloudinary.com/...`
   `Saving product <id> image URL = https://res.cloudinary.com/...`
   `Returning product <id> image URL = https://res.cloudinary.com/...`
3. GET /api/admin/diagnostics/images (admin token) - expect only CLOUDINARY values and
   productsWithNoImageInDatabase = 0. Any LOCAL_UPLOADS / LOCALHOST / MALFORMED /
   NO_IMAGE_IN_DATABASE row is the cause for that product.
4. Open the storefront; a failing image logs `[SafeImage] failed to load: <url>` in the
   browser console - check that URL in the Network tab.
Silence the logging later with APP_DEBUG_IMAGES=false.

## Influencer test (super admin)
1. Admin > Influencers: add Rahul (assign Product A if you want the code limited to it).
2. Admin > Influencer Sales & Commissions > New influencer coupon:
   influencer Rahul, code RAHUL10 (Generate), discount 10% , commission 5%.
3. As a customer: add Product A, apply RAHUL10, place the order.
   Expect the commission row: sale = net after discount, commission = 5% of that, PENDING.
   Example: Rs 1000 product -> discount 100 -> net 900 -> commission Rs 45.00.
4. Admin > Orders: set the order DELIVERED -> commission becomes APPROVED.
5. Payouts tab (or Mark paid on the row) -> PAID.
6. Negative checks: invalid code, expired coupon, inactive influencer, product not assigned,
   cancelled order (commission CANCELLED, or REVERSED if already paid), completed return,
   order without a coupon (no commission row, influencerId null).
