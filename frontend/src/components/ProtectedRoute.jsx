import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function ProtectedRoute({ children, role }) {
  const { user } = useAuth();
  if (user === null) return (
    <div className="min-h-screen flex items-center justify-center" data-testid="auth-loading">
      <div className="font-display font-black text-3xl animate-pulse">Cargando...</div>
    </div>
  );
  if (user === false) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}
