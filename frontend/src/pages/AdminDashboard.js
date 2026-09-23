import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getCurrentUser,
  logout,
  getDashboard,
  getAdminOrders,
  adminOrderAction,
  getCustomerLog,
  getStatusLog,
} from "../services/api";
import { IconScooter, IconDining, IconBag, IconPin, IconChair } from "../components/Icons";
import logo from "../assets/images/logo.png";
import sideBg from "../assets/images/dashboard-bg.jpg";

const SERVICE_META = {
  doorstep: { label: "Doorstep Delivery", Icon: IconScooter },
  dining: { label: "Dining", Icon: IconDining },
  takeaway: { label: "Take Away", Icon: IconBag },
};

const TABS = [
  { key: "orders", label: "Orders" },
  { key: "history", label: "History" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [serviceFilter, setServiceFilter] = useState(""); // "", doorstep, ...
  const [tab, setTab] = useState("orders");
  const [custLog, setCustLog] = useState([]);
  const [statusLog, setStatusLog] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadStats = useCallback(() => {
    getDashboard().then(setStats).catch(() => setError("Could not load dashboard."));
  }, []);

  const loadOrders = useCallback(() => {
    getAdminOrders(serviceFilter ? { service: serviceFilter } : {})
      .then(setOrders)
      .catch(() => setError("Could not load orders."));
  }, [serviceFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab === "orders") loadOrders();
    if (tab === "history") {
      getCustomerLog().then(setCustLog).catch(() => setCustLog([]));
      getStatusLog().then(setStatusLog).catch(() => setStatusLog([]));
    }
  }, [tab, loadOrders]);

  // Combined, newest-first history feed of every stored event (customer
  // data updates + admin status changes) for the History tab.
  const historyFeed = [
    ...custLog.map((r) => ({
      id: `c${r.id}`,
      at: r.created_at,
      who: r.customer_username || "customer",
      kind: "Customer",
      text: `${r.event}${r.detail ? ` — ${r.detail}` : ""}`,
      order: r.order,
    })),
    ...statusLog.map((r) => ({
      id: `a${r.id}`,
      at: r.created_at,
      who: r.admin_username || "admin",
      kind: "Admin",
      text: `${r.from_status || "—"} → ${r.to_status}${r.note ? ` (${r.note})` : ""}`,
      order: r.order,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  async function act(orderId, action, extra = {}) {
    setBusyId(orderId);
    try {
      await adminOrderAction(orderId, { action, ...extra });
      loadOrders();
      loadStats();
    } catch {
      setError("Action failed. Please retry.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-wrapper">
      <div className="app-bg" style={{ backgroundImage: `url(${sideBg})` }} aria-hidden="true" />
      <div className="admin-inner">
      <header className="admin-header">
        <div className="admin-brand">
          <img src={logo} alt="PUBG Food Truck" className="admin-logo" />
          <div>
            <span className="dash-badge">Admin · Owner</span>
            <h1 className="admin-title">Truck Control</h1>
            <p className="admin-sub">Signed in as {user?.full_name || user?.username}</p>
          </div>
        </div>
        <button className="dash-logout" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {error && <p className="cust-error admin-error">{error}</p>}

      {/* ---- per service-type counts ---- */}
      <section className="admin-service-cards">
        {Object.entries(SERVICE_META).map(([key, meta]) => (
          <div key={key} className="admin-service-card">
            <span className="admin-service-icon">
              <meta.Icon />
            </span>
            <div>
              <span className="admin-service-count">
                {stats?.by_service_type?.[key] ?? 0}
              </span>
              <span className="admin-service-label">{meta.label}</span>
            </div>
          </div>
        ))}
      </section>

      {/* ---- status + payment summary ---- */}
      <section className="admin-stat-strip">
        <StatChip label="Pending" value={stats?.pending} tone="pending" />
        <StatChip label="Processing" value={stats?.processing} tone="processing" />
        <StatChip label="Completed" value={stats?.completed} tone="completed" />
        <StatChip label="Paid" value={stats?.paid} tone="paid" />
        <StatChip label="Unpaid" value={stats?.unpaid} tone="unpaid" />
        <StatChip label="Total" value={stats?.total_orders} tone="total" />
      </section>

      {/* ---- tabs ---- */}
      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <>
          <div className="admin-filter-row">
            <button
              className={`filter-pill ${serviceFilter === "" ? "active" : ""}`}
              onClick={() => setServiceFilter("")}
            >
              All
            </button>
            {Object.entries(SERVICE_META).map(([key, meta]) => (
              <button
                key={key}
                className={`filter-pill ${serviceFilter === key ? "active" : ""}`}
                onClick={() => setServiceFilter(key)}
              >
                <meta.Icon /> {meta.label}
              </button>
            ))}
          </div>

          <div className="admin-orders">
            {orders.length === 0 && <p className="cust-muted">No orders here yet.</p>}
            {orders.map((o) => (
              <AdminOrderCard key={o.id} order={o} busy={busyId === o.id} onAct={act} />
            ))}
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="admin-logs">
          {/* Combined chronological history feed */}
          <section className="history-feed-section">
            <h2 className="log-table-title">Activity History</h2>
            <p className="cust-muted history-sub">
              Every customer update and admin status change is recorded here and stored in the database.
            </p>
            {historyFeed.length === 0 ? (
              <p className="cust-muted">No history yet.</p>
            ) : (
              <ul className="history-feed">
                {historyFeed.map((h) => (
                  <li key={h.id} className={`history-item kind-${h.kind.toLowerCase()}`}>
                    <span className="history-time">
                      {new Date(h.at).toLocaleString()}
                    </span>
                    <span className={`history-badge badge-${h.kind.toLowerCase()}`}>
                      {h.kind}
                    </span>
                    <span className="history-order">#{h.order}</span>
                    <span className="history-who">{h.who}</span>
                    <span className="history-text">{h.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <LogTable
            title="Customer Order Log"
            rows={custLog}
            columns={[
              ["created_at", "Time"],
              ["order", "Order"],
              ["customer_username", "Customer"],
              ["event", "Event"],
              ["detail", "Detail"],
            ]}
          />
          <LogTable
            title="Admin Order Status Log"
            rows={statusLog}
            columns={[
              ["created_at", "Time"],
              ["order", "Order"],
              ["admin_username", "Admin"],
              ["from_status", "From"],
              ["to_status", "To"],
            ]}
          />
        </div>
      )}
      </div>
    </div>
  );
}

function StatChip({ label, value, tone }) {
  return (
    <div className={`stat-chip tone-${tone}`}>
      <span className="stat-chip-value">{value ?? 0}</span>
      <span className="stat-chip-label">{label}</span>
    </div>
  );
}

function AdminOrderCard({ order, busy, onAct }) {
  const meta = SERVICE_META[order.service_type] || {};
  return (
    <div className="admin-order-card">
      <div className="admin-order-top">
        <span className="admin-order-id">
          {meta.Icon && <meta.Icon />} #{order.id}
        </span>
        <span className={`tracker-status status-${order.status}`}>
          {order.status_display || order.status}
        </span>
      </div>

      <div className="admin-order-meta">
        <span>{order.customer_name || order.customer_username}</span>
        <span>₹{Number(order.total_amount).toFixed(2)}</span>
        <span className={`pay-pill ${order.payment_status}`}>
          {order.payment_status === "paid" ? "Paid" : "Unpaid"}
        </span>
      </div>

      <ul className="admin-order-items">
        {order.items.map((it) => (
          <li key={it.id} className="admin-order-item">
            <span>
              {it.quantity} × {it.menu_item_name}
              <span className="admin-item-unit"> @ ₹{Number(it.unit_price).toFixed(2)}</span>
            </span>
            <span className="admin-item-line">
              ₹{(Number(it.unit_price) * it.quantity).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className="admin-order-total">
        <span>Total</span>
        <span>₹{Number(order.total_amount).toFixed(2)}</span>
      </div>

      {order.service_type === "doorstep" && order.delivery_address && (
        <p className="admin-order-addr"><IconPin /> {order.delivery_address}</p>
      )}
      {order.service_type === "dining" && order.table_number && (
        <p className="admin-order-addr"><IconChair /> Table {order.table_number}</p>
      )}

      <div className="admin-order-actions">
        {order.status === "pending" && (
          <>
            <button
              className="act-btn accept"
              disabled={busy}
              onClick={() =>
                onAct(order.id, "accept", { estimated_minutes: 30 })
              }
            >
              Accept
            </button>
            <button
              className="act-btn reject"
              disabled={busy}
              onClick={() => onAct(order.id, "reject")}
            >
              Reject
            </button>
          </>
        )}
        {order.status === "accepted" && (
          <button
            className="act-btn"
            disabled={busy}
            onClick={() => onAct(order.id, "processing")}
          >
            Mark Preparing
          </button>
        )}
        {order.status === "processing" && (
          <button
            className="act-btn complete"
            disabled={busy}
            onClick={() => onAct(order.id, "complete")}
          >
            Mark Completed
          </button>
        )}
        {order.payment_status === "unpaid" && order.status !== "rejected" && (
          <button
            className="act-btn pay"
            disabled={busy}
            onClick={() => onAct(order.id, "payment", { payment_status: "paid" })}
          >
            {busy ? "Updating…" : "Mark Paid"}
          </button>
        )}
        {order.payment_status === "paid" && (
          <span className="act-paid-tag">✓ Payment received</span>
        )}
      </div>
    </div>
  );
}

function LogTable({ title, rows, columns }) {
  return (
    <section className="log-table-section">
      <h2 className="log-table-title">{title}</h2>
      <div className="log-table-wrap">
        <table className="log-table">
          <thead>
            <tr>
              {columns.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="cust-muted">
                  No entries yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map(([field]) => (
                  <td key={field}>
                    {field === "created_at"
                      ? new Date(row[field]).toLocaleString()
                      : String(row[field] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
