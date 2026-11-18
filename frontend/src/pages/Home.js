import React, { useEffect, useMemo, useRef, useState } from "react";

import { getCurrentUser, getMenu, placeOrder, getMyOrders } from "../services/api";
import Navbar from "../components/Navbar";
import MenuGrid from "../components/MenuGrid";
import Cart from "../components/Cart";
import OrderTracker, { isCurrentOrder } from "../components/OrderTracker";
import UpiPayment from "../components/UpiPayment";
import { useToast } from "../components/Toast";
import {
  ITEM_ADDED,
  ITEM_REMOVED,
  EMPTY_CART,
  CART_UPDATED,
  QTY_INCREASED,
  QTY_DECREASED,
  REMOVE_ITEM_CONFIRM,
  CLEAR_CART_CONFIRM,
  PAYMENT_SUCCESS,
  PAYMENT_PENDING,
  ORDER_CONFIRMED,
  ORDER_PREPARING_TOAST,
  ORDER_STATUS_MESSAGES,
  formatOrderNumber,
} from "../constants/alertMessages";
import { IconScooter, IconDining, IconBag } from "../components/Icons";
import logo from "../assets/images/logo.png";
import sideBg from "../assets/images/dashboard-bg.jpg";

// The three ways to order.
const SERVICES = [
  {
    key: "doorstep",
    title: "Doorstep Delivery",
    Icon: IconScooter,
    blurb: "Hot food delivered to your home, with live tracking.",
  },
  {
    key: "dining",
    title: "Dining",
    Icon: IconDining,
    blurb: "Order from your table and we'll bring it over.",
  },
  {
    key: "takeaway",
    title: "Take Away",
    Icon: IconBag,
    blurb: "Order ahead and collect at the counter.",
  },
];

