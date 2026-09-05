import React, { useState, useId } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import '../styles/auth.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const passwordId = useId();
  const confirmPasswordId = useId();

  const handleReset = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!token) {
      setErrorMessage('Reset token is missing or malformed.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (password.length < 8 || password.length > 72) {
      setErrorMessage('Password must be between 8 and 72 characters.');
      return;
    }

    setLoading(true);

    try {
      const data = await api.post('/auth/reset-password', { token, password });
      setSuccessMessage(data.message);
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err) {
      setErrorMessage(err.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <header className="auth-header">
            <h1>Invalid Link</h1>
            <p>No password recovery token was supplied.</p>
          </header>
          <div className="auth-footer">
            <Link to="/login" className="form-link">Back to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <header className="auth-header">
          <h1>Choose new password</h1>
          <p>Please enter and confirm your new passphrase below</p>
        </header>

        {errorMessage && <div className="auth-alert error">{errorMessage}</div>}
        {successMessage && <div className="auth-alert success">{successMessage}</div>}

        <form onSubmit={handleReset} className="auth-form">
          <div className="form-group">
            <label htmlFor={passwordId}>New password</label>
            <input
              id={passwordId}
              type="password"
              required
              className="auth-input"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor={confirmPasswordId}>Confirm new password</label>
            <input
              id={confirmPasswordId}
              type="password"
              required
              className="auth-input"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading || Boolean(successMessage)} className="auth-btn">
            {loading ? 'Updating password...' : 'Update password'}
          </button>
        </form>

        <footer className="auth-footer">
          <Link to="/login" className="form-link">Back to sign in</Link>
        </footer>
      </div>
    </div>
  );
}