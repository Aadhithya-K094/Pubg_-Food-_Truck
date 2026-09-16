import React from "react";
import { useNavigate } from "react-router-dom";

import { getCurrentUser, logout } from "../services/api";
import logo from "../assets/images/logo.png";
import loginBg from "../assets/images/login-bg.jpg";

export default function Home() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const name = user?.full_name || user?.username;

  return (
    <div className="screen home-wrapper">
      {/* faded hero background layer */}
      <div
        className="screen-bg"
        style={{ backgroundImage: `url(${loginBg})` }}
        aria-hidden="true"
      />
      <div className="home-panel">
        <img src={logo} alt="PUBG Food Truck logo" className="home-logo" />
        <span className="dash-badge">Customer</span>
        <h1 className="home-title">Welcome{name ? `, ${name}` : ""}!</h1>
        <p className="home-sub">Browse the trucks and place your order.</p>
        <button className="home-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
