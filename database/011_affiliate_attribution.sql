-- ===========================================================
-- 011_affiliate_attribution.sql
--
-- Influencer = external affiliate (coupon code + product link),
-- NOT a customer-facing feature.
--
--   orders.influencer_id / referral_code
--       permanent attribution, written once at checkout
--   coupon_usages (the commission ledger, one row per order)
--       + snapshots (coupon_code, order_number, product_summary,
--         commission_type, commission_rate) and payout columns
--
-- Safe to re-run. ddl-auto=update creates all of this on the next
-- backend start as well; this file is for deliberate control.
-- ===========================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS influencer_id BIGINT,
    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_orders_influencer ON orders(influencer_id);

ALTER TABLE coupon_usages
    ADD COLUMN IF NOT EXISTS coupon_code       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS order_number      VARCHAR(255),
    ADD COLUMN IF NOT EXISTS product_summary   VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS commission_type   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS commission_rate   NUMERIC(38,2),
    ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payout_reference  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS note              VARCHAR(1000);

-- One commission row per order, ever.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_coupon_usage_order') THEN
        ALTER TABLE coupon_usages ADD CONSTRAINT uk_coupon_usage_order UNIQUE (order_id);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_coupon_usages_influencer ON coupon_usages(influencer_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_status     ON coupon_usages(commission_status);

-- The commission_status column is a plain VARCHAR (EnumType.STRING), so the
-- new REVERSED value needs no schema change. If a CHECK constraint was
-- generated for it by an older Hibernate, widen it:
ALTER TABLE coupon_usages DROP CONSTRAINT IF EXISTS coupon_usages_commission_status_check;
