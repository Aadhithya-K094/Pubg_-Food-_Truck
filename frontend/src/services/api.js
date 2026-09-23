// Axios API client for the PUBG Food Truck web app.
// Talks to the Django REST backend and attaches the JWT access token.

import axios from "axios";

const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://127.0.0.1:8000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Public auth endpoints must NOT carry a (possibly stale) Authorization
// header, or the backend's JWT auth rejects the request before the view
// runs ("Given token not valid for any token type").
const PUBLIC_PATHS = [
  "/auth/login/",
  "/auth/register/",
  "/auth/google/",
  "/auth/refresh-token/",
];

// Attach the stored access token to every request EXCEPT public auth calls.
api.interceptors.request.use((config) => {
  const url = config.url || "";
  const isPublic = PUBLIC_PATHS.some((p) => url.includes(p));
  const token = localStorage.getItem("access_token");
  if (token && !isPublic) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // ensure no stale header leaks onto public calls
    if (config.headers) delete config.headers.Authorization;
  }
  return config;
});

// --- Auth API calls ---------------------------------------------------

export const ROLES = { ADMIN: "admin", CUSTOMER: "customer" };

// Public sign-up always creates a customer account (enforced server-side).
// Does NOT log the user in: no session/tokens are stored, so the user
// must enter their credentials manually on the login form afterwards.
export async function register(payload) {
  const { data } = await api.post("/auth/register/", payload);
  return data;
}

// `expectedRole` makes the backend reject a mismatched portal login.
export async function login({ username, password, expectedRole }) {
  const body = { username, password };
  if (expectedRole) body.expected_role = expectedRole;
  const { data } = await api.post("/auth/login/", body);
  persistSession(data);
  return data;
}

// OAuth: exchange a Google ID token (credential) for our own JWT session.
export async function googleLogin(credential) {
  const { data } = await api.post("/auth/google/", { credential });
  persistSession(data);
  return data;
}

export function getRole() {
  return getCurrentUser()?.role || null;
}

export function isAdmin() {
  return getRole() === ROLES.ADMIN;
}

// Admin-only: list users (optionally filtered by role).
export async function listUsers(role) {
  const { data } = await api.get("/users/", {
    params: role ? { role } : undefined,
  });
  return data;
}

// Admin-only: create an admin or customer account.
export async function adminCreateUser(payload) {
  const { data } = await api.post("/users/", payload);
  return data;
}

// ---- Menu ----
export async function getMenu(service) {
  const { data } = await api.get("/menu/", {
    params: service ? { service } : undefined,
  });
  return data;
}

// ---- Orders (customer) ----
export async function placeOrder(payload) {
  const { data } = await api.post("/orders/", payload);
  return data;
}

export async function getMyOrders() {
  const { data } = await api.get("/orders/mine/");
  return data;
}

// ---- Reviews ----
export async function getReviews(menuItemId) {
  const { data } = await api.get("/reviews/", {
    params: menuItemId ? { menu_item: menuItemId } : undefined,
  });
  return data;
}

export async function createReview(payload) {
  const { data } = await api.post("/reviews/", payload);
  return data;
}

// ---- Admin: orders + dashboard + logs ----
export async function getAdminOrders({ service, status } = {}) {
  const params = {};
  if (service) params.service = service;
  if (status) params.status = status;
  const { data } = await api.get("/admin/orders/", { params });
  return data;
}

export async function adminOrderAction(orderId, body) {
  const { data } = await api.post(`/admin/orders/${orderId}/action/`, body);
  return data;
}

export async function getDashboard() {
  const { data } = await api.get("/admin/dashboard/");
  return data;
}

export async function getCustomerLog() {
  const { data } = await api.get("/admin/logs/customer/");
  return data;
}

export async function getStatusLog() {
  const { data } = await api.get("/admin/logs/status/");
  return data;
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}

export function getCurrentUser() {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function persistSession(data) {
  if (data?.tokens) {
    localStorage.setItem("access_token", data.tokens.access);
    localStorage.setItem("refresh_token", data.tokens.refresh);
  }
  if (data?.user) {
    localStorage.setItem("user", JSON.stringify(data.user));
  }
}

export default api;
