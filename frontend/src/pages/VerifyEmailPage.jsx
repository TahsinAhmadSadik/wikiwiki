import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import '../styles/auth.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Prevents React StrictMode from executing the single-use verification twice
  const hasRequested = useRef(false);

  useEffect(() => {
    if (!token) {
      setErrorMessage('Missing verification token.');
      setLoading(false);
      return;
    }

    if (hasRequested.current) return;
    hasRequested.current = true;

    const verifyToken = async () => {
      try {
        const data = await api.post('/auth/verify-email', { token });
        setErrorMessage('');
        setSuccessMessage(data.message);
      } catch (err) {
        setSuccessMessage('');
        setErrorMessage(err.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <header className="auth-header">
          <h1>Account Verification</h1>
          <p>Confirming your email address with the registry</p>
        </header>

        {loading && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--auth-text-muted)' }}>
            Verifying your email...
          </div>
        )}

        {errorMessage && (
          <div className="auth-alert error">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="auth-alert success">
            {successMessage}
          </div>
        )}

        {!loading && (
          <footer className="auth-footer">
            <Link 
              to="/login" 
              className="auth-btn" 
              style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}
            >
              Proceed to Login
            </Link>
          </footer>
        )}
      </div>
    </div>
  );
}