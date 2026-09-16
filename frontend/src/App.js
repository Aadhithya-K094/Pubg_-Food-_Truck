import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
import { getCurrentUser, ROLES } from "./services/api";
import "./App.css";

/**
 * Route guard. Requires a signed-in user, and optionally a specific role.
 * A user hitting an area that isn't theirs is redirected to their own home.
 */
function RequireAuth({ role, children }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === ROLES.ADMIN ? "/admin" : "/"} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Admin (owner / order receiver) area */}
      <Route
        path="/admin"
        element={
          <RequireAuth role={ROLES.ADMIN}>
            <AdminDashboard />
          </RequireAuth>
        }
      />

      {/* Customer area */}
      <Route
        path="/"
        element={
          <RequireAuth role={ROLES.CUSTOMER}>
            <Home />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
