# PUBG Food Truck Application

A food truck ordering platform with a shared login across **web** and **mobile**.

- **Website:** React
- **Mobile app:** React Native (Expo)
- **Backend / APIs:** Python + Django + Django REST Framework
- **Database:** MySQL
- **Auth:** JWT tokens, PBKDF2-hashed passwords, shared login/registration

## Project structure

```
pubg app/
├── backend/        Django REST API (auth: register / login / me)
├── frontend/       React website (login + register page)
├── mobile/         React Native (Expo) app (login + register screen)
└── database/       MySQL schema.sql + seed.sql
```

## The two user types

| Role | Who they are | What they get |
|------|--------------|---------------|
| **`admin`** | The food truck **owner / order receiver** (main user) | Truck Control dashboard: user counts, registered user list, order intake |
| **`customer`** | The ordering **customer** (secondary user) | Customer home: browse trucks, place orders |

The role lives in the `users.role` column and is returned on login, so the web
and mobile clients send each role to its own area of the app.

**How accounts are created**
- **Customers** self-register on the website or mobile app.
- **Admins** are provisioned by the owner — either with
  `python manage.py createadmin`, from the Django admin site, or by an existing
  admin via `POST /api/auth/admin/users/`. Public sign-up **cannot** create an
  admin, so nobody can escalate themselves to owner.

## The login feature (what's built)

- **Register** and **Login** on both web and mobile, styled in a professional
  food-truck theme (charcoal + orange), with a **Customer / Admin portal
  switch** on the login screen.
- On register/login the backend returns a JWT **access** + **refresh** token pair
  and the user profile (including `role`). The client stores the tokens
  (web: `localStorage`, mobile: `AsyncStorage`) and attaches
  `Authorization: Bearer <token>` to subsequent API calls.
- Registration **inserts a row into the MySQL `users` table** with a one-way
  hashed password and `role = 'customer'`. Plaintext passwords are never stored.

### Security measures
- Passwords hashed with Django's PBKDF2 (`set_password`), never plaintext.
- Password strength validators (min 8 chars, not all-numeric, not common).
- Login returns a **generic** "Invalid credentials" message (no user enumeration).
- **Role escalation blocked:** `role` is read-only on public registration and
  always forced to `customer` server-side.
- **Portal enforcement:** the client sends `expected_role`, so a customer
  cannot sign in through the admin portal (and vice versa).
- Admin endpoints protected by an `IsAdminRole` permission class — a customer's
  valid token still gets a 403.
- JWT access token (30 min) + refresh token (7 days), with the role embedded.
- CORS restricted to the known web/mobile origins.
- Secrets (DB password, Django secret key) read from `.env`, not committed.
- Production hardening (HSTS, secure cookies, SSL redirect) when `DEBUG=False`.

---

## Image assets

All images live in `assets/images` folders and are generated, not stock photos,
so they are license-free and match the food-truck theme (charcoal + orange).

```
frontend/src/assets/images/     imported by React components
├── logo.svg                     full horizontal logo + wordmark
├── logo-mark.svg                square app mark (login, dashboard, home)
├── logo-truck.png               raster version, 512x512
├── icon-customer.svg            burger -- Customer portal button
├── icon-admin.svg               chef hat -- Admin portal button
├── food-truck-placeholder.svg   400x240 truck card image
├── menu-item-placeholder.svg    200x200 menu item image
├── avatar-placeholder.svg       96x96 user avatar
└── hero-banner.svg              1200x420 banner

frontend/public/                 served directly, referenced by index.html
├── favicon.ico                  32x32 browser tab icon
├── favicon.png                  32x32 PNG fallback
├── logo192.png / logo512.png    PWA + apple-touch icons
└── manifest.json                PWA manifest

mobile/assets/images/            referenced by app.json + screens
├── icon.png                     1024x1024 app icon
├── adaptive-icon.png            1024x1024 Android foreground (transparent)
├── splash.png                   1284x2778 launch screen
├── favicon.png                  48x48 Expo web icon
└── logo.png                     512x512 in-app logo
```

### Regenerating

The PNG and ICO files are produced by a dependency-free Node script (draws the
artwork, then encodes PNG with the built-in `zlib`):

```powershell
node tools/generate_assets.js
```

Edit the `C` palette or `drawTruck()` in `tools/generate_assets.js` to restyle,
then re-run. SVGs are hand-written and edited directly.

To swap in your own photos, drop them in the same folder and update the import
in the component. SVG and PNG both import directly in React; React Native needs
PNG or JPG (SVG requires `react-native-svg`).

---

## Environment status

| Component | Status |
|-----------|--------|
| Node.js 26.1.0 / npm 11.13.0 | installed |
| Python 3.12.10 | installed |
| Backend packages (Django 5.1.4, DRF, mysqlclient, …) | installed in `backend/venv` |
| Website packages | installed in `frontend/node_modules` |
| Mobile packages | installed in `mobile/node_modules` |
| Image assets | generated, wired into web + mobile |
| Mobile Metro bundle | verified, 784 modules |
| Django system check | passing, 0 issues |
| Backend test suite | **21/21 passing** |
| MySQL connection | **needs your password in `backend/.env`** |

Only one thing is left to do: set `DB_PASSWORD` in `backend/.env`.

## Running the tests

The auth and role logic is covered by 21 tests that run against SQLite in
memory, so they need no MySQL credentials:

```powershell
cd "d:\pubg app\backend"
venv\Scripts\python.exe manage.py test api --settings=pubg_food_truck.settings_test
```

They assert password hashing, that public sign-up cannot create an admin,
generic login errors, portal enforcement, and that a customer's token gets a
403 on admin endpoints.

