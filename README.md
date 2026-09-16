# PUBG Food Truck Application

A food truck ordering platform. One responsive website that works on desktop,
tablet and phone.

- **Website:** React (mobile responsive)
- **Backend / APIs:** Python + Django + Django REST Framework
- **Database:** MySQL
- **Auth:** JWT tokens, PBKDF2-hashed passwords, two roles

## Project structure

```
pubg app/
├── backend/        Django REST API (auth: register / login / me / admin users)
├── frontend/       React website (responsive login + dashboard)
├── database/       MySQL schema.sql + seed.sql
└── tools/          asset generation + logo processing scripts
```

## The two user types

| Role | Who they are | What they get |
|------|--------------|---------------|
| **`admin`** | The food truck **owner / order receiver** (main user) | Truck Control dashboard: user counts, registered user list, order intake |
| **`customer`** | The ordering **customer** (secondary user) | Customer home: browse trucks, place orders |

The role lives in the `users.role` column and is returned on login, so the app
sends each role to its own area.

**How accounts are created**
- **Customers** self-register on the website.
- **Admins** are provisioned by the owner — either with
  `python manage.py createadmin`, from the Django admin site, or by an existing
  admin via `POST /api/auth/admin/users/`. Public sign-up **cannot** create an
  admin, so nobody can escalate themselves to owner.

## The login feature

- **Register** and **Login** with a **Customer / Admin portal switch** on the
  login screen, styled in a food-truck theme over the truck photography.
- On register/login the backend returns a JWT **access** + **refresh** token pair
  and the user profile (including `role`). Tokens are stored in `localStorage`
  and sent as `Authorization: Bearer <token>` on later calls.
- Registration **inserts a row into the MySQL `users` table** with a one-way
  hashed password and `role = 'customer'`.

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
- CORS restricted to the known origins.
- Secrets (DB password, Django secret key) read from `.env`, not committed.
- Production hardening (HSTS, secure cookies, SSL redirect) when `DEBUG=False`.

---

## Responsive design

The site is built mobile-first-friendly and verified with no horizontal overflow
from 320px up to desktop.

| Breakpoint | Behaviour |
|------------|-----------|
| `> 900px`  | Full desktop layout, 3-up stat cards, standard data table |
| `≤ 900px`  | Tighter dashboard padding, smaller headings |
| `≤ 640px`  | Login card goes full-width; **data table becomes stacked cards**; stats 2-up |
| `≤ 480px`  | Dashboard header stacks, full-width logout, compact portal buttons |
| `≤ 360px`  | Single-column stats, reduced logo/type sizes |
| landscape, short | Tagline hidden, logo shrunk so the form still fits |

Mobile-specific handling:
- **`100dvh`** alongside `100vh`, so the mobile address bar doesn't cause overflow.
- **16px input font size** — anything smaller makes iOS Safari auto-zoom on focus.
- **48px tall submit buttons**, comfortably above the 44px touch-target minimum.
- **`background-attachment: scroll`** and no blur on touch devices
  (`@media (hover: none)`), since `fixed` is unreliable on iOS and blur is
  expensive on mobile GPUs.
- **Stacked table cards**: a 4-column table can't fit a phone, so `thead` is
  hidden and each cell shows its own label via `data-label`.
- `prefers-reduced-motion` respected.

### Testing on a real phone

The site is served on your LAN, so open it on your phone's browser:

```powershell
# backend must accept the LAN host (already configured)
cd "d:\pubg app\backend"
venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000

# in a second terminal
cd "d:\pubg app\frontend"
npm start
```

Then browse to `http://192.168.8.172:3000` on the phone (same Wi-Fi).
`DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` already include that address.
If it won't connect, Windows Firewall is likely blocking ports 3000/8000 —
your Wi-Fi profile is currently **Public**, which blocks inbound by default.

---

## Image assets

Images live in `frontend/src/assets/images` and `frontend/public`.

