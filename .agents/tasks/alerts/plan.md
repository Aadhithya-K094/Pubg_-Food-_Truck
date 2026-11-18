# Implementation Plan: food-themed alert messages (frontend only)

Repo: `d:\Old Folders\Pubg_-Food-_Truck`, branch master. Frontend: `frontend\` (CRA, react-scripts 5, React 18, react-router 6, no test files exist, no test deps beyond CRA defaults).
Do NOT commit/push. Do NOT revert or reformat the uncommitted changes already in `Login.js`, `api.js`, `App.css` (staged), backend. Edit surgically.
Do not touch backend. Do not kill dev servers (React :3000 hot reload, Django :8000).

## Findings (what exists today)

- Only two toast implementations exist, both duplicate markup using the global `.toast*` CSS in `App.css` (lines ~276-370, z-index 1000):
  - `pages/Login.js`: `toast` state, `toastTimer`, `showToast(type, title, message)` (4500 ms), JSX `.toast.toast-${type}` with `.toast-icon`, `.toast-body > .toast-title + .toast-msg`, `.toast-close`. Types used: `success`, `error`.
  - `pages/Home.js`: `toast` state, `showToast(type, msg)` (3500 ms, no title, no timer cleanup), same markup.
- `AdminDashboard.js` has no toast (inline `error` text only). `ReviewPanel.js` has its own inline status text (leave alone).
- No `window.alert` / `window.confirm` anywhere. No favorites, forgot-password, refund, cancel, clear-cart button, remove button, payment-session timer, or out-for-delivery/picked-up/ready status exist (grep over `frontend\src` found none).
- Modals already use custom dark-glass overlays (`.upi-overlay` z 500, `.cart-popup-overlay` z 360, `.map-modal-overlay` z 500). Toast z 1000 therefore shows above them.
- `src/index.js` renders `<BrowserRouter><App/></BrowserRouter>`; `App.js` returns `<Routes>`. `App.js` is not modified in git, safe to edit.
- Backend order status (`backend\api\models.py` `OrderStatus`): `pending, accepted, rejected, processing, completed`. Admin actions (`order_views.py` `ACTION_TO_STATUS`): accept, reject, processing, complete, plus payment-only update (`payment_status` unpaid -> paid).
- Backend login failure: `views.py:114` returns 401 `{"detail": "Invalid credentials."}` for wrong password AND unknown user (customer and admin-login endpoints). 
- `GET /menu/` only returns `is_available=True` items (`order_views.py:45`); `PlaceOrderSerializer` does not reject unavailable items. So the UI never shows an unavailable item.
- Customer order data in `Home.js` is fetched only on service select and after placing; there is NO polling, so status changes are never observed today.
- Cart "−" at qty 1 calls `onQty(id, 0)` which deletes the line (`Home.setQty`), in both `MenuItem.js` and `Cart.js`. That is the only "remove item" path. `Home` clears the whole cart (`setCart({})`) when the user presses Back or navbar Home while in a service. That is the only "clear cart" path.
- The "Add" button in `MenuItem.js` only renders when qty is 0; it is replaced by a stepper afterwards, so an "Add" on an item already in the cart cannot happen.

## Decisions

1. **Shared toast = `ToastProvider` + `useToast()` in `src/components/Toast.js`**, mounted once in `App.js` around `<Routes>`. Context value (memoized, functions stable via `useCallback` so Login's Google `useEffect` is unaffected): `showToast(type, title, message?, opts?)`, `dismissToast()`, `confirm(opts) -> Promise<boolean>`. Rationale: provider sits above the routes, so a toast fired just before `navigate()` (login success, logout) survives the route change; Login's call sites keep their exact `showToast(type, title, message)` signature.
2. **Single toast slot** (a new toast replaces the current one, same as today). Types: `success`, `error`, new `info`. `opts = { duration }` (default 4500; order-confirmed uses 6500). `title` is the bold line; the alert wording goes in `title` for single-sentence alerts (visually stronger, message line stays optional). `.toast-msg` gets `white-space: pre-line` so a body plus "Order #FD12" can be two lines.
3. **Login.js look is unchanged**: the provider renders the identical markup/classes (`.toast`, `.toast-icon`, `.toast-body`, `.toast-title`, `.toast-msg`, `.toast-close`), `role="alert"`, icon `✓` for success, `!` for error, `i` for info. Existing CSS stays in `App.css`; only additions are made.
4. **Confirmation = small in-app dialog** (provider-rendered `ConfirmDialog`, promise based), not `window.confirm`. Rationale: the app already uses custom glass modals; native confirm looks foreign and cannot carry the food wording nicely. Behavior: `role="alertdialog"`, `aria-modal`, overlay z-index 1100 (above toast 1000), Esc and overlay click cancel, focus on the Cancel button, buttons "Yes, remove"/"Keep it" and "Yes, clear"/"Not now".
5. **All strings in one file** `frontend\src\constants\alertMessages.js` (named exports, exact wording incl. punctuation), plus `formatOrderNumber(id) => \`FD${id}\``.
6. **Order number** shown as `Order #FD<id>` in the order-confirmed toast and in `OrderTracker` (head line and map modal title) so the customer sees one format. Admin dashboard keeps numeric `#id` (internal view, out of scope).
7. **Status alerts** are two things: (a) a persistent inline line in `OrderTracker` showing the mapped tracking message for the order's current status (the "displayed" case); (b) a toast on an actual change, detected by a lightweight 15 s poll in `Home.js` (pauses when `document.hidden`). Never toast on first sight of an order (baseline seeding), never on re-render.
8. **One toast per user action.** Quantity +/- each show only their own message; "Cart updated" is used only after a confirmed whole-cart clear (the only other cart edit that exists).
9. Admin-portal login uses the same "Welcome back!..." toast. Google sign-in success uses it too.
10. `rejected` is NOT mapped to "Cancelled": the backend has no customer cancel; `rejected` means the truck declined the order, and "cancelled successfully" would be misleading. The existing text "This order was not accepted by the truck." stays. (If the owner wants it, it is a one-line change in `ORDER_STATUS_MESSAGES`.)

