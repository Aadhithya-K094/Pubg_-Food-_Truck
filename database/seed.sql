-- ============================================================
-- PUBG Food Truck - setup & role queries (MySQL)
-- Run in MySQL Workbench or the mysql CLI.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create and select the database
-- ------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS pubg_food_truck
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE pubg_food_truck;

-- ------------------------------------------------------------
-- 2. Create the users table (admin + customer roles)
--    Skip this if you're letting Django build it via `migrate`.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(150) NOT NULL UNIQUE,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password      VARCHAR(255) NOT NULL,          -- PBKDF2 hash, never plaintext
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


-- ============================================================
-- 3. Creating the two users
-- ============================================================
-- IMPORTANT: do NOT insert users with a plaintext password.
-- Django verifies logins by comparing a PBKDF2 hash, so a row like
--   INSERT INTO users (..., password) VALUES (..., 'mypassword123');
-- can never log in -- and storing a readable password is unsafe.
--
-- Create accounts through the app so the password gets hashed:
--
--   ADMIN (owner / order receiver):
--       cd backend
--       python manage.py createadmin
--
--   CUSTOMER:
--       register on the website or the mobile app
--       (public sign-up always produces role = 'customer')
-- ------------------------------------------------------------

-- Promote an existing account to ADMIN (owner):
-- UPDATE users SET role = 'admin', is_staff = TRUE
--  WHERE username = 'your_username';

-- Demote an account back to CUSTOMER:
-- UPDATE users SET role = 'customer', is_staff = FALSE
--  WHERE username = 'your_username';


-- ============================================================
-- 4. Verification queries
-- ============================================================

-- All users and their roles
SELECT id, username, email, full_name, role, is_active, date_joined
FROM users
ORDER BY date_joined DESC;

-- Just the admins (owners / order receivers)
SELECT id, username, email, full_name
FROM users
WHERE role = 'admin';

-- Just the customers
SELECT id, username, email, full_name
FROM users
WHERE role = 'customer';

-- Count per role
SELECT role, COUNT(*) AS total
FROM users
GROUP BY role;

-- Confirm passwords are hashed, not plaintext.
-- Expect values starting with  pbkdf2_sha256$
SELECT username, LEFT(password, 30) AS password_hash
FROM users;

-- Table structure check
DESCRIBE users;
