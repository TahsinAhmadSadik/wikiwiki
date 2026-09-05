import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import OnboardingModal from './components/OnboardingModal';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards';
import { useAuth } from './context/AuthContext';

function Dashboard() {
  const { user, logout, updateUser } = useAuth();

  return (
    <div style={{ padding: '2rem', color: '#fff', backgroundColor: '#000', minHeight: '100vh' }}>
      {/* Show multi-step modal if the user hasn't completed onboarding */}
      {!user?.has_onboarded && (
        <OnboardingModal
          onComplete={() => {
            updateUser({ has_onboarded: true });
          }}
        />
      )}

      <h2>Dashboard</h2>
      <p>Logged in as: {user?.username} ({user?.global_role})</p>
      <button 
        onClick={logout} 
        style={{ padding: '0.5rem 1rem', background: '#18181b', color: '#fff', border: '1px solid #27272a', cursor: 'pointer', borderRadius: 4 }}
      >
        Log out
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
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