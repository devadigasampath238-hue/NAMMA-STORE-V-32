-- ===========================================================
-- 012_repair_legacy_image_paths.sql
--
-- Repairs image values stored in the legacy shapes that browsers
-- misread as a HOST:
--     //categories/x.jpg   /categories/x.jpg   categories/x.jpg
-- ->  /uploads/categories/x.jpg
--
-- Only values that START with one of our own upload folders are touched.
-- Cloudinary / any http(s) URL is never modified. Idempotent: safe to
-- run repeatedly. It never invents a file - if the file is missing on
-- disk the admin must re-upload (see /api/admin/diagnostics/images).
--
-- It scans every text column whose name looks like an image column, so
-- it also covers the product gallery / banner collection tables.
-- ===========================================================
DO $$
DECLARE
    r RECORD;
    n BIGINT;
BEGIN
    FOR r IN
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.data_type IN ('character varying', 'text')
          AND (c.column_name ~* '(image|thumbnail|logo|photo|cover|avatar|gallery|background)'
               OR c.table_name ~* '(images|gallery)')
    LOOP
        EXECUTE format(
            $q$UPDATE %I SET %I = '/uploads/' || regexp_replace(%I, '^/+', '')
               WHERE %I ~* '^/{0,2}(products|categories|banners|avatars|designs|influencers|companies)/'$q$,
            r.table_name, r.column_name, r.column_name, r.column_name);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
            RAISE NOTICE 'repaired % row(s) in %.%', n, r.table_name, r.column_name;
        END IF;
    END LOOP;
END $$;
