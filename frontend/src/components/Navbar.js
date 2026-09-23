import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { logout, getMyOrders } from "../services/api";
import OrderTracker, { isCurrentOrder } from "./OrderTracker";
import { IconReceipt, IconPhone, IconGear, IconHome } from "./Icons";
import logo from "../assets/images/logo.png";

export default function Navbar({ user, onHome }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // mobile menu
  const [panel, setPanel] = useState(null); // orders / contact / profile / help
  const [settingsOpen, setSettingsOpen] = useState(false); // settings dropdown
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const navRef = useRef(null);

  // Load the customer's orders when the "Previous Orders" panel opens.
  useEffect(() => {
    if (panel !== "orders") return;
    setOrdersLoading(true);
    getMyOrders()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [panel]);

  // Previous Orders shows ONLY finished orders (completed / rejected).
  // Anything still in progress belongs in the Current Order card.
  const previousOrders = orders.filter((o) => !isCurrentOrder(o));

  function closeAll() {
    setSettingsOpen(false);
    setPanel(null);
  }

  // Close dropdowns with Escape or when clicking outside the navbar.
  useEffect(() => {
    const anyOpen = settingsOpen || panel;
    if (!anyOpen) return;
    function onKey(e) {
      if (e.key === "Escape") closeAll();
    }
    function onDocClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) closeAll();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [settingsOpen, panel]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  // Toggle a content dropdown (closing the settings menu first).
  function togglePanel(key) {
    setSettingsOpen(false);
    setPanel((cur) => (cur === key ? null : key));
    setOpen(false);
  }

  return (
    <nav className="navbar" ref={navRef}>
      <div className="navbar-brand">
        <img src={logo} alt="PUBG Food Truck" className="navbar-logo" />
        <span className="navbar-name">PUBG FOOD TRUCK</span>
      </div>

      <button
        className="navbar-toggle"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>

      <div className={`navbar-links ${open ? "open" : ""}`}>
        <button
          className="navbar-link"
          onClick={() => {
            closeAll();
            setOpen(false);
            if (onHome) onHome();
            else navigate("/");
          }}
        >
          <IconHome className="navbar-link-icon" /> Home
        </button>

        {/* Previous Orders dropdown */}
        <div className="navbar-item">
          <button
            className={`navbar-link ${panel === "orders" ? "active" : ""}`}
            aria-expanded={panel === "orders"}
            onClick={() => togglePanel("orders")}
          >
            <IconReceipt className="navbar-link-icon" /> Previous Orders
          </button>
          {panel === "orders" && (
            <div className="nav-dropdown nav-dropdown-wide" role="region" aria-label="Previous Orders">
              <div className="nav-dropdown-head">
                <h2>Previous Orders</h2>
              </div>
              <div className="nav-dropdown-body nav-dropdown-scroll">
                {ordersLoading && <p className="cust-muted">Loading your orders…</p>}
                {!ordersLoading && previousOrders.length === 0 && (
                  <p className="cust-muted">No previous orders yet.</p>
                )}
                {!ordersLoading &&
                  previousOrders.map((o) => (
                    <OrderTracker key={o.id} order={o} showMap={false} />
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Contact Us dropdown */}
        <div className="navbar-item">
          <button
            className={`navbar-link ${panel === "contact" ? "active" : ""}`}
            aria-expanded={panel === "contact"}
            onClick={() => togglePanel("contact")}
          >
            <IconPhone className="navbar-link-icon" /> Contact Us
          </button>
          {panel === "contact" && (
            <div className="nav-dropdown" role="region" aria-label="Contact Us">
              <div className="nav-dropdown-head">
                <h2>Contact Us</h2>
              </div>
              <div className="nav-dropdown-body">
                <p className="cust-muted">
                  Contact details and a message form will go here.
                </p>
                <p><strong>Email:</strong> hello@pubgfoodtruck.com</p>
                <p><strong>Phone:</strong> +91 90000 00000</p>
              </div>
            </div>
          )}
        </div>

        {/* Settings dropdown (Profile / Help / Logout) */}
        <div className="navbar-item">
          <button
            className={`navbar-link ${settingsOpen || panel === "profile" || panel === "help" ? "active" : ""}`}
            aria-haspopup="true"
            aria-expanded={settingsOpen}
            onClick={() => {
              setPanel(null);
              setSettingsOpen((v) => !v);
              setOpen(false);
            }}
          >
            <IconGear className="navbar-link-icon" /> Settings
          </button>

          {settingsOpen && (
            <div className="nav-dropdown" role="menu" aria-label="Settings">
              <div className="nav-dropdown-head">
                <h2>Settings</h2>
              </div>
              <div className="nav-dropdown-items">
                <button
                  className="nav-dropdown-item"
                  onClick={() => togglePanel("profile")}
                >
                  <span className="nav-dropdown-item-title">Profile</span>
                  <span className="nav-dropdown-item-sub">Your account details</span>
                </button>
                <button
                  className="nav-dropdown-item"
                  onClick={() => togglePanel("help")}
                >
                  <span className="nav-dropdown-item-title">Help &amp; Support</span>
                  <span className="nav-dropdown-item-sub">FAQs and contact</span>
                </button>
                <button className="nav-dropdown-item nav-dropdown-logout" onClick={handleLogout}>
                  <span className="nav-dropdown-item-title">Log out</span>
                  <span className="nav-dropdown-item-sub">Sign out of your account</span>
                </button>
              </div>
            </div>
          )}

          {/* Profile / Help open as dropdowns under Settings too */}
          {panel === "profile" && user && (
            <div className="nav-dropdown" role="region" aria-label="Profile">
              <div className="nav-dropdown-head">
                <h2>Profile</h2>
              </div>
              <div className="nav-dropdown-body">
                <p><strong>Name:</strong> {user.full_name || "—"}</p>
                <p><strong>Username:</strong> {user.username}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Phone:</strong> {user.phone || "—"}</p>
              </div>
            </div>
          )}
          {panel === "help" && (
            <div className="nav-dropdown" role="region" aria-label="Help & Support">
              <div className="nav-dropdown-head">
                <h2>Help &amp; Support</h2>
              </div>
              <div className="nav-dropdown-body">
                <p className="cust-muted">Need a hand? Reach us any time.</p>
                <p><strong>Support email:</strong> support@pubgfoodtruck.com</p>
                <p><strong>Phone:</strong> +91 90000 00000</p>
                <p className="cust-muted">Detailed help content will be added here.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
