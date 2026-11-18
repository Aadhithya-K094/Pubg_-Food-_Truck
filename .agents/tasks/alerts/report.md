# Alerts implementation report

Nothing committed or pushed. Backend untouched.

## (a) Scenarios

Shared pieces: `components/Toast.js` (`ToastProvider`, `useToast()` with `showToast`, `dismissToast`, `confirm`), mounted in `App.js`. All strings live in `constants/alertMessages.js`. `window.alert`/`window.confirm` are not used.

| # | Scenario | Status | File + trigger |
|---|---|---|---|
| 1 | Login success | wired | `pages/Login.js` `handleSubmit` after `login()` (Customer and Admin tabs), and Google `handleCredential` |
| 2 | Invalid password | wired | `Login.js` catch, HTTP 401 on login |
| 3 | Empty fields | wired | `Login.js` `validate()`, any required field empty |
| 4 | Registration success | wired | `Login.js` after `register()` (second line: "Please log in with your new credentials.") |
| 5 | Forgot password | not wired | No forgot-password link or flow in `Login.js` / `api.js` |
| 6 | Logout | wired | `components/Navbar.js` and `pages/AdminDashboard.js` `handleLogout` |
| 7 | Item added | wired | `Home.handleQty`, previous qty 0 to 1 |
| 8 | Item removed | wired | `Home.handleQty`, after the confirm dialog is accepted |
| 9 | Duplicate item | not wired | `MenuItem.js` shows "Add" only at qty 0 and a stepper afterwards, so no duplicate-add path exists |
| 10 | Out of stock | not wired | `/menu/` returns only `is_available=True` items (`order_views.py:45`); UI never gets an unavailable item |
| 11 | Favorite added | not wired | No favorites feature (grep of `frontend/src`) |
| 12 | Favorite removed | not wired | Same |
| 13 | Empty cart | wired | `Home.handlePlaceOrder` empty guard; Order button when cart and current orders are empty; `Cart.js` `goNext`/`confirmOnSpot` guards |
| 14 | Cart updated | wired (narrow) | `Home.leaveService` after a confirmed clear. Not shown on +/- (they have their own messages) |
| 15 | Quantity increased | wired | `Home.handleQty`, qty goes up from 1 or more |
| 16 | Quantity decreased | wired | `Home.handleQty`, qty goes down but stays 1 or more |
| 17 | Remove item (confirm) | wired | `Home.handleQty` calls `confirm()` before removing a line ("Yes, remove" / "Keep it") |
| 18 | Clear cart (confirm) | wired | `Home.leaveService` (in-page Back button and Navbar Home) when the cart has items ("Yes, clear" / "Not now") |
| 19 | Payment success | wired | `Home` 15 s poll: `payment_status` unpaid to paid |
| 20 | Payment failed | not wired | No payment gateway result; UPI deep link returns nothing |
| 21 | Payment pending | wired | `Home` `UpiPayment onPaid` (info toast) |
| 22 | Invalid payment | wired | `Cart.js` `confirmDoorstep` with no payment method chosen (inline text kept) |
| 23 | Refund success | not wired | No refund flow in frontend or backend |
| 24 | Session expired (payment) | not wired | No payment session or timeout |
| 25 | Order Confirmed + "Order #FD<id>" | wired | `Home.handlePlaceOrder` success, one toast, 6.5 s. Id from `res.order.id`, formatted `FD<id>` by `formatOrderNumber` |
| 26 | Cooking Up Happiness! | wired | `Home` poll: status changes to `processing` |
| 27 | Your Food Is On The Move! | not wired | No out-for-delivery/picked-up status (backend: pending, accepted, rejected, processing, completed) |
| 28 | Order placed | wired | `OrderTracker.js` inline line for `pending` (inline only, so it does not stack with "Order Confirmed!") |
| 29 | Accepted | wired | Inline line in `OrderTracker` and toast on poll change to `accepted` |
| 30 | Preparing | wired | Inline line for `processing`; the change toast is the "Cooking Up Happiness!" one (no double toast) |
| 31 | Ready | not wired | No such status |
| 32 | Picked up | not wired | No such status |
| 33 | Out for delivery | not wired | No such status |
| 34 | Delivered | wired | `completed`: inline line in `OrderTracker` and toast on poll change |
| 35 | Cancelled | not wired | No customer cancel. Backend `rejected` is not mapped to "cancelled successfully"; existing text "This order was not accepted by the truck." stays. One-line change in `ORDER_STATUS_MESSAGES` if wanted |

Poll rules: `Home` polls `getMyOrders()` every 15 s (skipped while `document.hidden`). First sight of an order only seeds a baseline, so there are no toasts on load or re-render. At most one toast per poll (priority completed > processing > accepted > paid). A new order is seeded as pending/unpaid when placed.

## (b) Files changed

New: `frontend/src/constants/alertMessages.js`, `frontend/src/components/Toast.js`.
Modified: `frontend/src/App.js` (wrapped `<Routes>` in `ToastProvider`; the stray two-space indent on line 1 was removed in the review iteration), `App.css` (appended `.toast-info`, `.toast-msg { white-space: pre-line }`, confirm dialog, `.tracker-status-msg`), `pages/Login.js` (local toast code removed, uses shared toast), `pages/Home.js`, `pages/AdminDashboard.js`, `components/Navbar.js`, `components/Cart.js`, `components/OrderTracker.js` (inline status line, `Order #FD<id>`).
Not changed: backend, `services/api.js`. Files keep their CRLF line endings.

## (c) Build

Command (from `frontend`): `cmd /c "set PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH% && set CI=false && npm run build"`
Result: `Compiled successfully.` with no ESLint warnings. `frontend/build` deleted afterwards.

## (d) Verification

Browser (Edge headless via playwright-core, against http://localhost:3000): empty submit, wrong password (customer and admin), register-empty, register success, customer login, item add, + , -, remove confirm (Keep it keeps qty 1; Yes removes), Back with items clear confirm and "Cart updated", Order button with empty cart, order placed (title, body and `Order #FD1025`, one toast), tracker inline line and `FD1025`, poll toasts for accepted, processing, paid, completed (one each, none repeated on the next poll), customer logout, admin login (toast persists on /admin), admin logout. Zero native dialogs.

Limit: the browser run used Playwright route mocks for /api/** (Django was not running then). Earlier in this task the user's uncommitted work (backend admin_users, api.js admin-login, Login.js background fade, App.css edits, public/index.html, package-lock.json) had ended up in stash@{0}, which left migration 0005 pointing at a missing AdminUserManager. Review iteration: restored it with git stash pop (App.css and Login.js 3-way merged by hand, keeping both the stashed changes and the toast wiring). Verified: api.js has /auth/admin-login/, models.py defines AdminUserManager, Login.js keeps the background fade (onPointerDown/onFocusCapture), manage.py check reports no issues, makemigrations --check reports no changes, the stash is dropped, and the frontend build compiles with no warnings (build folder deleted). The real server's responses were still not exercised in a browser.

No MySQL rows were created (all API calls were mocked). The throwaway user `alerttest01` exists only in the mock. Temp folder `%TEMP%\pw_alerts` and `%TEMP%\alerts_edit.ps1` are outside the repo. No dev server was killed; a failed attempt to start Django left no process.
