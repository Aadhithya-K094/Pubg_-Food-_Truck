import React, { useEffect } from "react";

/**
 * UPI payment chooser.
 *
 * When the customer picks Online Payment, this modal lets them pay with a
 * UPI app (Google Pay / PhonePe / Paytm / any UPI app). Tapping an option
 * builds a UPI deep link and opens it, which launches the chosen app on a
 * phone. On desktop (no UPI app) the link simply won't resolve, so we also
 * show the payee UPI id / amount for manual payment.
 *
 * NOTE: the payee VPA below is a placeholder — replace `PAYEE_VPA` /
 * `PAYEE_NAME` with the food truck's real UPI id when available.
 */
const PAYEE_VPA = "pubgfoodtruck@upi";
const PAYEE_NAME = "PUBG Food Truck";

const APPS = [
  // `scheme` is the app-specific intent; falls back to generic upi:// .
  { key: "gpay", label: "Google Pay", scheme: "tez://upi/pay", hint: "GPay" },
  { key: "phonepe", label: "PhonePe", scheme: "phonepe://pay", hint: "PhonePe" },
  { key: "paytm", label: "Paytm", scheme: "paytmmp://pay", hint: "Paytm" },
  { key: "upi", label: "Any UPI App", scheme: "upi://pay", hint: "BHIM / UPI" },
];

function buildUpiUrl(scheme, { amount, orderId }) {
  const params = new URLSearchParams({
    pa: PAYEE_VPA,
    pn: PAYEE_NAME,
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
    tn: `Order ${orderId ?? ""}`.trim(),
  });
  return `${scheme}?${params.toString()}`;
}

export default function UpiPayment({ open, amount, orderId, onClose, onPaid }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function pay(app) {
    const url = buildUpiUrl(app.scheme, { amount, orderId });
    // Launch the UPI app. On a phone this opens the chosen app; on desktop
    // it's a no-op, which is why we also expose the VPA for manual payment.
    window.location.href = url;
  }

  return (
    <div className="upi-overlay" role="dialog" aria-label="Pay with UPI" onClick={onClose}>
      <div className="upi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upi-head">
          <h2>Pay with UPI</h2>
          <button className="upi-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="upi-amount">
          <span className="upi-amount-label">Amount payable</span>
          <span className="upi-amount-value">₹{Number(amount || 0).toFixed(2)}</span>
        </div>

        <p className="upi-choose">Choose your UPI app</p>
        <div className="upi-apps">
          {APPS.map((app) => (
            <button
              key={app.key}
              type="button"
              className={`upi-app upi-app-${app.key}`}
              onClick={() => pay(app)}
            >
              <span className="upi-app-badge">{app.hint}</span>
              <span className="upi-app-label">{app.label}</span>
            </button>
          ))}
        </div>

        <div className="upi-manual">
          <span className="cust-muted">Or pay manually to</span>
          <span className="upi-vpa">{PAYEE_VPA}</span>
        </div>

        <div className="upi-actions">
          <button type="button" className="upi-done" onClick={onPaid}>
            I've paid
          </button>
          <button type="button" className="upi-later" onClick={onClose}>
            Pay later
          </button>
        </div>
      </div>
    </div>
  );
}
