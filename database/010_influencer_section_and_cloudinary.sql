-- ===========================================================
-- 010_influencer_section_and_cloudinary.sql
--
-- Adds everything the customer-facing Influencer/Creator section
-- and the admin Influencer CRUD screen need:
--   - new columns on `influencers` (cover image, bio, featured flag,
--     display order)
--   - `influencer_gallery`      - extra photos per influencer
--   - `influencer_social_links` - free-text "platform|url" links
--   - `influencer_products`     - which products an influencer curates
--
-- Nothing here is Cloudinary-specific: Cloudinary is a storage
-- BACKEND selected entirely by environment variables (see
-- backend/.env.example), not a database concern. Every existing
-- *_url / *image_url column already stores a plain string, and a
-- Cloudinary secure_url is just a (longer, permanent, CDN-backed)
-- string, so no column needs to change type or length beyond the
-- bump below for the new influencer image columns.
--
-- SAFE BY DESIGN: every new column is nullable or defaulted, and
-- every CREATE TABLE uses IF NOT EXISTS. Safe to re-run.
-- ddl-auto=update will also create these on next backend start,
-- so running this file is optional but recommended for deliberate
-- control over production schema.
-- ===========================================================

ALTER TABLE influencers
    ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(512),
    ADD COLUMN IF NOT EXISTS bio             VARCHAR(2000),
    ADD COLUMN IF NOT EXISTS featured        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS display_order   INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS influencer_gallery (
    influencer_id  BIGINT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
    image_order    INTEGER NOT NULL,
    image_url      VARCHAR(512),
    PRIMARY KEY (influencer_id, image_order)
);

CREATE TABLE IF NOT EXISTS influencer_social_links (
    influencer_id  BIGINT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
    link           VARCHAR(512)
);
CREATE INDEX IF NOT EXISTS idx_influencer_social_links_influencer
    ON influencer_social_links(influencer_id);

CREATE TABLE IF NOT EXISTS influencer_products (
    id              BIGSERIAL PRIMARY KEY,
    influencer_id   BIGINT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
    product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    note            VARCHAR(500),
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (influencer_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_influencer_products_influencer ON influencer_products(influencer_id);
CREATE INDEX IF NOT EXISTS idx_influencer_products_product    ON influencer_products(product_id);
