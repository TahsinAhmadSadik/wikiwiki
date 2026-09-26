import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth.css';

export default function NotFoundPage({ 
  title = "Page Not Found", 
  message = "The article or page you are looking for does not exist or has been moved." 
}) {
  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <header className="auth-header" style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--auth-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
            404 ERROR
          </span>
          <h1 style={{ marginTop: '0.35rem' }}>{title}</h1>
          <p>{message}</p>
        </header>

        <div style={{ marginTop: '1.5rem' }}>
          <Link 
            to="/" 
            className="auth-btn" 
            style={{ display: 'inline-block', textDecoration: 'none', width: 'auto', padding: '0.65rem 1.5rem' }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}