# Food-themed alerts, shared toast and central messages

Adds a shared `ToastProvider` with a promise-based confirm dialog, a single `constants/alertMessages.js`, and wires the alerts into Login, Navbar, AdminDashboard, Home, Cart and OrderTracker. Scenarios with no existing feature (forgot password, favorites, duplicate, out of stock, refund, payment failed/session, ready/picked up/out for delivery/cancelled) are defined as constants but honestly marked not wired in the report. Frontend only.

Watch for: (1) `Home.handleQty` reads `cart` from its closure after awaiting the confirm dialog, so a stale quantity is possible if the cart changes while the dialog is open (possible, low impact). (2) The order-confirmed toast would read "Order #FDundefined" if the API response had no id (possible, the real response was only exercised through mocks). (3) Build and browser evidence was gathered against mocked `/api/**`, not the real Django server.

**Verdict**: APPROVED

## High-level view

Messages live in one file with the plan's wording. A single toast slot and an in-app confirm dialog sit above the routes in `App.js`, so toasts survive the login/logout navigations. The confirm dialog is used only for Remove item and Clear cart. Login keeps its toast markup and the background fade work.

Order-status toasts come from a 15 s poll in `Home` that seeds a baseline on first sight, toasts only on actual change, and shows at most one toast per poll. The tracker shows the mapped status line inline, so a status change never produces a second toast beside the toast for it.

Unwired scenarios are listed with reasons in the report and match the plan. `rejected` is deliberately not mapped to "Cancelled".

<details>
<summary>Issues (3)</summary>

1. **Stale cart after confirm** (possible) — `handleQty` in `Home.js` uses the `cart` captured before `await confirm(...)`. Use a functional update or re-read the quantity after the await if this matters; non-blocking.
2. **Order number fallback** (possible) — if `res.order.id` and `res.id` are both missing, the toast shows `Order #FDundefined`. Guard the id line; non-blocking.
3. **Real-server verification gap** (confirmed) — browser verification used Playwright route mocks. Do one manual pass against Django when convenient; non-blocking.

</details>

<details>
<summary>Details</summary>

## Checks against the plan

Wording in `alertMessages.js` matches the plan's list character for character, including apostrophes and punctuation. The full set of strings is in this one file, and components import them. No `window.alert` or `window.confirm` exists in `frontend/src`; the only `confirm(` calls are the context function in `Home.js` (lines 176 and 195), for Remove item and Clear cart.

## Double toasts and polling

`handleQty` shows exactly one toast per action: add, increase, decrease, or removal after confirm. "Cart updated" fires only after a confirmed clear. Place order fires one toast, and its inline tracker line is not a toast. In the poll, the first sighting of an order seeds `knownRef` without a toast. A newly placed order is seeded as pending/unpaid. Priority completed > processing > accepted > paid is applied and only one toast fires per poll. Nothing fires on render, and the poll skips while the tab is hidden.

## Existing work preserved

`Login.js` keeps `onPointerDown`/`onFocusCapture` background fade and the unchanged toast markup. `api.js` still has `/auth/admin-login/`, and the backend admin_users files are still modified in the working tree. `git stash list` is empty and HEAD is still `e290071`, so nothing is committed. `frontend/build` does not exist. The only change in `App.js` beyond the provider is cosmetic indentation of the provider's children.

## Evidence

The report records a successful build with no ESLint warnings and a browser run that covers the wired scenarios. The limitation (mocked API) is stated honestly by the coder.

</details>

<details>
<summary>File map</summary>

New: `constants/alertMessages.js`, `components/Toast.js`. Modified: `App.js`, `App.css`, `pages/Login.js`, `pages/Home.js`, `pages/AdminDashboard.js`, `components/Navbar.js`, `components/Cart.js`, `components/OrderTracker.js`. Full diff: `git diff` in the repo.

</details>