export default function Home() {
  const user = getCurrentUser();
  const { showToast, confirm } = useToast();
  const [service, setService] = useState(null); // chosen service key
  const [menu, setMenu] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [cart, setCart] = useState({}); // { [menuItemId]: qty }
  const [currentOrders, setCurrentOrders] = useState([]); // active orders
  const [upiPay, setUpiPay] = useState(null); // { amount, orderId } when online payment chosen
  const [cartOpen, setCartOpen] = useState(false); // order popup open?

  const serviceRef = useRef(service);
  serviceRef.current = service;
  // Last known { status, payment_status } per order id, to detect real changes.
  const knownRef = useRef(new Map());

  // Load the customer's CURRENT (in-progress) orders for the chosen service.
  function loadCurrentOrders(svc) {
    getMyOrders()
      .then((all) =>
        setCurrentOrders(
          all.filter((o) => isCurrentOrder(o) && (!svc || o.service_type === svc))
        )
      )
      .catch(() => setCurrentOrders([]));
  }

  useEffect(() => {
    if (service) loadCurrentOrders(service);
    else setCurrentOrders([]);
  }, [service]);

  // Load the menu whenever a service is chosen.
  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setLoadingMenu(true);
    setMenuError("");
    getMenu(service)
      .then((items) => {
        if (!cancelled) setMenu(items);
      })
      .catch(() => {
        if (!cancelled) setMenuError("Could not load the menu. Is the server running?");
      })
      .finally(() => {
        if (!cancelled) setLoadingMenu(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service]);

  // Poll the customer's orders and toast ONCE when an order actually changes
  // status (or gets paid). The first sight of an order only seeds the baseline.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.hidden) return;
      let all;
      try {
        all = await getMyOrders();
      } catch (e) {
        return;
      }
      if (cancelled) return;
      const known = knownRef.current;
      let best = null; // highest-priority event: completed > processing > accepted > paid
      let changed = false;
      const rank = { completed: 4, processing: 3, accepted: 2, paid: 1 };
      const consider = (kind) => {
        if (!best || rank[kind] > rank[best]) best = kind;
      };
      all.forEach((o) => {
        const prev = known.get(o.id);
        if (prev) {
          if (prev.status !== o.status) {
            changed = true;
            if (rank[o.status] > 1) consider(o.status);
          }
          if (prev.payment_status !== "paid" && o.payment_status === "paid") {
            changed = true;
            consider("paid");
          }
        }
        known.set(o.id, { status: o.status, payment_status: o.payment_status });
      });
      if (!changed) return;
      if (serviceRef.current) {
        setCurrentOrders(
          all.filter(
            (o) => isCurrentOrder(o) && o.service_type === serviceRef.current
          )
        );
      }
      if (best === "completed") showToast("success", ORDER_STATUS_MESSAGES.completed);
      else if (best === "processing")
        showToast("success", ORDER_PREPARING_TOAST.title, ORDER_PREPARING_TOAST.body);
      else if (best === "accepted") showToast("success", ORDER_STATUS_MESSAGES.accepted);
      else if (best === "paid") showToast("success", PAYMENT_SUCCESS);
    }
    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showToast]);

  function setQty(itemId, qty) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = qty;
      return next;
    });
  }

  // Quantity changes from the menu and the cart, with one alert per action.
  async function handleQty(itemId, qty) {
    const prev = cart[itemId] || 0;
    if (qty <= 0) {
      if (prev === 0) return;
      const ok = await confirm({
        message: REMOVE_ITEM_CONFIRM,
        confirmLabel: "Yes, remove",
        cancelLabel: "Keep it",
      });
      if (!ok) return;
      setQty(itemId, 0);
      showToast("success", ITEM_REMOVED);
      return;
    }
    setQty(itemId, qty);
    if (prev === 0) showToast("success", ITEM_ADDED);
    else if (qty > prev) showToast("success", QTY_INCREASED);
    else if (qty < prev) showToast("success", QTY_DECREASED);
  }

  // Leaving a service empties the cart, so confirm first when it has items.
  async function leaveService() {
    if (cartCount > 0) {
      const ok = await confirm({
        message: CLEAR_CART_CONFIRM,
        confirmLabel: "Yes, clear",
        cancelLabel: "Not now",
      });
      if (!ok) return;
      setService(null);
      setCart({});
      showToast("success", CART_UPDATED);
      return;
    }
    setService(null);
    setCart({});
  }

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const item = menu.find((m) => String(m.id) === String(id));
          return item ? { item, qty } : null;
        })
        .filter(Boolean),
    [cart, menu]
  );

  const cartTotal = useMemo(
    () =>
      cartLines.reduce(
        (sum, { item, qty }) => sum + Number(item.final_price) * qty,
        0
      ),
    [cartLines]
  );

  // Total number of items in the cart (for the floating button badge).
  const cartCount = useMemo(
    () => cartLines.reduce((n, { qty }) => n + qty, 0),
    [cartLines]
  );

  async function handlePlaceOrder(extra) {
    if (cartLines.length === 0) {
      showToast("error", EMPTY_CART);
      return;
    }
    const payload = {
      service_type: service,
      items: cartLines.map(({ item, qty }) => ({
        menu_item: item.id,
        quantity: qty,
      })),
      ...extra,
    };
    try {
      const res = await placeOrder(payload);
      const createdOrder = res?.order || res;
      if (createdOrder?.id != null) {
        knownRef.current.set(createdOrder.id, {
          status: createdOrder.status || "pending",
          payment_status: createdOrder.payment_status || "unpaid",
        });
      }
      setCart({}); // clear the cart so it can't be re-submitted
      setCartOpen(false); // close the order popup after confirmation
      loadCurrentOrders(service); // show it in the Current Order card
      // For an online-payment doorstep order, open the UPI app chooser so
      // the customer can pay via GPay / PhonePe / Paytm / UPI right away.
      if (extra?.payment_method === "online") {
        const created = res?.order || res;
        setUpiPay({
          amount: Number(created?.total_amount ?? cartTotal),
          orderId: created?.id,
        });
      }
      showToast(
        "success",
        ORDER_CONFIRMED.title,
        `${ORDER_CONFIRMED.body}\nOrder #${formatOrderNumber(createdOrder?.id)}`,
        { duration: 6500 }
      );
    } catch (err) {
      const d = err?.response?.data;
      const msg =
        d?.delivery_address?.[0] ||
        d?.detail ||
        "Could not place the order. Please try again.";
      showToast("error", msg);
    }
  }

  const activeService = SERVICES.find((s) => s.key === service);

  return (
    <div className="cust-wrapper">
      <div className="app-bg" style={{ backgroundImage: `url(${sideBg})` }} aria-hidden="true" />
      <Navbar
        user={user}
        onHome={leaveService}
      />

      <UpiPayment
        open={!!upiPay}
        amount={upiPay?.amount}
        orderId={upiPay?.orderId}
        onClose={() => setUpiPay(null)}
        onPaid={() => {
          setUpiPay(null);
          showToast("info", PAYMENT_PENDING);
        }}
      />


      <main className="cust-main">
        {!service ? (
          <>
            <header className="cust-hero">
              <img src={logo} alt="PUBG Food Truck" className="cust-hero-logo" />
              <h1 className="cust-hero-title">
                Welcome{user?.full_name ? `, ${user.full_name}` : ""}!
              </h1>
              <p className="cust-hero-sub">How would you like to order today?</p>
            </header>

            <section className="service-grid">
              {SERVICES.map((s) => (
                <button
                  key={s.key}
                  className="service-card"
                  onClick={() => setService(s.key)}
                >
                  <span className="service-icon">
                    <s.Icon />
                  </span>
                  <span className="service-title">{s.title}</span>
                  <span className="service-blurb">{s.blurb}</span>
                </button>
              ))}
            </section>
          </>
        ) : (
          <div className="order-layout">
            <div className="order-menu-col">
              <div className="order-head">
                <button
                  className="back-btn"
                  onClick={leaveService}
                >
                  ← Back
                </button>
                <div>
                  <span className="order-badge">
                    <activeService.Icon /> {activeService.title}
                  </span>
                  <p className="order-head-sub">{activeService.blurb}</p>
                </div>
              </div>

              {/* "Your order" summary bar — appears at the top ONLY once the
                  customer has selected some food. Tapping it opens the popup. */}
              {cartLines.length > 0 && (
                <button
                  type="button"
                  className="your-order-bar"
                  onClick={() => setCartOpen(true)}
                >
                  <span className="your-order-bar-left">
                    <IconBag className="your-order-bar-icon" />
                    <span className="your-order-bar-title">Your order</span>
                    <span className="your-order-bar-count">
                      {cartCount} item{cartCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="your-order-bar-right">
                    <span className="your-order-bar-total">
                      ₹{cartTotal.toFixed(2)}
                    </span>
                    <span className="your-order-bar-view">View →</span>
                  </span>
                </button>
              )}

              {/* Current Order card for this service (live map for doorstep).
                  Only in-progress orders show here; previous ones do not. */}
              {currentOrders.length > 0 && (
                <section className="current-order-block">
                  <h2 className="current-order-heading">
                    Current {activeService.title} Order
                  </h2>
                  {currentOrders.map((o) => (
                    <OrderTracker key={o.id} order={o} showMap />
                  ))}
                </section>
              )}

              {loadingMenu && <p className="cust-muted">Loading menu…</p>}
              {menuError && <p className="cust-error">{menuError}</p>}
              {!loadingMenu && !menuError && (
                <MenuGrid menu={menu} cart={cart} onQty={handleQty} />
              )}
            </div>

          </div>
        )}
      </main>

      {/* Floating circular ORDER button (bottom-right). Only shown while a
          service is selected. It carries a badge with the item count and
          opens the order/cart popup. */}
      {service && (
        <button
          type="button"
          className={`order-fab ${currentOrders.length > 0 ? "has-order" : ""}`}
          onClick={() => {
            if (cartCount === 0 && currentOrders.length === 0) {
              showToast("error", EMPTY_CART);
            }
            setCartOpen(true);
          }}
          aria-label={
            cartCount > 0
              ? `Open your order (${cartCount} item${cartCount === 1 ? "" : "s"})`
              : currentOrders.length > 0
              ? "View your placed order"
              : "Open your order"
          }
        >
          <IconBag className="order-fab-icon" />
          <span className="order-fab-text">Order</span>
          {cartCount > 0 ? (
            <span className="order-fab-badge">{cartCount}</span>
          ) : (
            currentOrders.length > 0 && (
              <span className="order-fab-badge order-fab-dot" aria-hidden="true">
                ●
              </span>
            )
          )}
        </button>
      )}

      {/* Order popup: shows the placed/current order status (after the order
          is confirmed) AND the cart for placing a new order. */}
      {service && cartOpen && (
        <div className="cart-popup-overlay" onClick={() => setCartOpen(false)}>
          <div
            className="cart-popup"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Your order"
          >
            <button
              type="button"
              className="cart-popup-close"
              onClick={() => setCartOpen(false)}
              aria-label="Close"
            >
              ×
            </button>

            {/* Once an order is confirmed it appears here with its live
                status, so tapping the button shows the placed order. */}
            {currentOrders.length > 0 && (
              <section className="popup-current-order">
                <h3 className="popup-current-heading">Your Order</h3>
                {currentOrders.map((o) => (
                  <OrderTracker key={o.id} order={o} showMap />
                ))}
              </section>
            )}

            {/* Cart / checkout for adding a new order. When there's a current
                order but nothing new selected, this shows its empty state. */}
            <Cart
              service={service}
              lines={cartLines}
              total={cartTotal}
              onQty={handleQty}
              onPlaceOrder={handlePlaceOrder}
              hasCurrentOrder={currentOrders.length > 0}
            />
          </div>
        </div>
      )}
    </div>
  );
}
