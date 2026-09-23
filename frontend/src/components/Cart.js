import React, { useState } from "react";

import { IconScooter, IconBag, IconPin } from "./Icons";

/**
 * Checkout panel with a multi-step flow.
 *
 *  Doorstep delivery  -> 3 steps:
 *      1. Menu & quantity  (cart review)
 *      2. Delivery address
 *      3. Payment          (Online payment / Cash on delivery)
 *
 *  Dining / Take away -> 1 step:
 *      A single confirmation page. These two service types are
 *      always paid ON THE SPOT (no online / COD choice).
 */
export default function Cart({
  service,
  lines,
  total,
  onQty,
  onPlaceOrder,
  hasCurrentOrder = false,
}) {
  const isDoorstep = service === "doorstep";
  const isDining = service === "dining";

  // Step index. Doorstep uses 0->1->2; others just use 0 (confirmation).
  const [step, setStep] = useState(0);

  const [addr, setAddr] = useState({
    building_no: "",
    street: "",
    pincode: "",
    landmark: "",
  });
  const [table, setTable] = useState("");
  const [payMethod, setPayMethod] = useState(""); // "online" | "cod"
  const [err, setErr] = useState("");

  function setField(k, v) {
    setAddr((a) => ({ ...a, [k]: v }));
    setErr("");
  }

  const hasItems = lines.length > 0;

  function addressValid() {
    if (!addr.building_no.trim() || !addr.street.trim() || !addr.pincode.trim()) {
      setErr("Building/home no, street and pincode are required.");
      return false;
    }
    if (!/^\d{6}$/.test(addr.pincode.trim())) {
      setErr("Enter a valid 6-digit pincode.");
      return false;
    }
    return true;
  }

  function goNext() {
    setErr("");
    if (step === 0) {
      if (!hasItems) {
        setErr("Add at least one item to continue.");
        return;
      }
      setStep(1);
    } else if (step === 1) {
      if (addressValid()) setStep(2);
    }
  }

  function goBack() {
    setErr("");
    setStep((s) => Math.max(0, s - 1));
  }

  function confirmDoorstep() {
    if (!payMethod) {
      setErr("Please choose a payment method.");
      return;
    }
    onPlaceOrder({
      building_no: addr.building_no.trim(),
      street: addr.street.trim(),
      pincode: addr.pincode.trim(),
      landmark: addr.landmark.trim(),
      payment_method: payMethod,
    });
    resetFlow();
  }

  function confirmOnSpot() {
    if (!hasItems) {
      setErr("Add at least one item to continue.");
      return;
    }
    const extra = { payment_method: "on_spot" };
    if (isDining) extra.table_number = table.trim();
    onPlaceOrder(extra);
    resetFlow();
  }

  function resetFlow() {
    setStep(0);
    setAddr({ building_no: "", street: "", pincode: "", landmark: "" });
    setTable("");
    setPayMethod("");
    setErr("");
  }

  // ---- shared cart line list ----
  const cartList = (
    <ul className="cart-list">
      {lines.map(({ item, qty }) => (
        <li key={item.id} className="cart-line">
          <div className="cart-line-info">
            <span className="cart-line-name">{item.name}</span>
            <span className="cart-line-price">
              ₹{Number(item.final_price).toFixed(2)} × {qty}
            </span>
          </div>
          <div className="cart-line-right">
            <div className="qty-stepper small">
              <button className="qty-btn" onClick={() => onQty(item.id, qty - 1)}>
                −
              </button>
              <span className="qty-value">{qty}</span>
              <button className="qty-btn" onClick={() => onQty(item.id, qty + 1)}>
                +
              </button>
            </div>
            <span className="cart-line-total">
              ₹{(Number(item.final_price) * qty).toFixed(2)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );

  const totalRow = (
    <div className="cart-total-row">
      <span>Total</span>
      <span className="cart-total">₹{total.toFixed(2)}</span>
    </div>
  );

  // =========================================================
  // DINING / TAKE AWAY : single confirmation page (on-spot pay)
  // =========================================================
  if (!isDoorstep) {
    return (
      <div className="cart">
        <h2 className="cart-title">
          {hasCurrentOrder && !hasItems
            ? "Add another order?"
            : isDining
            ? "Confirm Dining Order"
            : "Confirm Takeaway Order"}
        </h2>

        {!hasItems ? (
          <p className="cart-empty cust-muted">
            {hasCurrentOrder
              ? "Want more? Tap “Add” on a dish to place another order."
              : "No items yet. Tap “Add” on a dish to start."}
          </p>
        ) : (
          <>
            {cartList}

            {isDining && (
              <div className="cart-field">
                <label className="cart-label">Table number (optional)</label>
                <input
                  className="cart-input"
                  placeholder="e.g. 12"
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                />
              </div>
            )}

            {totalRow}

            <div className="pay-onspot-note">
              <span className="pay-onspot-icon"><IconBag /></span>
              <div>
                <strong>Pay on the spot</strong>
                <p className="cust-muted">
                  {isDining
                    ? "Pay at your table or the counter when your order is served."
                    : "Pay at the counter when you collect your order."}
                </p>
              </div>
            </div>
          </>
        )}

        {err && <p className="cart-addr-err">{err}</p>}

        <button
          className="cart-place-btn"
          disabled={!hasItems}
          onClick={confirmOnSpot}
        >
          {isDining ? "Confirm Dining Order" : "Confirm Takeaway Order"}
        </button>

        <p className="cart-note cust-muted">
          The truck will accept your order before it's prepared.
        </p>
      </div>
    );
  }

  // =========================================================
  // DOORSTEP : 3-step checkout
  // =========================================================
  const stepTitles = ["Your Order", "Delivery Address", "Payment"];

  return (
    <div className="cart">
      {/* step indicator */}
      <div className="checkout-steps" aria-hidden="true">
        {stepTitles.map((t, i) => (
          <div
            key={t}
            className={`checkout-step ${i === step ? "active" : ""} ${
              i < step ? "done" : ""
            }`}
          >
            <span className="checkout-step-num">{i + 1}</span>
            <span className="checkout-step-label">{t}</span>
          </div>
        ))}
      </div>

      <h2 className="cart-title">{stepTitles[step]}</h2>

      {/* ---- STEP 1: menu & quantity ---- */}
      {step === 0 && (
        <>
          {!hasItems ? (
            <p className="cart-empty cust-muted">
              {hasCurrentOrder
                ? "Want more? Tap “Add” on a dish to place another order."
                : "No items yet. Tap “Add” on a dish to start."}
            </p>
          ) : (
            <>
              {cartList}
              {totalRow}
            </>
          )}
          {err && <p className="cart-addr-err">{err}</p>}
          <button
            className="cart-place-btn"
            disabled={!hasItems}
            onClick={goNext}
          >
            Continue to Address
          </button>
        </>
      )}

      {/* ---- STEP 2: address ---- */}
      {step === 1 && (
        <>
          <div className="cart-address">
            <label className="cart-label">Delivery address</label>
            <input
              className="cart-input"
              placeholder="Building / home number"
              value={addr.building_no}
              onChange={(e) => setField("building_no", e.target.value)}
            />
            <input
              className="cart-input"
              placeholder="Street name"
              value={addr.street}
              onChange={(e) => setField("street", e.target.value)}
            />
            <div className="cart-address-row">
              <input
                className="cart-input"
                placeholder="Pincode"
                inputMode="numeric"
                maxLength={6}
                value={addr.pincode}
                onChange={(e) =>
                  setField("pincode", e.target.value.replace(/[^0-9]/g, ""))
                }
              />
              <input
                className="cart-input"
                placeholder="Landmark (optional)"
                value={addr.landmark}
                onChange={(e) => setField("landmark", e.target.value)}
              />
            </div>
          </div>
          {err && <p className="cart-addr-err">{err}</p>}
          <div className="checkout-nav">
            <button className="cart-back-btn" onClick={goBack}>
              ← Back
            </button>
            <button className="cart-place-btn grow" onClick={goNext}>
              Continue to Payment
            </button>
          </div>
        </>
      )}

      {/* ---- STEP 3: payment ---- */}
      {step === 2 && (
        <>
          {totalRow}
          <label className="cart-label">Choose a payment method</label>
          <div className="pay-methods">
            <button
              type="button"
              className={`pay-method ${payMethod === "online" ? "selected" : ""}`}
              onClick={() => {
                setPayMethod("online");
                setErr("");
              }}
            >
              <span className="pay-method-icon"><IconPin /></span>
              <span className="pay-method-body">
                <span className="pay-method-title">Online Payment</span>
                <span className="pay-method-sub">Pay now, securely online</span>
              </span>
              <span className="pay-method-radio" />
            </button>

            <button
              type="button"
              className={`pay-method ${payMethod === "cod" ? "selected" : ""}`}
              onClick={() => {
                setPayMethod("cod");
                setErr("");
              }}
            >
              <span className="pay-method-icon"><IconScooter /></span>
              <span className="pay-method-body">
                <span className="pay-method-title">Cash on Delivery</span>
                <span className="pay-method-sub">Pay the rider when it arrives</span>
              </span>
              <span className="pay-method-radio" />
            </button>
          </div>
          {err && <p className="cart-addr-err">{err}</p>}
          <div className="checkout-nav">
            <button className="cart-back-btn" onClick={goBack}>
              ← Back
            </button>
            <button className="cart-place-btn grow" onClick={confirmDoorstep}>
              Place Delivery Order
            </button>
          </div>
        </>
      )}

      <p className="cart-note cust-muted">
        The truck will accept your order before it's prepared.
      </p>
    </div>
  );
}
