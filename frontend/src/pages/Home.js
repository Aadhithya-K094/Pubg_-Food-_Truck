import React, { useEffect, useMemo, useState } from "react";

import { getCurrentUser, getMenu, placeOrder, getMyOrders } from "../services/api";
import Navbar from "../components/Navbar";
import MenuGrid from "../components/MenuGrid";
import Cart from "../components/Cart";
import OrderTracker, { isCurrentOrder } from "../components/OrderTracker";
import UpiPayment from "../components/UpiPayment";
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

  const [service, setService] = useState(null); // chosen service key
  const [menu, setMenu] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [cart, setCart] = useState({}); // { [menuItemId]: qty }
  const [toast, setToast] = useState(null);
  const [currentOrders, setCurrentOrders] = useState([]); // active orders
  const [upiPay, setUpiPay] = useState(null); // { amount, orderId } when online payment chosen
  const [cartOpen, setCartOpen] = useState(false); // order popup open?

  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

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

  function setQty(itemId, qty) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = qty;
      return next;
    });
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
      showToast("error", "Your cart is empty.");
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
        "Order placed. The truck will accept it shortly."
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
        onHome={() => {
          setService(null);
          setCart({});
        }}
      />

      <UpiPayment
        open={!!upiPay}
        amount={upiPay?.amount}
        orderId={upiPay?.orderId}
        onClose={() => setUpiPay(null)}
        onPaid={() => {
          setUpiPay(null);
          showToast("success", "Thanks! We'll confirm your payment shortly.");
        }}
      />

      {toast && (
        <div className={`toast toast-${toast.type}`} role="alert">
          <span className="toast-icon">{toast.type === "success" ? "✓" : "!"}</span>
          <div className="toast-body">
            <span className="toast-msg">{toast.msg}</span>
          </div>
          <button className="toast-close" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}

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
                  onClick={() => {
                    setService(null);
                    setCart({});
                  }}
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
                <MenuGrid menu={menu} cart={cart} onQty={setQty} />
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
          onClick={() => setCartOpen(true)}
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
              onQty={setQty}
              onPlaceOrder={handlePlaceOrder}
              hasCurrentOrder={currentOrders.length > 0}
            />
          </div>
        </div>
      )}
    </div>
  );
}
