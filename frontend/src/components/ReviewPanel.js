import React, { useEffect, useState } from "react";

import { getReviews, createReview } from "../services/api";

/**
 * Shows published reviews for a menu item and lets the signed-in customer
 * add their own rating + comment. `is_published` makes it publishable.
 */
export default function ReviewPanel({ menuItem }) {
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [publish, setPublish] = useState(true);
  const [status, setStatus] = useState("");

  function load() {
    getReviews(menuItem.id)
      .then(setReviews)
      .catch(() => setReviews([]));
  }

  useEffect(load, [menuItem.id]);

  async function submit(e) {
    e.preventDefault();
    setStatus("");
    try {
      await createReview({
        menu_item: menuItem.id,
        rating,
        comment,
        is_published: publish,
      });
      setComment("");
      setRating(5);
      setStatus("Thanks! Your review was saved.");
      load();
    } catch (err) {
      const d = err?.response?.data;
      setStatus(d?.detail || "Could not save the review. Are you logged in?");
    }
  }

  return (
    <div className="review-panel">
      <form className="review-form" onSubmit={submit}>
        <div className="star-picker" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              className={`star ${n <= rating ? "on" : ""}`}
              onClick={() => setRating(n)}
              aria-label={`${n} star`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          className="review-input"
          rows={2}
          placeholder="Share your thoughts (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <label className="review-publish">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
          />
          Publish publicly
        </label>
        <button type="submit" className="review-submit">
          Submit review
        </button>
        {status && <p className="review-status">{status}</p>}
      </form>

      {reviews.length > 0 && (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id} className="review-item">
              <span className="review-stars">{"★".repeat(r.rating)}</span>
              <span className="review-author">{r.customer_name}</span>
              {r.comment && <p className="review-comment">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
