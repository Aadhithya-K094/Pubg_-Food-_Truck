# Implementation Plan: dedicated `admin_users` table + admin-only login

Repo: `d:/Old Folders/Pubg_-Food-_Truck` (branch master, do NOT commit/push). Backend dir: `d:/Old Folders/Pubg_-Food-_Truck/backend`.
Python: `d:/Old Folders/Pubg_-Food-_Truck/backend/venv/Scripts/python.exe` (run `manage.py` from the backend dir). Never print the DB password; do not edit `.env`.
Dev servers on :8000 / :3000 stay running. Use port 8001 for own checks.

## Findings from reading the code (what drives the design)

- `api.User` (table `users`, `AbstractBaseUser + PermissionsMixin`) holds both roles. `UserManager.create_admin` sets role=admin.
- `permissions.py`: `IsAdminRole` checks `user.role == 'admin'`. `IsCustomerRole` exists but is not used. Customer endpoints (`PlaceOrderView`, `MyOrdersView`, `ReviewListCreateView.post`) use plain `IsAuthenticated` and then `request.user` as `customer=` FK. Once an admin can be a different model, those must be tightened or an admin token would break them with an FK error.
- `views.py`: `_tokens_for` uses `RefreshToken.for_user` plus a `role` claim. `LoginView` uses `authenticate()` against `users` and an optional `expected_role`. `GoogleLoginView` finds or creates by email with no role check. `AdminUserListCreateView` is gated by `IsAdminRole`.
- `order_views.py`: `AdminOrderActionView` writes `AdminOrderStatusLog(admin=request.user)`. Admin views are gated by `IsAdminRole`.
- `settings.py`: only `JWTAuthentication` is configured. `SIMPLE_JWT` has 1h access and refresh, `ROTATE_REFRESH_TOKENS=True`. `auth/refresh-token/` is the stock `TokenRefreshView`.
- Frontend: `services/api.js` has `login()` posting `/auth/login/` with `expected_role`. `Login.js` already has an Admin/Customer portal switch (`portal`, `isAdminPortal`), and `handleSubmit` calls `login({... expectedRole: portal})`. `App.js` `RequireAuth` guards by `localStorage.user.role`. `AdminDashboard.js` and `Navbar.js` call `logout()`.
- `database/schema.sql` only documents `users`. `database/seed.sql` also creates `users`. Backup is `database/backups/pubg_food_truck_backup.sql`.
- `settings_test.py` uses in-memory SQLite. Run tests with `--settings=pubg_food_truck.settings_test`.

## Design decisions (final)

1. **Model**: `AdminUser(AbstractBaseUser)`, `db_table='admin_users'`. This is not a `PermissionsMixin` model and is not `AUTH_USER_MODEL`.
   - Reason: `AbstractBaseUser` gives `password`, `last_login`, `set_password`, `check_password` (PBKDF2 via `make_password`) and `is_authenticated=True` for free. It stays fully separate from `users`.
   - Fields: `username` (unique, 150), `email` (unique, 254), `password` (inherited, hashed), `full_name`, `phone` (nullable), `is_active` (default True), `last_login` (inherited), `created_at` (auto_now_add), `updated_at` (auto_now).
   - `USERNAME_FIELD='username'`, `REQUIRED_FIELDS=['email']`.
   - Add `AdminUserManager` with `create_admin(username, email, password, **extra)`. Hash with `set_password`, normalize email, and require username/email.
   - Add property `role` returning `"admin"` and property `is_admin = True`, so serializers and frontend keep consuming `user.role`.
2. **Token design**: every JWT carries a `user_type` claim (`"admin"` or `"customer"`). Keep the existing `role` claim too, with the same value, for compatibility.
   - New file `backend/api/authentication.py` with `AccountJWTAuthentication(JWTAuthentication)`. It overrides `get_user(validated_token)`:
     - read `user_type`;
     - `"admin"`: look up `AdminUser` by the `user_id` claim, require `is_active`;
     - `"customer"`: look up `User` by `user_id`, require `is_active` and `role == 'customer'`;
     - anything else, including a missing claim: raise `AuthenticationFailed`.
   - Result: an admin token can never resolve to a `users` row with the same id, and vice versa. Old pre-change tokens (no `user_type`) are rejected and expire within 1h anyway.
   - Set `REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'] = ("api.authentication.AccountJWTAuthentication",)` in `settings.py`.
   - Token creation: `tokens_for(account)` in `views.py` (or a small helper in `authentication.py`) does `RefreshToken.for_user(account)`, then sets `refresh["user_type"]` and `refresh["role"]`, with `access = refresh.access_token`. simplejwt copies custom claims from refresh to access and to the rotated refresh, so type is preserved.