---

## 1. Database (MySQL)

Create the database itself (always required):

```sql
CREATE DATABASE IF NOT EXISTS pubg_food_truck
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then create the tables using **one** of these options — not both, or MySQL
throws `Table 'users' already exists` (error 1050):

| Option | What you do | Then run |
|--------|-------------|----------|
| **A — recommended** | Nothing by hand | `python manage.py migrate` |
| **B — manual SQL** | Run the `users` table from `database/schema.sql` | `python manage.py migrate --fake-initial` |

Django needs its own supporting tables too (`auth_permission`,
`django_session`, `django_migrations`, …), which is why `migrate` runs in both
cases. `--fake-initial` tells Django the `users` table already exists so it
skips creating it and builds only the rest.

## 2. Backend (Django)

Python 3.12.10, the venv at `backend/venv`, and all packages are **already
installed**. `backend/.env` exists with a freshly generated
`DJANGO_SECRET_KEY`. You only need to set your MySQL password:

```
# backend/.env
DB_PASSWORD=your_actual_mysql_password
```

Then:

```powershell
cd "d:\pubg app\backend"
venv\Scripts\Activate.ps1

# create tables -- see the table in step 1 for which form to use
python manage.py migrate                  # Option A
# python manage.py migrate --fake-initial # Option B (users table made by hand)

python manage.py createadmin      # create the OWNER (admin) account
python manage.py createsuperuser  # optional, for the Django admin site
python manage.py runserver        # API at http://127.0.0.1:8000/api
```

### Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `(1050) Table 'users' already exists` | Ran `schema.sql` **and** plain `migrate` | `python manage.py migrate --fake-initial` |
| `(1045) Access denied for user` | Wrong MySQL credentials | Fix `DB_USER` / `DB_PASSWORD` in `backend/.env` |
| `(2003) Can't connect to MySQL server` | MySQL not running | Start the MySQL service |
| `(1049) Unknown database` | Database not created | Run the `CREATE DATABASE` in step 1 |
| `No module named 'MySQLdb'` | `mysqlclient` not installed | Activate the venv, `pip install -r requirements.txt` |
| `django.db.utils.OperationalError` on login | Backend can't reach MySQL | Check MySQL is up and `.env` is correct |

Auth endpoints:
| Method | Endpoint                    | Access        | Purpose                                |
|--------|-----------------------------|---------------|----------------------------------------|
| POST   | `/api/auth/register/`       | public        | customer sign-up (inserts user)        |
| POST   | `/api/auth/login/`          | public        | authenticate, returns tokens + role    |
| POST   | `/api/auth/token/refresh/`  | public        | refresh the access token               |
| GET    | `/api/auth/me/`             | authenticated | current user profile + role            |
| GET    | `/api/auth/admin/users/`    | **admin**     | list users (`?role=admin\|customer`)   |
| POST   | `/api/auth/admin/users/`    | **admin**     | create an admin or customer account    |

## 3. Website (React)

```powershell
cd "d:\pubg app\frontend"
copy .env.example .env            # REACT_APP_API_URL=http://127.0.0.1:8000/api
npm install                       # already done
npm start                         # opens http://localhost:3000
```

## 4. Mobile app (React Native / Expo)

Packages are installed and `mobile/.env` is already set to this PC's Wi-Fi IP
(`192.168.8.172`).

### Start the backend so the phone can reach it

`runserver` alone binds to `127.0.0.1`, which a phone cannot reach. Bind to all
interfaces instead:

```powershell
cd "d:\pubg app\backend"
venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

### Start Expo

```powershell
cd "d:\pubg app\mobile"
npm start
```

Then pick your target:

| Target | What to do | `EXPO_PUBLIC_API_URL` in `mobile/.env` |
|--------|-----------|----------------------------------------|
| **Physical phone** | Install **Expo Go**, scan the QR code. Phone and PC must share the same Wi-Fi. | `http://192.168.8.172:8000/api` (set) |
| **Android emulator** | Press `a` in the Expo terminal | `http://10.0.2.2:8000/api` |
| **iOS simulator** (macOS only) | Press `i` | `http://127.0.0.1:8000/api` |
| **Browser preview** | Press `w` | `http://127.0.0.1:8000/api` |

Restart Expo after editing `.env` — the value is baked in at bundle time.

`DJANGO_ALLOWED_HOSTS` already includes `192.168.8.172` and `10.0.2.2`; without
that Django replies `DisallowedHost`.

### Mobile troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Unable to reach the server" | Wrong host for your target | Match the table above, restart Expo |
| Works in browser, fails on phone | Backend bound to `127.0.0.1` | Use `runserver 0.0.0.0:8000` |
| `DisallowedHost` in Django log | IP missing from allowed hosts | Add it to `DJANGO_ALLOWED_HOSTS` in `backend/.env` |
| QR scan won't connect | Different networks, or firewall | Same Wi-Fi; allow Python through Windows Firewall; or `npx expo start --tunnel` |
| Phone on guest/AP-isolated Wi-Fi | Network blocks device-to-device | Use `--tunnel` |

---

## Packages

**Backend** (`backend/requirements.txt`): Django, djangorestframework,
mysqlclient, django-cors-headers, djangorestframework-simplejwt, python-dotenv,
Pillow, gunicorn.

**Website** (`frontend/package.json`): react, react-dom, react-router-dom, axios.

**Mobile** (`mobile/package.json`): expo, react-native, @react-navigation/native
(+ native-stack, bottom-tabs), react-native-screens, react-native-safe-area-context,
axios, @react-native-async-storage/async-storage.
