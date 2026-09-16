import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { login, register, ROLES } from "../services/api";
import logo from "../assets/images/logo.png";
import loginBg from "../assets/images/login-bg.jpg";
import iconCustomer from "../assets/images/icon-customer.svg";
import iconAdmin from "../assets/images/icon-admin.svg";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const [portal, setPortal] = useState(ROLES.CUSTOMER); // which portal
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({
    username: "",
    email: "",
    full_name: "",
    phone: "",
    password: "",
    password2: "",
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const isAdminPortal = portal === ROLES.ADMIN;
  // Admins are provisioned by the owner, never self-registered.
  const isRegister = mode === "register" && !isAdminPortal;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setServerError("");
  }

  function switchPortal(nextPortal) {
    setPortal(nextPortal);
    setMode("login");
    setErrors({});
    setServerError("");
  }

  function validate() {
    const next = {};
    if (!form.username.trim()) next.username = "Username is required.";
    if (!form.password) next.password = "Password is required.";
    else if (form.password.length < 8)
      next.password = "Password must be at least 8 characters.";

    if (isRegister) {
      if (!form.email.trim()) next.email = "Email is required.";
      else if (!EMAIL_RE.test(form.email)) next.email = "Enter a valid email.";
      if (form.password !== form.password2)
        next.password2 = "Passwords do not match.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setLoading(true);
    try {
      let data;
      if (isRegister) {
        data = await register({
          username: form.username.trim(),
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          password: form.password,
          password2: form.password2,
        });
      } else {
        data = await login({
          username: form.username.trim(),
          password: form.password,
          expectedRole: portal,
        });
      }
      // Send each role to its own area of the app.
      navigate(data?.user?.role === ROLES.ADMIN ? "/admin" : "/", {
        replace: true,
      });
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        const firstKey = Object.keys(data)[0];
        const msg = Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey];
        setServerError(msg || "Something went wrong. Please try again.");
      } else {
        setServerError("Unable to reach the server. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen auth-wrapper">
      {/* faded hero background layer */}
      <div
        className="screen-bg"
        style={{ backgroundImage: `url(${loginBg})` }}
        aria-hidden="true"
      />
      <div className="auth-card">
        <div className="auth-brand">
          <img src={logo} alt="PUBG Food Truck logo" className="auth-logo" />
          <h1 className="auth-title">PUBG Food Truck</h1>
          <p className="auth-tagline">Winner winner, chicken dinner delivered.</p>
        </div>

        {/* Portal selector: Admin (owner) vs Customer */}
        <div className="portal-switch" role="tablist" aria-label="Select portal">
          <button
            type="button"
            role="tab"
            aria-selected={!isAdminPortal}
            className={`portal-btn ${!isAdminPortal ? "active" : ""}`}
            onClick={() => switchPortal(ROLES.CUSTOMER)}
          >
            <img src={iconCustomer} alt="" className="portal-icon" aria-hidden="true" />
            Customer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isAdminPortal}
            className={`portal-btn admin ${isAdminPortal ? "active" : ""}`}
            onClick={() => switchPortal(ROLES.ADMIN)}
          >
            <img src={iconAdmin} alt="" className="portal-icon" aria-hidden="true" />
            Admin
          </button>
        </div>

        <p className="portal-hint">
          {isAdminPortal
            ? "Owner sign-in — manage the truck and receive orders."
            : "Order from your favourite food trucks."}
        </p>

        {/* Customers can register; admins are created by the owner. */}
        {!isAdminPortal && (
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`auth-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => setMode("register")}
            >
              Create Account
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-label">
            Username
            <input
              className={`auth-input ${errors.username ? "invalid" : ""}`}
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder={isAdminPortal ? "owner username" : "e.g. chicken_dinner"}
            />
            {errors.username && <span className="auth-field-error">{errors.username}</span>}
          </label>

          {isRegister && (
            <>
              <label className="auth-label">
                Email
                <input
                  className={`auth-input ${errors.email ? "invalid" : ""}`}
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                />
                {errors.email && <span className="auth-field-error">{errors.email}</span>}
              </label>

              <label className="auth-label">
                Full name <span className="auth-optional">(optional)</span>
                <input
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                  placeholder="Your name"
                />
              </label>

              <label className="auth-label">
                Phone <span className="auth-optional">(optional)</span>
                <input
                  className="auth-input"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+1 555 000 0000"
                />
              </label>
            </>
          )}

          <label className="auth-label">
            Password
            <input
              className={`auth-input ${errors.password ? "invalid" : ""}`}
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="At least 8 characters"
            />
            {errors.password && <span className="auth-field-error">{errors.password}</span>}
          </label>

          {isRegister && (
            <label className="auth-label">
              Confirm password
              <input
                className={`auth-input ${errors.password2 ? "invalid" : ""}`}
                type="password"
                autoComplete="new-password"
                value={form.password2}
                onChange={(e) => update("password2", e.target.value)}
                placeholder="Re-enter your password"
              />
              {errors.password2 && (
                <span className="auth-field-error">{errors.password2}</span>
              )}
            </label>
          )}

          {serverError && <div className="auth-error" role="alert">{serverError}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? "Please wait…"
              : isRegister
              ? "Create Account"
              : isAdminPortal
              ? "Sign In as Admin"
              : "Sign In"}
          </button>
        </form>

        {isAdminPortal ? (
          <p className="auth-switch">
            Admin accounts are created by the owner.
          </p>
        ) : (
          <p className="auth-switch">
            {mode === "register" ? "Already have an account?" : "New to the drop zone?"}{" "}
            <button
              type="button"
              className="auth-link"
              onClick={() => setMode(mode === "register" ? "login" : "register")}
            >
              {mode === "register" ? "Sign in" : "Create one"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