3. **Refresh**: stock `TokenRefreshSerializer` (simplejwt 5.3.1) may look the `user_id` up in `get_user_model()`, which would wrongly resolve an admin id against `users`.
   - FIRST read `venv/Lib/site-packages/rest_framework_simplejwt/serializers.py` to confirm.
   - Regardless of what it shows, add `AccountTokenRefreshSerializer(TokenRefreshSerializer)` and `AccountTokenRefreshView` in `backend/api/authentication.py` or `views.py`.
   - The serializer validates the refresh token, reads `user_type` and `user_id`, resolves the account using the same rules as `AccountJWTAuthentication`, and raises `AuthenticationFailed("No active account")` if it is missing or inactive.
   - It then returns a new access token (and a rotated refresh when `ROTATE_REFRESH_TOKENS` is on) with `user_type` and `role` preserved. Point `auth/refresh-token/` at this view.
4. **Permissions** (`permissions.py`):
   - `IsAdminRole`: `isinstance(request.user, AdminUser) and request.user.is_active`.
   - `IsCustomerRole`: `isinstance(request.user, User) and request.user.role == Role.CUSTOMER`.
   - Switch `PlaceOrderView`, `MyOrdersView`, and `ReviewListCreateView` POST from `IsAuthenticated` to `IsCustomerRole` (the GET stays `AllowAny`).
   - `MeView` stays `IsAuthenticated`. It returns `AdminUserSerializer` for an `AdminUser` and `UserSerializer` for a `User`.
5. **Endpoints**:
   - NEW `POST /api/auth/admin-login/`, name `admin_login`, `AdminLoginView`, `AllowAny`. It accepts `username` (username OR email, case-insensitive for email) and `password`.
   - It looks up ONLY `AdminUser`. A wrong password or unknown user returns 401 `{"detail":"Invalid credentials."}`. For an unknown user, still run a dummy `check_password` against a fixed hash to equalize timing. An inactive account returns 403 `"This account is disabled."`.
   - On success it updates `last_login` and returns `{"user": AdminUserSerializer, "tokens": {"access","refresh"}, "message": "Login successful."}`. This is the same shape the frontend already persists.
   - `POST /api/auth/login/` is customer only. Authenticate against `users`, then require `role == 'customer'`; otherwise return the same generic 401. An `admin_users` credential fails naturally because it is not in `users`.
   - If the client sends `expected_role == 'admin'`, return 403 `"Use the admin login."`. Remove the admin-portal role comparison.
   - `GoogleLoginView`: when an existing `users` row matches the email but has `role != 'customer'`, return 403. New users are customers, as today. `RegisterView` is unchanged (customer only).
   - `AdminUserListCreateView` (`/api/users/`) stays admin-only.
     - GET: default returns `users` rows (customers only). `?role=admin` returns `AdminUser` rows via `AdminUserSerializer`.
     - POST: `role=admin` creates an `AdminUser` via a new `AdminCreateAdminSerializer` (username, email, full_name, phone, password; reuse `validate_username_value`, `validate_phone_value`, `validate_password`). `role=customer` (default) creates a customer as today.
   - All `/api/admin/*` views keep `IsAdminRole`, which now means an admin token.
6. **FK repoint**: `AdminOrderStatusLog.admin = ForeignKey('api.AdminUser', on_delete=SET_NULL, null=True, blank=True, related_name='handled_order_logs')`. Remove the `settings.AUTH_USER_MODEL` reference on that field only. `request.user` in `AdminOrderActionView` is now an `AdminUser` (guaranteed by `IsAdminRole`), so `admin=request.user` stays valid with no code change there. `AdminOrderStatusLogSerializer` (`source="admin.username"`) keeps working.
7. **`users.role`**: keep the column and `Role` choices (no migration churn). In `UserManager`, remove `create_admin`. In `create_superuser`, drop the forced role='admin' default; the default is customer, because superusers only exist for the Django `/admin/` site. Add a docstring on `User.role` saying that real admins live in `admin_users`. Do not rely on `User.is_admin` for authorization anywhere.

