import React, { useEffect, useRef, useState } from "react";

import placeholderImg from "../assets/images/menu-item-placeholder.svg";
import ReviewPanel from "./ReviewPanel";

/**
 * A single menu card: image, name, price + discount, quantity stepper.
 *
 * Tapping the card (image or name) reveals a details panel that DROPS DOWN
 * directly beneath the card (anchored to the menu item, not the page), with
 * the description, price, rating and the rate/review panel. Tapping again or
 * clicking elsewhere closes it.
 */
export default function MenuItem({ item, qty, onQty }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const hasDiscount = Number(item.discount_percent) > 0;
  const rootRef = useRef(null);

  // Close on Escape and on click outside the card.
  useEffect(() => {
    if (!detailOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setDetailOpen(false);
    }
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setDetailOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [detailOpen]);

  const priceBlock = (
    <div className="menu-price-row">
      {hasDiscount ? (
        <>
          <span className="menu-price">₹{Number(item.final_price).toFixed(2)}</span>
          <span className="menu-price-old">₹{Number(item.price).toFixed(2)}</span>
        </>
      ) : (
        <span className="menu-price">₹{Number(item.price).toFixed(2)}</span>
      )}
    </div>
  );

  const qtyControl = (
    <div className="menu-qty">
      {qty > 0 ? (
        <div className="qty-stepper">
          <button
            type="button"
            className="qty-btn"
            onClick={() => onQty(item.id, qty - 1)}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="qty-value">{qty}</span>
          <button
            type="button"
            className="qty-btn"
            onClick={() => onQty(item.id, qty + 1)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="menu-add-btn"
          onClick={() => onQty(item.id, 1)}
        >
          Add
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`menu-card ${detailOpen ? "detail-open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="menu-img-wrap menu-img-btn"
        onClick={() => setDetailOpen((v) => !v)}
        aria-expanded={detailOpen}
        aria-label={`View details for ${item.name}`}
      >
        <img
          src={item.image_url || placeholderImg}
          alt={item.name}
          className="menu-img"
          draggable="false"
        />
        {hasDiscount && (
          <span className="menu-discount-badge">{item.discount_percent}% OFF</span>
        )}
      </button>

      <div className="menu-info">
        <button
          type="button"
          className="menu-name menu-name-btn"
          onClick={() => setDetailOpen((v) => !v)}
          aria-expanded={detailOpen}
        >
          {item.name}
        </button>
        {item.description && <p className="menu-desc">{item.description}</p>}

        {priceBlock}

        <div className="menu-rating-row">
          {item.avg_rating ? (
            <span className="menu-rating">★ {item.avg_rating} ({item.review_count})</span>
          ) : (
            <span className="menu-rating muted">No ratings yet</span>
          )}
          <button
            type="button"
            className="menu-review-link"
            onClick={() => setDetailOpen((v) => !v)}
            aria-expanded={detailOpen}
          >
            {detailOpen ? "Hide" : "Details"}
          </button>
        </div>

        {qtyControl}
      </div>

      {/* Details panel drops DOWN directly beneath this menu card. */}
      {detailOpen && (
        <div className="menu-detail-drop" role="region" aria-label={`${item.name} details`}>
          {item.category && (
            <span className="menu-detail-cat">{item.category}</span>
          )}
          {item.description && (
            <p className="menu-detail-desc">{item.description}</p>
          )}

          <div className="menu-detail-priceline">
            {priceBlock}
            {qtyControl}
          </div>

          <div className="menu-detail-rating">
            {item.avg_rating ? (
              <span className="menu-rating">
                ★ {item.avg_rating} ({item.review_count} reviews)
              </span>
            ) : (
              <span className="menu-rating muted">No ratings yet</span>
            )}
            <button
              type="button"
              className="menu-review-link"
              onClick={() => setShowReviews((v) => !v)}
            >
              {showReviews ? "Hide reviews" : "Rate / Review"}
            </button>
          </div>

          {showReviews && <ReviewPanel menuItem={item} />}
        </div>
      )}
    </div>
  );
}
