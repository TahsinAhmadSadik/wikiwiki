import React, { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/auth.css';

export default function AuthPage({ initialView = 'login' }) {
  const [view, setView] = useState(initialView); // 'login' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const emailId = useId();
  const usernameId = useId();
  const passwordId = useId();

  // Password strength meter calculation[cite: 15]
  const computePasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: 'transparent' };
    let score = 0;
    if (pwd.length >= 8) score += 25;
    if (pwd.length >= 12) score += 25;
    if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score += 25;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 25;

    if (score <= 25) return { score, label: 'Weak', color: '#ef4444' };
    if (score <= 50) return { score, label: 'Fair', color: '#f59e0b' };
    if (score <= 75) return { score, label: 'Good', color: '#3b82f6' };
    return { score: 100, label: 'Strong', color: '#22c55e' };
  };

  const strength = computePasswordStrength(password);

  const resetMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const switchView = (nextView) => {
    resetMessages();
    setPassword('');
    setView(nextView);
  };

  // Submit Login
  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      const data = await api.post('/auth/login', { email, password });

      if (data.user?.is_banned) {
        throw new Error('This account has been banned from the wiki.');
      }

      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setErrorMessage(err.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Register[cite: 13, 15]
  const handleRegister = async (e) => {
    e.preventDefault();
    resetMessages();

    if (password.length < 8 || password.length > 72) {
      setErrorMessage('Password must be between 8 and 72 characters.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/register', { username, email, password });
      setSuccessMessage('Account created successfully. You can now log in.');
      switchView('login');
    } catch (err) {
      setErrorMessage(err.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Forgot Password
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSuccessMessage('A password reset link has been dispatched to your email.');
    } catch (err) {
      setErrorMessage(err.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <header className="auth-header">
          {view === 'login' && (
            <>
              <h1>Sign in</h1>
              <p>Enter your credentials to access the wiki</p>
            </>
          )}
          {view === 'register' && (
            <>
              <h1>Create account</h1>
              <p>Join the community to read and edit articles</p>
            </>
          )}
          {view === 'forgot' && (
            <>
              <h1>Reset password</h1>
              <p>We'll send a password recovery link to your email</p>
            </>
          )}
        </header>

        {errorMessage && <div className="auth-alert error">{errorMessage}</div>}
        {successMessage && <div className="auth-alert success">{successMessage}</div>}

        {/* LOGIN FORM */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor={emailId}>Email address</label>
              <input
                id={emailId}
                type="email"
                required
                className="auth-input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor={passwordId}>Password</label>
                <button
                  type="button"
                  className="form-link"
                  onClick={() => switchView('forgot')}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id={passwordId}
                type="password"
                required
                className="auth-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        {/* REGISTER FORM */}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="form-group">
              <label htmlFor={usernameId}>Username</label>
              <input
                id={usernameId}
                type="text"
                required
                maxLength={50}
                className="auth-input"
                placeholder="johndoe"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor={emailId}>Email address</label>
              <input
                id={emailId}
                type="email"
                required
                className="auth-input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor={passwordId}>Password</label>
              <input
                id={passwordId}
                type="password"
                required
                className="auth-input"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {password && (
                <div className="strength-container">
                  <div className="strength-meter">
                    <div
                      className="strength-bar"
                      style={{
                        width: `${strength.score}%`,
                        backgroundColor: strength.color,
                      }}
                    />
                  </div>
                  <span className="strength-label">{strength.label}</span>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD FORM */}
        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor={emailId}>Email address</label>
              <input
                id={emailId}
                type="email"
                required
                className="auth-input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Sending link...' : 'Send reset link'}
            </button>
          </form>
        )}

        {/* FOOTER SWITCHER */}
        <footer className="auth-footer">
          {view === 'login' && (
            <span>
              Don't have an account?{' '}
              <button
                type="button"
                className="form-link"
                onClick={() => switchView('register')}
              >
                Sign up
              </button>
            </span>
          )}
          {view === 'register' && (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                className="form-link"
                onClick={() => switchView('login')}
              >
                Sign in
              </button>
            </span>
          )}
          {view === 'forgot' && (
            <span>
              Remembered your password?{' '}
              <button
                type="button"
                className="form-link"
                onClick={() => switchView('login')}
              >
                Back to sign in
              </button>
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}