## Ordered steps

- [ ] 1. **Model + migration.** Edit `backend/api/models.py`.
      - Add `AdminUserManager` and `AdminUser`, and update the module docstring.
      - Repoint `AdminOrderStatusLog.admin` to `AdminUser`.
      - Remove `create_admin` from `UserManager`, and adjust `create_superuser` as in decision 7.
      - Run `python manage.py makemigrations api -n admin_users` to generate `backend/api/migrations/0005_admin_users.py`. Open it and confirm it contains `CreateModel AdminUser` BEFORE `AlterField adminorderstatuslog.admin`. The tables are empty, so no data migration is needed. Do not hand-edit beyond ordering.
      - Apply: `python manage.py migrate` (MySQL).
      Files: `backend/api/models.py`, `backend/api/migrations/0005_admin_users.py`.
      Verify: `python manage.py makemigrations --check --dry-run` reports no changes. `python manage.py migrate` succeeds. `python manage.py showmigrations api` shows 0005 applied. In MySQL, `SHOW CREATE TABLE admin_users` exists and the FK on `admin_order_status_logs.admin_id` references `admin_users` (query via `manage.py dbshell` or `manage.py shell` with `connection.cursor()`; do not print the password).
      Note: the running :8000 autoreload server will pick up the new code. That is expected.

- [ ] 2. **Auth plumbing.**
      - Create `backend/api/authentication.py` with `AccountJWTAuthentication`, the account-resolver helper shared with refresh, `tokens_for(account)`, `AccountTokenRefreshSerializer`, and `AccountTokenRefreshView`. First read the installed simplejwt serializers/authentication source (see decision 3).
      - Update `backend/api/permissions.py` (decision 4).
      - Update `settings.py` `DEFAULT_AUTHENTICATION_CLASSES`.
      Files: `backend/api/authentication.py` (new), `backend/api/permissions.py`, `backend/pubg_food_truck/settings.py`.
      Verify: `python manage.py check` is clean.

- [ ] 3. **Serializers.** In `backend/api/serializers.py`:
      - Add `AdminUserSerializer` (fields `id, username, email, full_name, phone, role, date_joined`). `role` is a read-only constant `"admin"` and `date_joined` is sourced from `created_at`. No password in the output.
      - Add `AdminCreateAdminSerializer`.
      - Add `AdminLoginSerializer` (`username`, `password` write-only).
      - Change `AdminCreateUserSerializer`'s admin branch to create an `AdminUser` (or split it so `role=admin` uses `AdminCreateAdminSerializer`).
      - Keep `LoginSerializer.expected_role` optional.
      Files: `backend/api/serializers.py`.
      Verify: `python manage.py check` is clean.

- [ ] 4. **Views + URLs.** In `backend/api/views.py`:
      - Replace `_tokens_for` with the shared helper that adds the `user_type` and `role` claims.
      - Add `AdminLoginView`.
      - Restrict `LoginView` to customers (decision 5).
      - Add the role check in `GoogleLoginView`.
      - Update `MeView` and `AdminUserListCreateView`.
      - In `order_views.py`, switch the three customer views to `IsCustomerRole`. Leave the admin views alone.
      - In `urls.py`, add `path("auth/admin-login/", AdminLoginView.as_view(), name="admin_login")`, point `auth/refresh-token/` at `AccountTokenRefreshView`, and update the docstring route list.
      Files: `backend/api/views.py`, `backend/api/order_views.py`, `backend/api/urls.py`.
      Verify: `python manage.py check` is clean. `python manage.py test api --settings=pubg_food_truck.settings_test` may fail until step 7 updates the old tests; that is expected.

- [ ] 5. **Management commands.** Rewrite both against `AdminUser`.
      - `createadmin.py`: keep the args and prompts (`--username --email --full-name --phone`, `getpass` password and confirm). Check username/email uniqueness in `admin_users`. Validate with `validate_password` and create via `AdminUser.objects.create_admin`. Update the docstring and the success message.
      - `changeadmin.py`: list and select from `AdminUser` (drop the `role != admin` branch). Check uniqueness within `admin_users`. Hash via `set_password`.
      Files: `backend/api/management/commands/createadmin.py`, `backend/api/management/commands/changeadmin.py`.
      Verify: covered by the tests in step 7 (`call_command` with `getpass` patched).