## Scenario table

| # | Scenario | Status | File + trigger |
|---|---|---|---|
| 1 | Login success | wired | `pages/Login.js` `handleSubmit` after `login()` resolves, before `navigate(...)`; also in Google `handleCredential` after `googleLogin()`. Type success. Customer and Admin tabs. |
| 2 | Invalid password | wired | `pages/Login.js` `handleSubmit` catch: `err.response.status === 401` -> error toast with this text (replaces "Login failed / Invalid credentials."). Other errors keep existing toasts. |
| 3 | Empty fields | wired | `pages/Login.js` `validate()`: if any required field for the current form is empty (login: username or password; register: any of username, email, full name, phone, password, confirm) show this error toast instead of the "Please check your details" summary. Non-empty-but-invalid input keeps the summary toast. Inline field errors unchanged. |
| 4 | Registration success | wired | `pages/Login.js` `handleSubmit` after `register()`: replaces title "Account created" with this text; keep message line "Please log in with your new credentials." |
| 5 | Forgot password | not wired: feature missing | No forgot-password link/flow in `Login.js` or `api.js`. |
| 6 | Logout | wired | `components/Navbar.js` `handleLogout` and `pages/AdminDashboard.js` `handleLogout`: success toast after `logout()`, before `navigate("/login")`. Feature exists but showed no alert. |
| 7 | Item added | wired | `pages/Home.js` new `handleQty` (replaces `setQty` passed to `MenuGrid` and `Cart`): prev qty 0 -> new qty 1 (menu "Add" button). Success. |
| 8 | Item removed | wired | `Home.handleQty`: new qty <= 0, after the user confirms (row 17). Success toast after removal. Triggered from the "−" at qty 1 in `MenuItem.js` or `Cart.js`. |
| 9 | Duplicate item | not wired: cannot occur | `MenuItem.js` shows "Add" only at qty 0 and a stepper after, so there is no duplicate-add path. Re-adding goes through "+" which is "Quantity increased". Adding a button for it would be a new feature. |
| 10 | Out of stock | not wired: no trigger | `/menu/` filters `is_available=True` (`order_views.py:45`) and the order API does not reject unavailable items, so the UI never receives an unavailable item. |
| 11 | Favorite added | not wired: feature missing | No favorites feature. |
| 12 | Favorite removed | not wired: feature missing | Same. |
| 13 | Empty cart | wired | (a) `Home.handlePlaceOrder` when `cartLines.length === 0` (replaces the "Your cart is empty." toast); (b) `Home` floating Order button click when `cartCount === 0` and no current orders (popup still opens); (c) `Cart.js` `goNext`/`confirmOnSpot` empty guards (replace the inline text `setErr` with this toast). Error type. |
| 14 | Cart updated | wired (narrow) | `Home` after a confirmed whole-cart clear (row 18). Not shown on +/- (those have their own messages, avoids double toast). |
| 15 | Quantity increased | wired | `Home.handleQty`: prev >= 1 and new > prev ("+" in `MenuItem.js` or `Cart.js`). Success. |
| 16 | Quantity decreased | wired | `Home.handleQty`: new >= 1 and new < prev. Success. |
| 17 | Remove item (confirm) | wired | `Home.handleQty` calls `await confirm({message: REMOVE_ITEM_CONFIRM, ...})` before removing a line (new qty <= 0). Cancel = no change, no toast. |
| 18 | Clear cart (confirm) | wired | `Home` new `leaveService()` used by the in-page "← Back" button and by `Navbar onHome`: if `cartCount > 0`, `await confirm({message: CLEAR_CART_CONFIRM})`; on yes clear cart, leave service, show "Cart updated" (row 14); on cancel stay. Empty cart leaves silently as today. |
| 19 | Payment success | wired | `Home` poll: an order's `payment_status` goes `unpaid -> paid` (admin presses "Mark Paid", `AdminDashboard.js` `act(..."payment")`). Success toast to the customer. |
| 20 | Payment failed | not wired: no trigger | No payment gateway; UPI deep link (`UpiPayment.js`) returns no result. `placeOrder` failure is an order error, not a payment failure; keep its existing server message. |
| 21 | Payment pending | wired | `Home` `UpiPayment onPaid` ("I've paid"): replaces "Thanks! We'll confirm your payment shortly." Info toast. Accurate because the order stays unpaid until admin marks paid. |
| 22 | Invalid payment | wired | `Cart.js` `confirmDoorstep` when no payment method is chosen: error toast (keep existing inline text too). |
| 23 | Refund success | not wired: feature missing | No refund flow in frontend or backend. |
| 24 | Session expired (payment) | not wired: feature missing | No payment session or timeout. (JWT expiry is not a payment session; do not reuse.) |
| 25 | Order Confirmed + body + "Order #FD<id>" | wired | `Home.handlePlaceOrder` success: one toast, title "Order Confirmed!", message "Your cravings are officially on their way to becoming reality!\nOrder #FD<id>" (id from `res.order.id`, fallback `res.id`), duration 6500. Replaces "Order placed. The truck will accept it shortly." |
| 26 | Cooking Up Happiness! / Our chef is preparing... | wired | `Home` poll: status transition to `processing` (admin "Mark Preparing"). Toast title/body as given, type success. |
| 27 | Your Food Is On The Move! / delivery partner... | not wired: no status | No out-for-delivery/picked-up status; backend goes `accepted -> processing -> completed`. Do not repurpose "On the way" text in the tracker (it is shown at accepted/processing for doorstep, not a status). |
| 28 | Order placed | wired | `OrderTracker.js` inline status line when `order.status === "pending"` (displayed, not toast, to avoid a second toast beside "Order Confirmed!"). |
| 29 | Accepted | wired | Inline line in `OrderTracker` for `accepted` + toast from `Home` poll on change to `accepted`. |
| 30 | Preparing | wired | Inline line "Freshness is being served! Your food is cooking." for `processing`. Change toast is the row 26 one (so no double toast). |
| 31 | Ready | not wired: no status | No ready status (`completed` means delivered/served/collected). |
| 32 | Picked up | not wired: no status | None. |
| 33 | Out for delivery | not wired: no status | None. |
| 34 | Delivered | wired | `completed` -> inline line in `OrderTracker` (current and previous orders) + toast on poll change to `completed`. Used for all service types. |
| 35 | Cancelled | not wired: no equivalent | Backend only has admin `rejected`; no customer cancel. See decision 10. |

