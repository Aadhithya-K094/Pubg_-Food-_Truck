// Axios API client for the PUBG Food Truck web app.
// Talks to the Django REST backend and attaches the JWT access token.

import axios from "axios";

const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://127.0.0.1:8000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach the stored access token to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