```
frontend/src/assets/images/
├── logo.jpeg                    original supplied logo (video screenshot)
├── logo.png                     cropped, transparent-background logo (used)
├── logo-square.png              512x512 square variant
├── Front image.jpeg             original supplied front view
├── login-bg.jpg                 login / home background (used)
├── Side image.jpeg              original supplied side view
├── dashboard-bg.jpg             dashboard background (used)
├── logo.svg / logo-mark.svg     generated vector logos
├── icon-customer.svg            burger -- Customer portal button
├── icon-admin.svg               chef hat -- Admin portal button
├── food-truck-placeholder.svg   truck card image
├── menu-item-placeholder.svg    menu item image
├── avatar-placeholder.svg       user avatar
├── hero-banner.svg              banner with edge fade
└── logo-truck.png               raster logo mark

frontend/public/
├── favicon.ico / favicon.png    browser tab icon
├── logo192.png / logo512.png    PWA + apple-touch icons
└── manifest.json                PWA manifest
```

### Regenerating

```powershell
node tools/generate_assets.js      # PNG/ICO icons (no dependencies)
powershell -File tools/process_logo.ps1   # re-crop logo.jpeg -> logo.png
```

`process_logo.ps1` finds the bright content band in the supplied screenshot,
crops away the video-player chrome, and knocks the white backdrop out to
transparency so the logo sits cleanly on the glass panels.

---

## Environment status

| Component | Status |
|-----------|--------|
| Node.js 26.1.0 / npm 11.13.0 | installed |
| Python 3.12.10 | installed |
| Backend packages (Django 5.1.4, DRF, mysqlclient, …) | installed in `backend/venv` |
| Website packages | installed in `frontend/node_modules` |
| MySQL 8.0.46 | connected, `pubg_food_truck` |
| Django system check | passing, 0 issues |
| Backend test suite | **21/21 passing** |
| Responsive layout | verified 320px → 1440px, no overflow |

## Running the tests

21 tests covering auth and roles, against SQLite in memory (no MySQL needed):

```powershell
cd "d:\pubg app\backend"
venv\Scripts\python.exe manage.py test api --settings=pubg_food_truck.settings_test
```

They assert password hashing, that public sign-up cannot create an admin,
generic login errors, portal enforcement, and that a customer's token gets a
403 on admin endpoints.

---

## 1. Database (MySQL)

Create the database:

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
cases.

> If you use Option B, note that `--fake-initial` skips creating the M2M join
> tables `users_groups` and `users_user_permissions`. They already exist in this
> database; on a fresh one, prefer Option A.

## 2. Backend (Django)

Everything is installed. Set your MySQL password in `backend/.env`:

```
DB_PASSWORD=your_actual_mysql_password
```

Then:

```powershell
cd "d:\pubg app\backend"
venv\Scripts\Activate.ps1

python manage.py migrate
python manage.py createadmin      # create the OWNER (admin) account
python manage.py runserver        # API at http://127.0.0.1:8000/api
```

Auth endpoints:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/api/auth/register/` | public | customer sign-up (inserts user) |
| POST | `/api/auth/login/` | public | authenticate, returns tokens + role |
| POST | `/api/auth/token/refresh/` | public | refresh the access token |
| GET | `/api/auth/me/` | authenticated | current user profile + role |
| GET | `/api/auth/admin/users/` | **admin** | list users (`?role=admin\|customer`) |
| POST | `/api/auth/admin/users/` | **admin** | create an admin or customer account |

### Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `(1050) Table 'users' already exists` | Ran `schema.sql` **and** plain `migrate` | `python manage.py migrate --fake-initial` |
| `(1045) Access denied for user` | Wrong MySQL credentials | Fix `DB_USER` / `DB_PASSWORD` in `backend/.env` |
| `(2003) Can't connect to MySQL server` | MySQL not running | Start the MySQL service |
| `(1049) Unknown database` | Database not created | Run the `CREATE DATABASE` above |
| `No module named 'MySQLdb'` | `mysqlclient` not installed | Activate the venv, `pip install -r requirements.txt` |
| CORS error in the browser console | Serving the site on an unlisted port | Add the origin to `CORS_ALLOWED_ORIGINS` in `backend/.env` |

## 3. Website (React)

```powershell
cd "d:\pubg app\frontend"
npm start                         # http://localhost:3000
```

`frontend/.env` holds `REACT_APP_API_URL=http://127.0.0.1:8000/api`.

---

## Packages

**Backend** (`backend/requirements.txt`): Django, djangorestframework,
mysqlclient, django-cors-headers, djangorestframework-simplejwt, python-dotenv,
Pillow, gunicorn.

**Website** (`frontend/package.json`): react, react-dom, react-router-dom, axios.