Poll toast rules (rows 19, 26, 29, 34): in one poll show at most one toast. Build an events list for orders whose status/payment changed against the baseline; priority `completed` > `processing` > `accepted` > payment success; show the top one (if several orders change in one poll, show the highest-priority one). Updated baseline is stored for all of them, so nothing repeats.

## Steps

- [ ] 1. Create the central messages file.
      Export every string exactly as given (constant names e.g. `LOGIN_SUCCESS`, `INVALID_PASSWORD`, `EMPTY_FIELDS`, `REGISTER_SUCCESS`, `LOGOUT`, `ITEM_ADDED`, `ITEM_REMOVED`, `EMPTY_CART`, `CART_UPDATED`, `QTY_INCREASED`, `QTY_DECREASED`, `REMOVE_ITEM_CONFIRM`, `CLEAR_CART_CONFIRM`, `PAYMENT_SUCCESS`, `PAYMENT_PENDING`, `INVALID_PAYMENT`, `ORDER_CONFIRMED = {title, body}`, `ORDER_PREPARING_TOAST = {title, body}`), including the not-wired ones (`FORGOT_PASSWORD`, `DUPLICATE_ITEM`, `OUT_OF_STOCK`, `FAVORITE_ADDED/REMOVED`, `PAYMENT_FAILED`, `REFUND_SUCCESS`, `SESSION_EXPIRED`, `FOOD_ON_THE_MOVE = {title, body}`) with a comment "defined, not wired: feature does not exist". Add `ORDER_STATUS_MESSAGES = { pending, accepted, processing, completed }` keyed by backend status values (comment the unmapped user statuses: ready, picked up, out for delivery, cancelled), and `formatOrderNumber(id)`.
      Files: `frontend\src\constants\alertMessages.js` (new)
      Verify: build (see Verification) compiles; unused exports are fine for CRA eslint (named exports).

