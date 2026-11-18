// Central file for every user-facing alert message (toasts and confirmations).
// Wording is exact; do not inline these strings in components.

// ---- 1. Login & registration ----
export const LOGIN_SUCCESS = "Welcome back! Your next delicious meal awaits.";
export const INVALID_PASSWORD = "Oops! That password doesn't taste right. Try again!";
export const EMPTY_FIELDS = "Hungry already? First, fill in your details!";
export const REGISTER_SUCCESS = "Welcome to the food family! Let's get ordering.";
export const LOGOUT = "You've signed out. Come back hungry!";
// Defined, not wired: feature does not exist (no forgot-password flow).
export const FORGOT_PASSWORD = "No worries! Let's get you back to your account.";

// ---- 2. Food selection ----
export const ITEM_ADDED = "Yum! Added to your food basket.";
export const ITEM_REMOVED = "Removed from your plate!";
// Defined, not wired: feature does not exist / cannot occur in the UI.
export const DUPLICATE_ITEM = "Already craving this? Increase the quantity!";
export const OUT_OF_STOCK = "Oh no! This delicious item is currently unavailable.";
export const FAVORITE_ADDED = "A new favorite has joined your food collection!";
export const FAVORITE_REMOVED = "Removed from your favorites.";

// ---- 3. Cart ----
export const EMPTY_CART = "Your cart is hungry! Add something delicious.";
export const CART_UPDATED = "Your food basket is updated!";
export const QTY_INCREASED = "More deliciousness added!";
export const QTY_DECREASED = "Quantity reduced successfully.";
export const REMOVE_ITEM_CONFIRM = "Are you sure you want to remove this dish?";
export const CLEAR_CART_CONFIRM = "Ready for a fresh start? Clear your entire cart?";

// ---- 4. Payment ----
export const PAYMENT_SUCCESS = "Payment successful! Your food journey begins.";
export const PAYMENT_PENDING = "Your payment is being verified. Hang tight!";
export const INVALID_PAYMENT = "Something went wrong with your payment details.";
// Defined, not wired: feature does not exist (no gateway result, refunds or payment session).
export const PAYMENT_FAILED = "Payment didn't go through. Please try again.";
export const REFUND_SUCCESS = "Your refund is on its way!";
export const SESSION_EXPIRED = "Your payment session expired. Please restart.";

// ---- 5. Order confirmation ----
export const ORDER_CONFIRMED = {
  title: "Order Confirmed!",
  body: "Your cravings are officially on their way to becoming reality!",
};
export const ORDER_PREPARING_TOAST = {
  title: "Cooking Up Happiness!",
  body: "Our chef is preparing your delicious meal.",
};
// Defined, not wired: no out-for-delivery / picked-up status exists.
export const FOOD_ON_THE_MOVE = {
  title: "Your Food Is On The Move!",
  body: "Your delivery partner is heading your way.",
};

// ---- 6. Order tracking, keyed by backend order status ----
// Not mapped (no equivalent status): ready ("Your delicious order is ready for pickup!"),
// picked up ("Your food is on its way!"), out for delivery
// ("Get ready! Happiness is almost at your doorstep."), cancelled
// ("Your order has been cancelled successfully."). Backend "rejected" is not "cancelled".
export const ORDER_STATUS_MESSAGES = {
  pending: "Your order is safely in our hands!",
  accepted: "Restaurant accepted your order.",
  processing: "Freshness is being served! Your food is cooking.",
  completed: "Delivered! Time to enjoy every bite.",
};

// Customer-facing order number, e.g. id 1025 -> "FD1025".
export function formatOrderNumber(id) {
  return `FD${id}`;
}
