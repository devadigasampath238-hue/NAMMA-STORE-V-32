-- 009_custom_auth.sql
-- ===========================================================
-- Removes the Firebase concept from the database and switches
-- to this app's own email/mobile + password login.
--
-- Safe to run more than once (every statement is guarded).
-- Run this BEFORE starting the new backend for the first time
-- against an existing database. A brand new database created
-- with spring.jpa.hibernate.ddl-auto=update does not need this
-- file at all - Hibernate will create the right columns itself.
-- ===========================================================

-- 1. app_users.firebase_uid -> app_users.account_uid
--    Same column, same values, just renamed to match what it now means:
--    an internally-generated account id, not something Firebase gave us.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_users' AND column_name = 'firebase_uid'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_users' AND column_name = 'account_uid'
    ) THEN
        ALTER TABLE app_users RENAME COLUMN firebase_uid TO account_uid;
    END IF;
END $$;

-- 2. app_users.password_hash - where every account's PBKDF2 hash now lives,
--    including the super admin and every company admin.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 3. Existing rows created back when Firebase issued the identity have no
--    password yet. They cannot log in until either:
--      a) a customer uses "Forgot password" (once that flow is built), or
--      b) an admin sets one manually, or
--      c) they register a new account.
--    This migration does not invent a password for them - that would be a
--    security problem, not a fix. Nothing else about their data changes.

-- 4. companies.password_hash is no longer used - the real password lives on
--    the linked app_users row (see Company.java). Safe to drop.
ALTER TABLE companies DROP COLUMN IF EXISTS password_hash;

-- 5. Helpful lookups for login-by-phone and admin company listings.
CREATE INDEX IF NOT EXISTS idx_app_users_phone ON app_users (phone);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (email);
CREATE INDEX IF NOT EXISTS idx_app_users_company_id ON app_users (company_id);