- [ ] 2. Create the shared toast + confirm provider and CSS; wire it into `App.js`.
      `Toast.js`: `ToastProvider({children})` holds `toast` state `{type,title,message}` + timer ref (clear on replace and unmount), `confirmState` `{opts, resolve}`; exports `useToast()` (throws a clear error if used outside the provider). Render the toast with the exact Login markup (icon: ✓ / ! / i; title; message only if present; close button calls `dismissToast`). Render `ConfirmDialog` when `confirmState` is set (Esc, overlay click, autofocus Cancel, resolves true/false). In `App.js` wrap `<Routes>` with `<ToastProvider>`. In `App.css` append (do not reformat existing rules): `.toast-info` (border-left blue `#4aa3ff`) + `.toast-info .toast-icon`, `.toast-msg { white-space: pre-line; }`, `.confirm-overlay` (fixed, inset 0, z-index 1100, dark backdrop, centered), `.confirm-dialog`, `.confirm-message`, `.confirm-actions`, `.confirm-btn`, `.confirm-btn.danger`, `.confirm-btn.ghost` using the same CSS variables as `.toast`/`.upi-modal` (`--glass-border`, `--text-on-glass`, `--pubg-yellow`), plus `.tracker-status-msg` for step 6.
      Files: `frontend\src\components\Toast.js` (new), `frontend\src\App.js`, `frontend\src\App.css`
      Verify: build compiles; open http://localhost:3000/login and confirm the page still renders (the provider mounts).

- [ ] 3. Migrate `Login.js` to the shared toast and wire the auth alerts.
      Remove `toast` state, `toastTimer`, local `showToast`, and the toast JSX block; add `const { showToast, dismissToast } = useToast();` and replace `setToast(null)` (in `switchPortal` and the "Create account / Login here" handler) with `dismissToast()`. Keep the Google effect dependencies unchanged (context fns are stable). Wire: login success (rows 1), invalid password via `err.response?.status === 401` before the generic branch (row 2), empty fields in `validate()` (row 3), registration success title (row 4). Do not touch the `bgVisible` / `screen-bg` code.
      Files: `frontend\src\pages\Login.js`
      Verify: build compiles. Manual at http://localhost:3000/login: submit empty form -> "Hungry already?..." toast with unchanged look; wrong password for Admin Aadhithya094 -> "Oops! That password doesn't taste right. Try again!"; correct admin login -> "Welcome back!..." toast persists on `/admin`.

- [ ] 4. Wire logout alerts.
      `Navbar.js` `handleLogout` and `AdminDashboard.js` `handleLogout`: `showToast("success", LOGOUT)` after `logout()` and before `navigate`. Import `useToast`.
      Files: `frontend\src\components\Navbar.js`, `frontend\src\pages\AdminDashboard.js`
      Verify: build compiles; logging out of admin shows the logout toast on `/login`.

