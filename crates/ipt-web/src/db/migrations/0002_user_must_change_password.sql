-- 0003_user_must_change_password.sql
-- A user that was bootstrapped with a randomly-generated initial password
-- has must_change_password=1; all write operations are blocked until the
-- user completes /auth/change-password, which clears the flag.

ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
