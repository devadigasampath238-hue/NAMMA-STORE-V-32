-- ===========================================================
-- 008_marketplace_stage1.sql
--
-- STAGE 1 of the multi-company marketplace rebuild: database
-- models and relationships only. No new endpoints are wired to
-- write most of these columns yet - that starts at Stage 2
-- (auth/roles) and Stage 4 (coupons/commission).
--
-- SAFE BY DESIGN:
--   - Every new column is nullable or has a default, so every
--     existing row in products, orders, order_items, coupons
--     and app_users keeps working exactly as it does today.
--   - NULL company_id on a product/order_item means "Namma
--     Store's own catalogue", the pre-marketplace default -
--     nothing needs to be reassigned for the site to keep
--     running unchanged after this runs.
--   - The existing admin.admin boolean is left in place and
--     untouched; role is an additive column read as a fallback
--     from that flag by AppUser.getRole() in application code,
--     so no data backfill is required for existing admins to
--     keep working.
--
-- ddl-auto=update will also create these tables/columns on next
-- backend start, so running this file is optional but
-- recommended for deliberate control over production schema.
-- Safe to re-run.
-- ===========================================================

/* ---------------------------------------------------------
   Companies (vendors/suppliers)
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS companies (
    id                           BIGSERIAL PRIMARY KEY,
    name                         VARCHAR(255) NOT NULL,
    logo_url                     VARCHAR(512),
    login_email                  VARCHAR(255) UNIQUE,
    password_hash                VARCHAR(100),
    phone                        VARCHAR(30),
    address                      VARCHAR(1000),
    gst_number                   VARCHAR(30),
    contact_person               VARCHAR(255),
    active                       BOOLEAN NOT NULL DEFAULT TRUE,

    -- Per-company commercial agreement (Super Admin configurable, Stage 6).
    platform_commission_percent  NUMERIC(6,2),
    platform_fixed_fee           NUMERIC(10,2),
    shipping_responsibility      VARCHAR(50),
    return_responsibility        VARCHAR(50),
    settlement_period_days       INTEGER,

    created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/* ---------------------------------------------------------
   Influencers
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS influencers (
    id                          BIGSERIAL PRIMARY KEY,
    name                        VARCHAR(255) NOT NULL,
    email                       VARCHAR(255) UNIQUE,
    phone                       VARCHAR(30),
    social_platform             VARCHAR(60),
    social_handle               VARCHAR(120),
    profile_image_url           VARCHAR(512),
    active                      BOOLEAN NOT NULL DEFAULT TRUE,
    default_commission_percent  NUMERIC(6,2),
    app_user_id                 BIGINT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/* ---------------------------------------------------------
   Coupon usage / affiliate conversion ledger
   Append-only: rows are never edited, only commission_status
   advances (PENDING -> APPROVED -> PAID, or -> CANCELLED).
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS coupon_usages (
    id                  BIGSERIAL PRIMARY KEY,
    coupon_id           BIGINT,
    influencer_id       BIGINT REFERENCES influencers(id),
    order_id            BIGINT,
    customer_id         BIGINT,
    company_id          BIGINT REFERENCES companies(id),
    product_id          BIGINT,
    order_amount        NUMERIC(10,2),
    discount_amount     NUMERIC(10,2),
    commission_amount   NUMERIC(10,2),
    commission_status   VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_influencer ON coupon_usages (influencer_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_company    ON coupon_usages (company_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_order      ON coupon_usages (order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon     ON coupon_usages (coupon_id);

/* ---------------------------------------------------------
   Scoping columns on existing tables
   --------------------------------------------------------- */

-- app_users: role replaces the single admin boolean going forward.
-- The boolean stays so nothing breaks; getRole() in AppUser.java falls
-- back to it for every row where role is still NULL.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role       VARCHAR(20);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES companies(id);

UPDATE app_users SET role = 'SUPER_ADMIN' WHERE role IS NULL AND admin = TRUE;
UPDATE app_users SET role = 'CUSTOMER'    WHERE role IS NULL AND admin = FALSE;

CREATE INDEX IF NOT EXISTS idx_app_users_company ON app_users (company_id);

-- products: NULL = Namma Store's own catalogue (unchanged behaviour).
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products (company_id);

-- order_items: snapshot the company at checkout time, plus a per-item
-- status so each company can progress only its own lines.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS company_id  BIGINT REFERENCES companies(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_status VARCHAR(20);

UPDATE order_items oi
   SET item_status = o.status
  FROM orders o
 WHERE oi.order_id = o.id
   AND oi.item_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_company ON order_items (company_id);

-- coupons: influencer attribution and commission terms.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS influencer_id    BIGINT REFERENCES influencers(id);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS commission_type  VARCHAR(20);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS commission_value NUMERIC(10,2);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit   INTEGER;

CREATE INDEX IF NOT EXISTS idx_coupons_influencer ON coupons (influencer_id);

-- NOTE: no companies or influencers are seeded here. This stage adds the
-- shape of the marketplace; populating it is an admin action once Stage 3
-- (company dashboard) and Stage 4 (influencer/coupon UI) exist to do it
-- through, not a step to fake with sample rows.
