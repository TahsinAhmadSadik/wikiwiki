import React from 'react';
import '../styles/auth.css';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled UI Exception:', error, errorInfo);
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="auth-wrapper">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <header className="auth-header" style={{ marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--auth-error)', fontWeight: 600 }}>
                APPLICATION ERROR
              </span>
              <h1 style={{ marginTop: '0.35rem' }}>Something went wrong</h1>
              <p>An unexpected client runtime error occurred.</p>
            </header>

            <button 
              type="button" 
              onClick={this.handleReload} 
              className="auth-btn"
              style={{ width: 'auto', padding: '0.65rem 1.5rem' }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}