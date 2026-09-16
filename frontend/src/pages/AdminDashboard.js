import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getCurrentUser, listUsers, logout } from "../services/api";
import logo from "../assets/images/logo.png";
import dashboardBg from "../assets/images/dashboard-bg.jpg";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setUsers(await listUsers());
      } catch {
        setError("Could not load users. Is the backend running?");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const customers = users.filter((u) => u.role === "customer");
  const admins = users.filter((u) => u.role === "admin");

  return (
    <div className="dash-wrapper">
      {/* faded hero background layer */}
      <div
        className="dash-bg"
        style={{ backgroundImage: `url(${dashboardBg})` }}
        aria-hidden="true"
      />
      <div className="dash-inner">
        <header className="dash-header">
          <div className="dash-headline">
            <img src={logo} alt="" className="dash-logo" aria-hidden="true" />
            <div>
              <span className="dash-badge">Admin · Owner</span>
              <h1 className="dash-title">Truck Control</h1>
              <p className="dash-sub">
                Signed in as {user?.full_name || user?.username}
              </p>
            </div>
          </div>
          <button className="dash-logout" onClick={handleLogout}>
            Log out
          </button>
        </header>

        <section className="dash-stats">
          <div className="stat-card">
            <span className="stat-value">{admins.length}</span>
            <span className="stat-label">Admins</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{customers.length}</span>
            <span className="stat-label">Customers</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">0</span>
            <span className="stat-label">Open orders</span>
          </div>
        </section>

        <section className="dash-panel">
          <h2 className="dash-panel-title">Registered users</h2>
          {loading && <p className="dash-muted">Loading…</p>}
          {error && <p className="dash-error">{error}</p>}
          {!loading && !error && (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    {/* data-label drives the stacked card layout on phones */}
                    <td data-label="ID">{u.id}</td>
                    <td data-label="Username">{u.username}</td>
                    <td data-label="Email">{u.email}</td>
                    <td data-label="Role">
                      <span className={`role-pill ${u.role}`}>{u.role}</span>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan="4" className="dash-muted">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
