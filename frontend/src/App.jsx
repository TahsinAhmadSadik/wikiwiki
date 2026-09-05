import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingModal from './components/OnboardingModal';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards';
import { useAuth } from './context/AuthContext';

function Dashboard() {
  const { user, logout, updateUser } = useAuth();

  return (
    <div style={{ padding: '2rem 3rem', color: '#f4f4f5', backgroundColor: '#000', minHeight: '100vh' }}>
      {!user?.has_onboarded && (
        <OnboardingModal
          onComplete={() => {
            updateUser({ has_onboarded: true });
          }}
        />
      )}

      {/* DASHBOARD NAVBAR */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid #1f1f23',
        marginBottom: '2.5rem'
      }}>
        <span style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Wiki Dashboard
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <Link
            to="/settings"
            style={{
              color: '#d4d4d8',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            Settings
          </Link>
          <button
            onClick={logout}
            style={{
              padding: '0.4rem 0.85rem',
              background: '#18181b',
              color: '#f4f4f5',
              border: '1px solid #27272a',
              cursor: 'pointer',
              borderRadius: 6,
              fontSize: '0.8125rem'
            }}
          >
            Log out
          </button>
        </div>
      </nav>

      <div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Welcome, {user?.username}</h2>
        <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>
          Global Role: <span style={{ color: '#f4f4f5', fontWeight: 500 }}>{user?.global_role}</span>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<AuthPage initialView="login" />} />
        <Route path="/register" element={<AuthPage initialView="register" />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>
    </Routes>
  );
}