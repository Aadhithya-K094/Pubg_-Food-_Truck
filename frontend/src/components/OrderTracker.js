import React, { useEffect, useState } from "react";

import { IconPin, IconPhone, IconChat } from "./Icons";

/**
 * Order status + (for doorstep) delivery tracker.
 *
 * Shows the order lifecycle, and for accepted doorstep orders:
 *   - the ETA / tracker time
 *   - a LIVE map (OpenStreetMap embed) centred on the delivery location
 *   - call / message buttons for the delivery person
 */
const STEPS = ["pending", "accepted", "processing", "completed"];

// Build an OpenStreetMap embed URL. Uses exact coordinates when available,
// otherwise searches by the address / pincode so the map still shows a
// relevant location. No API key required.
function buildMapSrc(order) {
  const lat = order.delivery_lat;
  const lng = order.delivery_lng;
  if (lat != null && lng != null) {
    const d = 0.01;
    const bbox = `${Number(lng) - d}%2C${Number(lat) - d}%2C${
      Number(lng) + d
    }%2C${Number(lat) + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  }
  // fall back to searching the address text / pincode
  const q = encodeURIComponent(
    order.delivery_address || order.pincode || "India"
  );
  return `https://www.openstreetmap.org/export/embed.html?bbox=68%2C6%2C98%2C36&layer=mapnik&query=${q}`;
}
const STEP_LABEL = {
  pending: "Placed",
  accepted: "Accepted",
  processing: "Preparing",
  completed: "Delivered",
};

// An order is "current" (still in progress) until it is completed or rejected.
export function isCurrentOrder(order) {
  return !["completed", "rejected"].includes(order.status);
}

export default function OrderTracker({ order, showMap = true }) {
  const isDoorstep = order.service_type === "doorstep";
  const isRejected = order.status === "rejected";
  const currentIdx = STEPS.indexOf(order.status);
  // Live map only for current (in-progress) orders, never previous ones.
  const mapAllowed = showMap && isCurrentOrder(order);
  const [mapExpanded, setMapExpanded] = useState(false);

  // Close the expanded map with the Escape key.
  useEffect(() => {
    if (!mapExpanded) return;
    function onKey(e) {
      if (e.key === "Escape") setMapExpanded(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mapExpanded]);

  const deliveryPerson = order.delivery_person_name || "Delivery partner";
  const deliveryPhone = order.delivery_person_phone || "";

  return (
    <div className="tracker">
      <div className="tracker-head">
        <span className="tracker-id">Order #{order.id}</span>
        <span className={`tracker-status status-${order.status}`}>
          {order.status_display || order.status}
        </span>
      </div>

      <div className="tracker-meta">
        <span>{order.service_type_display || order.service_type}</span>
        <span>₹{Number(order.total_amount).toFixed(2)}</span>
        <span className={`pay-pill ${order.payment_status}`}>
          {order.payment_status === "paid" ? "Paid" : "Unpaid"}
        </span>
      </div>

      {/* progress steps (not for rejected). The coloured fill line grows
          from one step to the next as each stage completes. */}
      {!isRejected ? (
        <div
          className="tracker-steps"
          style={{
            // width of the coloured fill as a % of the 88% connector track
            "--fill":
              STEPS.length > 1
                ? `${(Math.max(0, currentIdx) / (STEPS.length - 1)) * 88}%`
                : "0%",
          }}
        >
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`tracker-step step-${s} ${i <= currentIdx ? "done" : ""} ${
                i === currentIdx ? "current" : ""
              }`}
            >
              <span className="tracker-dot" />
              <span className="tracker-step-label">{STEP_LABEL[s]}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="tracker-rejected">This order was not accepted by the truck.</p>
      )}

      {/* Doorstep tracker: ETA + live map + call/message (current orders only) */}
      {isDoorstep && mapAllowed && (order.status === "accepted" || order.status === "processing") && (
        <div className="tracker-delivery">
          <div className="tracker-eta">
            <span className="tracker-eta-label">Arriving in</span>
            <span className="tracker-eta-time">
              {order.estimated_minutes ? `${order.estimated_minutes} min` : "—"}
            </span>
          </div>

          {/* live tracking map (OpenStreetMap embed) — click to expand */}
          <button
            type="button"
            className="tracker-map"
            onClick={() => setMapExpanded(true)}
            aria-label="Expand live tracking map"
          >
            <iframe
              title={`Live tracking for order ${order.id}`}
              className="tracker-map-frame"
              src={buildMapSrc(order)}
              loading="lazy"
              /* let the button own the click so tapping expands the map */
              style={{ pointerEvents: "none" }}
            />
            <span className="tracker-map-badge">
              <IconPin /> Live tracking
            </span>
            <span className="tracker-map-expand">Tap to expand ⤢</span>
          </button>

          <div className="tracker-person">
            <div className="tracker-person-info">
              <span className="tracker-person-name">{deliveryPerson}</span>
              <span className="tracker-person-role">On the way</span>
            </div>
            <div className="tracker-person-actions">
              <a
                className="tracker-call"
                href={deliveryPhone ? `tel:${deliveryPhone}` : undefined}
                aria-disabled={!deliveryPhone}
              >
                <IconPhone /> Call
              </a>
              <a
                className="tracker-msg"
                href={deliveryPhone ? `sms:${deliveryPhone}` : undefined}
                aria-disabled={!deliveryPhone}
              >
                <IconChat /> Message
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Dining / takeaway: show ready time once accepted */}
      {!isDoorstep && order.status === "accepted" && (
        <p className="tracker-ready">
          {order.estimated_minutes
            ? `Ready in about ${order.estimated_minutes} min.`
            : "Your order has been accepted. Please wait."}
        </p>
      )}

      {/* Expanded full-screen live map */}
      {mapExpanded && (
        <div
          className="map-modal-overlay"
          onClick={() => setMapExpanded(false)}
          role="dialog"
          aria-label={`Live tracking map for order ${order.id}`}
        >
          <div className="map-modal" onClick={(e) => e.stopPropagation()}>
            <div className="map-modal-head">
              <span className="map-modal-title">
                <IconPin /> Live Tracking · Order #{order.id}
              </span>
              <button
                type="button"
                className="map-modal-close"
                onClick={() => setMapExpanded(false)}
                aria-label="Close map"
              >
                ×
              </button>
            </div>
            <iframe
              title={`Expanded live tracking for order ${order.id}`}
              className="map-modal-frame"
              src={buildMapSrc(order)}
              loading="lazy"
            />
            <div className="map-modal-foot">
              {order.delivery_address && (
                <span className="map-modal-addr">
                  <IconPin /> {order.delivery_address}
                </span>
              )}
              <a
                className="map-modal-open"
                href={`https://www.openstreetmap.org/?mlat=${
                  order.delivery_lat || ""
                }&mlon=${order.delivery_lng || ""}#map=16/${
                  order.delivery_lat || 20
                }/${order.delivery_lng || 78}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open full map ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
