import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards';
import { useAuth } from './context/AuthContext';

function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: '2rem', color: '#fff', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <h2>Dashboard</h2>
      <p>Logged in as: {user?.username} ({user?.global_role})</p>
      <button onClick={logout} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
        Log out
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
      </Route>

      {/* Guest Only Routes */}
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<AuthPage initialView="login" />} />
        <Route path="/register" element={<AuthPage initialView="register" />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>
    </Routes>
  );
}