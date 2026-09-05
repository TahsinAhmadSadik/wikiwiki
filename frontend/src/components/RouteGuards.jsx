import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Restrict access to logged-in users only
export function ProtectedRoute({ redirectTo = '/login' }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;
  return isAuthenticated ? <Outlet /> : <Navigate to={redirectTo} replace />;
}

// Redirect logged-in users away from /login and /register
export function GuestRoute({ redirectTo = '/' }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;
  return !isAuthenticated ? <Outlet /> : <Navigate to={redirectTo} replace />;
}