- [ ] 5. Wire food-selection, cart, payment and order-confirmation alerts in `Home.js`, `Cart.js`.
      Home: delete local toast state/markup/`showToast`; use `useToast()`. Add `handleQty(itemId, qty)` (rows 7, 8, 15, 16, 17) replacing `setQty` as the `onQty` prop for `MenuGrid` and `Cart`; compute prev from `cart[itemId] || 0`; for removal `await confirm(...)` first. Add `leaveService()` (rows 18, 14) for the "← Back" button and `Navbar onHome`. `handlePlaceOrder`: empty-cart toast (row 13a), success toast with `ORDER_CONFIRMED` + `formatOrderNumber` (row 25), keep error branch via `showToast("error", msg)`. Order FAB click: empty-cart toast when `cartCount === 0 && currentOrders.length === 0` (row 13b). `UpiPayment onPaid` -> `PAYMENT_PENDING` info (row 21). Cart: `useToast()`; replace the two "Add at least one item" `setErr` calls with the empty-cart toast (row 13c); in `confirmDoorstep` when `!payMethod` keep `setErr` and also toast `INVALID_PAYMENT` (row 22). `Cart.js` still gets its `onQty` prop unchanged.
      Files: `frontend\src\pages\Home.js`, `frontend\src\components\Cart.js`
      Verify: build compiles. With a throwaway customer and a menu item (or by code review if no data): Add -> "Yum!..."; + -> "More deliciousness added!"; − -> "Quantity reduced successfully."; − at 1 -> confirm dialog, Keep it leaves cart, Yes shows "Removed from your plate!"; Back with items -> clear dialog.

- [ ] 6. Add order status alerts: inline status line, order number format, and the poll.
      `OrderTracker.js`: import `ORDER_STATUS_MESSAGES`, `formatOrderNumber`; render `<p className="tracker-status-msg">` under `.tracker-meta` when a message exists for `order.status` (not for `rejected`); change `Order #{order.id}` and the map modal title/aria to `Order #{formatOrderNumber(order.id)}`. `Home.js`: add a `useEffect` that polls `getMyOrders()` every 15 s (skip while `document.hidden`; clear interval on unmount) with `knownRef = useRef(new Map())` baseline (`id -> {status, payment_status}`); first fetch only seeds; orders not yet in the map are seeded without a toast; after `placeOrder` success seed the new order as `pending`/`unpaid`; apply the priority/one-toast rule from the table; on any detected change call `loadCurrentOrders(service)` so trackers refresh. Use `ORDER_PREPARING_TOAST` for `processing`, `ORDER_STATUS_MESSAGES.accepted` / `.completed` for those, `PAYMENT_SUCCESS` for unpaid -> paid.
      Files: `frontend\src\components\OrderTracker.js`, `frontend\src\pages\Home.js`
      Verify: build compiles. Live (optional, needs data): place an order as a throwaway customer, as admin press Accept / Mark Preparing / Mark Completed / Mark Paid, and see exactly one toast per change within ~15 s and no repeats on later polls. Then delete the throwaway rows from MySQL `pubg_food_truck` (table `users` and its orders).

## Files to change

New: `frontend\src\constants\alertMessages.js`, `frontend\src\components\Toast.js`.
Modified: `frontend\src\App.js`, `frontend\src\App.css`, `frontend\src\pages\Login.js`, `frontend\src\pages\Home.js`, `frontend\src\pages\AdminDashboard.js`, `frontend\src\components\Navbar.js`, `frontend\src\components\Cart.js`, `frontend\src\components\OrderTracker.js`.
Not changed: backend, `services\api.js`, `MenuItem.js`, `MenuGrid.js`, `UpiPayment.js`, `ReviewPanel.js`.

## Verification (run after step 6, and after each step if convenient)

1. Build from `d:\Old Folders\Pubg_-Food-_Truck\frontend`:
   `cmd /c "set PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH% && set CI=false && npm run build"`. Expect "Compiled successfully" with no new eslint warnings (check for unused imports and react-hooks/exhaustive-deps on the new poll effect). Then delete `frontend\build`.
2. Wording check by reading `alertMessages.js` against the brief (exact punctuation, apostrophes as `'`).
3. Manual on http://localhost:3000 (hot reload; do not restart servers): login empty/wrong/correct for Admin tab; logout toast; register a throwaway customer (success toast, then delete from `users`); if a menu item can be created via admin/Django admin, run the cart/confirm/order flow, otherwise rely on code inspection for rows 7-18, 25-34 and say so in the report.
4. Confirm only one toast is visible at a time, toast survives the `/login -> /admin` and `/admin -> /login` navigations, and the confirm dialog sits above the cart popup (z 1100 vs 360).
5. `git status` shows only the files listed above as newly touched (plus the pre-existing changes); nothing committed.

## Final report must include

The scenario table above with final wired/not-wired state, the status mapping (pending=Order placed, accepted=Accepted, processing=Preparing, completed=Delivered; no equivalent for Ready, Picked up, Out for delivery, Cancelled/rejected), and which checks were live vs by code inspection.
