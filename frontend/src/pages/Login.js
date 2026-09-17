import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { login, register, ROLES } from "../services/api";
import logo from "../assets/images/logo.png";
import loginBg from "../assets/images/login-bg.jpg";

// Email must look like example000@gmail.com style addresses.
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9._]{3,20}$/;
const PHONE_RE = /^[0-9]{10}$/;

// --- inline professional icons (inherit text colour) -----------------
function CustomerIcon() {
  return (
    <svg className="portal-icon" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="24" cy="19" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M11.5 38a12.5 12.5 0 0 1 25 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg className="portal-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 4l15 5v11c0 9.4-6.2 17.6-15 20-8.8-2.4-15-10.6-15-20V9z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M17 24l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ off }) {
  return off ? (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 4.5 10 6a15 15 0 0 1-2.9 3.3M6.5 7.6C4.3 8.9 2.6 10.9 2 12c1 1.5 5 6 10 6a9.6 9.6 0 0 0 3.4-.6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [portal, setPortal] = useState(ROLES.CUSTOMER);
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
  const [toast, setToast] = useState(null); // { type, title, message }
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const formRef = useRef(null);
  const toastTimer = useRef(null);

  // Side-popup toast helper. Auto-dismisses after a few seconds.
  function showToast(type, title, message) {
    setToast({ type, title, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }

  // Prevent the browser from leaving saved/autofilled credentials in the
  // fields when the page is freshly opened. Autofill can fire a moment
  // after mount, so we clear the DOM inputs on mount and again shortly
  // after, and keep React state empty.
  useEffect(() => {
    const clear = () => {
      setForm({
        username: "",
        email: "",
        full_name: "",
        phone: "",
        password: "",
        password2: "",
      });
      if (formRef.current) {
        formRef.current
          .querySelectorAll("input")
          .forEach((el) => {
            el.value = "";
          });
      }
    };
    clear();
    const t1 = setTimeout(clear, 60);
    const t2 = setTimeout(clear, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const isAdminPortal = portal === ROLES.ADMIN;
  // Only customers may create an account; admins are provisioned by the owner.
  const isRegister = mode === "register" && !isAdminPortal;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function switchPortal(nextPortal) {
    setPortal(nextPortal);
    setMode("login");
    setErrors({});
    setToast(null);
  }

  // Full validation covering every negative scenario. All fields mandatory.
  function validate() {
    const next = {};
    const u = form.username.trim();
    const em = form.email.trim();
    const fn = form.full_name.trim();
    const ph = form.phone.trim();

    // Username (required on every form)
    if (!u) next.username = "Username is required.";
    else if (u.length < 3) next.username = "Username must be at least 3 characters.";
    else if (u.length > 20) next.username = "Username must be 20 characters or fewer.";
    else if (!USERNAME_RE.test(u))
      next.username = "Use only letters, numbers, dot or underscore.";

    // Password (required on every form)
    if (!form.password) next.password = "Password is required.";
    else if (form.password.length < 8)
      next.password = "Password must be at least 8 characters.";
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      next.password = "Password must include at least one letter and one number.";

    if (isRegister) {
      // Email (mandatory, gmail-style format)
      if (!em) next.email = "Email is required.";
      else if (!EMAIL_RE.test(em))
        next.email = "Enter a valid email like example000@gmail.com.";

      // Full name (now mandatory)
      if (!fn) next.full_name = "Full name is required.";
      else if (fn.length < 2) next.full_name = "Enter your full name.";

      // Phone (now mandatory, 10 digits)
      if (!ph) next.phone = "Mobile number is required.";
      else if (!PHONE_RE.test(ph))
        next.phone = "Enter a valid 10-digit mobile number.";

      // Confirm password (mandatory + must match)
      if (!form.password2) next.password2 = "Please confirm your password.";
      else if (form.password !== form.password2)
        next.password2 = "Passwords do not match.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Summarise which fields need attention in the side popup.
      const labels = {
        username: "Username",
        email: "Email",
        full_name: "Full name",
        phone: "Mobile number",
        password: "Password",
        password2: "Confirm password",
      };
      const fields = Object.keys(next).map((k) => labels[k] || k);
      showToast(
        "error",
        "Please check your details",
        `${fields.join(", ")} — ${fields.length === 1 ? "needs" : "need"} attention.`
      );
      return false;
    }
    return true;
  }

  function clearAllFields() {
    setForm({
      username: "",
      email: "",
      full_name: "",
      phone: "",
      password: "",
      password2: "",
    });
    if (formRef.current) {
      formRef.current.querySelectorAll("input").forEach((el) => {
        el.value = "";
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      if (isRegister) {
        await register({
          username: form.username.trim(),
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          password: form.password,
          password2: form.password2,
        });
        // Account made but NOT logged in. Clear everything and send the
        // user to the login form to enter their own credentials.
        clearAllFields();
        setErrors({});
        setMode("login");
        showToast(
          "success",
          "Account created",
          "Please log in with your new credentials."
        );
      } else {
        const data = await login({
          username: form.username.trim(),
          password: form.password,
          expectedRole: portal,
        });
        navigate(data?.user?.role === ROLES.ADMIN ? "/admin" : "/", { replace: true });
      }
    } catch (err) {
      const d = err?.response?.data;
      if (d && typeof d === "object") {
        const mapped = {};
        for (const k of ["username", "email", "full_name", "phone", "password"]) {
          if (d[k]) mapped[k] = Array.isArray(d[k]) ? d[k][0] : d[k];
        }
        if (Object.keys(mapped).length) setErrors((e2) => ({ ...e2, ...mapped }));
        const detail = d.detail || Object.values(mapped)[0];
        showToast("error", "Login failed", detail || "Something went wrong. Please try again.");
      } else {
        showToast("error", "Connection error", "Unable to reach the server. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen auth-wrapper">
      <div
        className="screen-bg"
        style={{ backgroundImage: `url(${loginBg})` }}
        aria-hidden="true"
      />

      {/* Side-popup toast for alerts */}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="alert">
          <span className="toast-icon" aria-hidden="true">
            {toast.type === "success" ? "✓" : "!"}
          </span>
          <div className="toast-body">
            <strong className="toast-title">{toast.title}</strong>
            <span className="toast-msg">{toast.message}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo-ring">
            <img
              src={logo}
              alt="PUBG Food Truck"
              className="auth-logo"
              draggable="false"
            />
          </span>
          <p className="auth-tagline">From Our Kitchen to Your Doorstep</p>
        </div>

        {/* Portal selector */}
        <div className="portal-switch" role="tablist" aria-label="Select portal">
          <button
            type="button"
            role="tab"
            aria-selected={!isAdminPortal}
            className={`portal-btn ${!isAdminPortal ? "active" : ""}`}
            onClick={() => switchPortal(ROLES.CUSTOMER)}
          >
            <CustomerIcon />
            <span>Customer</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isAdminPortal}
            className={`portal-btn admin ${isAdminPortal ? "active" : ""}`}
            onClick={() => switchPortal(ROLES.ADMIN)}
          >
            <AdminIcon />
            <span>Admin</span>
          </button>
        </div>

        <h2 className="auth-heading">
          {isRegister ? "Create your account" : isAdminPortal ? "Admin login" : "Sign in to continue"}
        </h2>



        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
          autoComplete="off"
          ref={formRef}
        >
          <div className="auth-field">
            <label className="auth-label" htmlFor="f-username">
              Username <span className="req">*</span>
            </label>
            <input
              id="f-username"
              name="pft-username"
              className={`auth-input ${errors.username ? "invalid" : ""}`}
              type="text"
              autoComplete="off"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="Enter your username"
              aria-invalid={!!errors.username}
            />
            {errors.username && <span className="auth-field-error">{errors.username}</span>}
          </div>

          {isRegister && (
            <>
              <div className="auth-field">
                <label className="auth-label" htmlFor="f-email">
                  Email address <span className="req">*</span>
                </label>
                <input
                  id="f-email"
                  name="pft-email"
                  className={`auth-input ${errors.email ? "invalid" : ""}`}
                  type="email"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="example000@gmail.com"
                  aria-invalid={!!errors.email}
                />
                {errors.email && <span className="auth-field-error">{errors.email}</span>}
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="f-name">
                  Full name <span className="req">*</span>
                </label>
                <input
                  id="f-name"
                  name="pft-name"
                  className={`auth-input ${errors.full_name ? "invalid" : ""}`}
                  type="text"
                  autoComplete="off"
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                  placeholder="Enter your full name"
                  aria-invalid={!!errors.full_name}
                />
                {errors.full_name && (
                  <span className="auth-field-error">{errors.full_name}</span>
                )}
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="f-phone">
                  Mobile number <span className="req">*</span>
                </label>
                <input
                  id="f-phone"
                  name="pft-phone"
                  className={`auth-input ${errors.phone ? "invalid" : ""}`}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Enter mobile number"
                  maxLength={10}
                  aria-invalid={!!errors.phone}
                />
                {errors.phone && <span className="auth-field-error">{errors.phone}</span>}
              </div>
            </>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="f-password">
              Password <span className="req">*</span>
            </label>
            <div className="auth-input-wrap">
              <input
                id="f-password"
                name="pft-password"
                className={`auth-input ${errors.password ? "invalid" : ""}`}
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Enter your password"
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                <EyeIcon off={showPw} />
              </button>
            </div>
            {errors.password && <span className="auth-field-error">{errors.password}</span>}
          </div>

          {isRegister && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="f-password2">
                Confirm password <span className="req">*</span>
              </label>
              <div className="auth-input-wrap">
                <input
                  id="f-password2"
                  name="pft-password2"
                  className={`auth-input ${errors.password2 ? "invalid" : ""}`}
                  type={showPw2 ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password2}
                  onChange={(e) => update("password2", e.target.value)}
                  placeholder="Re-enter your password"
                  aria-invalid={!!errors.password2}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw2((v) => !v)}
                  aria-label={showPw2 ? "Hide password" : "Show password"}
                >
                  <EyeIcon off={showPw2} />
                </button>
              </div>
              {errors.password2 && (
                <span className="auth-field-error">{errors.password2}</span>
              )}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? "Please wait…"
              : isRegister
              ? "Create Account"
              : isAdminPortal
              ? "Login as Admin"
              : "Login"}
          </button>
        </form>

        {isAdminPortal ? (
          <p className="auth-switch">Admin accounts are set up by the owner.</p>
        ) : (
          <p className="auth-switch">
            {mode === "register" ? "Already registered? " : "Don't have an account? "}
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setErrors({});
                setToast(null);
                clearAllFields();
              }}
            >
              {mode === "register" ? "Login here" : "Create account"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