- [ ] 6. **Django admin site.** In `backend/api/admin.py`, register `AdminUser` with a `ModelAdmin`. Show `id, username, email, full_name, is_active, last_login, created_at`. The password field must not be a plain text input holding the hash, to avoid the problem the existing header comment describes. Use a creation form with `password1/password2` that calls `set_password`, and make `password` read-only on edit. Remove the "admin" wording that implies `users.role='admin'`. The `AdminOrderStatusLogAdmin` list display keeps working.
      Files: `backend/api/admin.py`.
      Verify: `python manage.py check` is clean.

- [ ] 7. **Backend tests.** Edit `backend/api/tests.py` (read the whole file first; lines 146-300 hold the admin-related tests).
      - Replace every `User.objects.create_admin(...)` setup with `AdminUser.objects.create_admin(...)`.
      - Update the existing assertions: admin login now posts to `reverse("admin_login")`; the old "customer cannot use admin portal" and "admin cannot use customer portal" tests become the cross-rejection tests below; `test_admin_can_create_admin_account` now asserts an `AdminUser` row; `ModelTests.test_create_admin_sets_role_and_staff` becomes an `AdminUser` hashing test.
      - Add new tests:
        - admin login OK with `admin_users` creds (by username and by email), returns `tokens.access`/`refresh` and `user.role == "admin"`;
        - wrong password gives 401, inactive admin gives 403;
        - customer creds at `admin_login` give 401;
        - admin creds at `auth/login/` give 401;
        - a legacy `users` row with `role='admin'` can NOT log in at `admin_login` or `auth/login/`, and its token is rejected by admin endpoints;
        - `AdminUser.password` starts with `pbkdf2_` and is not plaintext;
        - an admin token is accepted on `admin_orders`, `admin_dashboard`, `customer_log`, `status_log`, `users`, and `admin_order_action` (create a customer + order in the test; assert an `AdminOrderStatusLog` row with `admin` set to the AdminUser);
        - a customer token gets 403 on all of those;
        - no token gets 401;
        - ID collision: create an `AdminUser` and a `User` with the same pk and assert each token resolves to its own type (and an admin token cannot reach customer endpoints: `orders/mine/` and `orders/` return 403);
        - customer endpoints still work with a customer token (place an order needs a `MenuItem`, `orders/mine/`, `POST reviews/`, `auth/profile/`);
        - refresh with an admin refresh token returns an access token that still works on admin endpoints and fails on customer endpoints, and refresh with a customer refresh token is the reverse; the decoded `user_type` is preserved (use `AccessToken(...)`);
        - `createadmin` via `call_command` with `--username --email` and `getpass` patched (`unittest.mock.patch("api.management.commands.createadmin.getpass", side_effect=[pw, pw])`) writes a hashed row to `admin_users` and nothing to `users`;
        - `changeadmin` changes email and password, hashed;
        - public register still creates only a customer, and Google login refuses a non-customer `users` row (mock `google.oauth2.id_token.verify_oauth2_token` with `GOOGLE_OAUTH_CLIENT_ID` set, or skip if too invasive and note it).
      Files: `backend/api/tests.py`.
      Verify: `python manage.py test api --settings=pubg_food_truck.settings_test -v 2` shows all tests passing.

- [ ] 8. **Frontend.**
      - `frontend/src/services/api.js`: add `"/auth/admin-login/"` to `PUBLIC_PATHS`; add `export async function adminLogin({ username, password })` that posts `/auth/admin-login/` and calls `persistSession`; make `login()` stop sending `expected_role` (customer only). Add a response interceptor: on a 401 from a non-public path, clear the session (`logout()`) and `window.location.assign("/login")`. This handles stale pre-change admin sessions in localStorage.
      - `frontend/src/pages/Login.js`: import `adminLogin`. In `handleSubmit`, call `adminLogin({ username, password })` when `isAdminPortal`, else `login(...)`. Navigate to `/admin` when `data.user.role === ROLES.ADMIN`, else `/`. Change the admin footer text from "Admin accounts are set up by the owner." to something that says admin accounts are created by the owner (`createadmin`) and cannot be self-registered. Keep all existing validation, UI, and portal switching.
      - `App.js`, `AdminDashboard.js` and `Navbar.js` need no change (they use `user.role` from the persisted user and `logout()`). Open `AdminDashboard.js` to confirm that nothing there calls `listUsers` or relies on `users`-table fields.
      Files: `frontend/src/services/api.js`, `frontend/src/pages/Login.js`.
      Verify: `cmd /c "set PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH% && set CI=false && npm run build"` in `d:/Old Folders/Pubg_-Food-_Truck/frontend` compiles with no new warnings or errors. Then delete `d:/Old Folders/Pubg_-Food-_Truck/frontend/build`. Do not stop the :3000 dev server.

