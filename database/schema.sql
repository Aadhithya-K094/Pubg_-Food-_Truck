-- ============================================================
-- PUBG Food Truck - Database schema (MySQL)
-- ============================================================
-- STEP 1 (always required): create the database itself.
--
--   CREATE DATABASE IF NOT EXISTS pubg_food_truck
--     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE pubg_food_truck;
--
-- ------------------------------------------------------------
-- STEP 2: create the tables. Pick ONE option -- do not do both,
-- or you'll hit "Table 'users' already exists" (error 1050).
-- ------------------------------------------------------------
-- OPTION A (recommended) -- let Django build every table:
--
--     python manage.py migrate
--
--   Django creates `users` PLUS its own required tables
--   (auth_permission, django_session, django_migrations, ...).
--   The file below is then just reference documentation.
--
-- OPTION B -- create `users` by hand from this file, then tell
--   Django the table already exists and let it build the rest:
--
--     python manage.py migrate --fake-initial
--
--   `--fake-initial` marks the api app's initial migration as
--   applied without re-running it, then continues with Django's
--   own tables. Without this flag Option B fails.
-- ============================================================

-- ------------------------------------------------------------
-- users table
-- ------------------------------------------------------------
-- Two kinds of users, distinguished by the `role` column:
--   * 'admin'    -> the food truck OWNER / order receiver (main user)
--   * 'customer' -> the ordering customer (secondary user)
--
-- Security notes:
--   * `password` stores a ONE-WAY HASH (Django PBKDF2), never plaintext.
--   * `email` and `username` are UNIQUE to prevent duplicate accounts.
--   * `role` defaults to 'customer' so public sign-ups can never
--     accidentally create an owner account.
--   * timestamps help with auditing / account management.
-- This layout is compatible with Django's authentication model,
-- so the backend can authenticate against it directly.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(150) NOT NULL UNIQUE,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password      VARCHAR(255) NOT NULL,          -- hashed password (PBKDF2)
    full_name     VARCHAR(255) DEFAULT NULL,
    phone         VARCHAR(20)  DEFAULT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'customer',  -- 'admin' | 'customer'
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    is_staff      BOOLEAN NOT NULL DEFAULT FALSE,
    is_superuser  BOOLEAN NOT NULL DEFAULT FALSE,
    last_login    DATETIME DEFAULT NULL,
    date_joined   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_users_email (email),
    INDEX idx_users_username (username),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Already created `users` WITHOUT the role column? Patch it:
-- ------------------------------------------------------------
--   ALTER TABLE users
--     ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'customer' AFTER phone,
--     ADD INDEX idx_users_role (role);

-- ------------------------------------------------------------
-- Useful checks
-- ------------------------------------------------------------
--   SHOW TABLES;
--   DESCRIBE users;
--   SELECT id, username, email, role, date_joined FROM users;
--
-- Verify passwords are hashed, never plaintext -- the value should
-- look like  pbkdf2_sha256$...  and NOT like the typed password:
--
--   SELECT username, LEFT(password, 30) AS password_hash FROM users;

-- ------------------------------------------------------------
-- Start over (DESTRUCTIVE -- deletes all accounts)
-- ------------------------------------------------------------
--   DROP TABLE IF EXISTS users;
