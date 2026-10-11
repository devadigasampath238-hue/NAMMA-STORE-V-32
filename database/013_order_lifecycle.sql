-- 013_order_lifecycle.sql  (safe to re-run; Hibernate ddl-auto=update also creates these)
-- Per-line shipment timestamp (anchors the per-item return window)
ALTER TABLE IF EXISTS order_items ADD COLUMN IF NOT EXISTS item_status_updated_at TIMESTAMPTZ;

-- Existing lines without a status take their order's status, so legacy orders keep tracking correctly.
UPDATE order_items oi SET item_status = o.status
FROM orders o WHERE oi.order_id = o.id AND oi.item_status IS NULL;

-- New tables (order_tracking_events, item_returns, product_reviews, review_reactions) and
-- users.must_change_password are created by JPA on first start.
ALTER TABLE IF EXISTS app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