- [ ] 9. **Docs / SQL.**
      - `database/schema.sql`: add an `admin_users` CREATE TABLE section: `id BIGINT AUTO_INCREMENT PK`, `username` unique, `email` unique, `password` (hashed), `full_name`, `phone`, `is_active`, `last_login`, `created_at`, `updated_at`, plus matching indexes. Explain that this is the only table used by the admin login. Note that `users` is customers only (role column kept). Also document `admin_order_status_logs.admin_id` referencing `admin_users`.
      - `database/seed.sql`: grep for `admin`. Update any query or comment that assumes admins live in `users` (for example `UPDATE users SET role='admin'` helpers). Add a note on `createadmin`.
      - `backend/api/urls.py` docstring is done in step 4. Also update the `README.md` if it describes admin creation (grep `createadmin|admin`).
      Files: `database/schema.sql`, `database/seed.sql`, `README.md` (only if relevant).
      Verify: `python manage.py check` is clean and the SQL reads correctly against the migrated table (`SHOW CREATE TABLE admin_users` matches the documented columns).

- [ ] 10. **Full verification.** From the backend dir with the venv python:
      - `python manage.py makemigrations --check --dry-run` is clean.
      - `python manage.py migrate` says "No migrations to apply".
      - `python manage.py check` is clean.
      - `python manage.py test api --settings=pubg_food_truck.settings_test` passes.
      - **Live smoke on port 8001** against MySQL:
        - Start `python manage.py runserver 8001 --noreload` in the background and remember only that process.
        - Create a temp admin via `manage.py shell` (`AdminUser.objects.create_admin("smokeadmin1", "smokeadmin1@example.com", <random temp pw>)`), and register a temp customer through `POST /api/auth/register/` (`smokecust1`).
        - With `Invoke-RestMethod`, check: admin-login OK; the customer cred at admin-login gives 401; the admin cred at `auth/login/` gives 401; the admin token on `admin/dashboard/` gives 200; the customer token on `admin/dashboard/` gives 403; the admin token on `orders/mine/` gives 403; the customer token on `orders/mine/` gives 200; refresh of both token types keeps its type.
        - If you create a menu item/order to test the action endpoint, record the ids.
        - Cleanup removes ONLY the rows you created (by recorded ids/usernames: `admin_order_status_logs`, `customer_order_logs`, `order_items`, `orders`, any smoke `menu_items`, `users.smokecust1`, `admin_users.smokeadmin1`). Confirm all affected tables are back to 0 rows. Stop only the 8001 process; leave :8000 and :3000 running.
      - **Backup**: regenerate `database/backups/pubg_food_truck_backup.sql` AFTER cleanup. Locate `mysqldump.exe` (for example under `C:\Program Files\MySQL\MySQL Server 8.0\bin`). Read the existing backup's header first to reuse its flags (add `--routines --single-transaction` if absent). Pass the password through the `MYSQL_PWD` environment variable read from `.env` in-process; never echo it and never put it on the command line. Confirm the new dump contains `CREATE TABLE \`admin_users\``, contains no `smoke*` rows, and the file is non-empty.
      - Delete any temp files (`frontend/build`, scratch scripts).

## Notes for the final report
- The DB has no admin yet. The user must run `python manage.py createadmin` once to create the first `admin_users` account before admin login works. This is the intended behavior.
- Existing browser sessions (old tokens without `user_type`) are rejected and require a fresh login; the frontend 401 interceptor sends them to `/login`.
- Out of scope: Django `/admin/` site users (still `users` with `is_staff`), and dropping `users.role`.
