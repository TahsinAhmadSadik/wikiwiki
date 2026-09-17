import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleConfig } from '../utils/roles';
import { api } from '../services/api';
import CreateWikiModal from './CreateWikiModal';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const roleBadge = getRoleConfig(user?.global_role);

  useEffect(() => {
    const checkPending = async () => {
      try {
        const res = await api.get('/articles/pending-reviews');
        setPendingCount(res.pending?.length || 0);
      } catch {
        // Suppress errors for guests/unauthorized
      }
    };
    if (user) checkPending();
  }, [user, location.pathname]);

  return (
    <>
      {user && (
        <CreateWikiModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => window.location.reload()}
        />
      )}

      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.85rem 2rem',
        backgroundColor: '#0d0d0f',
        borderBottom: '1px solid #1f1f23'
      }}>
        {/* LEFT: BRAND & DIRECTORY */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '1.15rem', letterSpacing: '-0.02em' }}>
            WikiWiki
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.875rem' }}>
            <Link 
              to="/" 
              style={{ color: location.pathname === '/' ? '#fff' : '#a1a1aa', textDecoration: 'none', fontWeight: location.pathname === '/' ? 600 : 400 }}
            >
              Explore
            </Link>

            {user && (
              <>
                <Link 
                  to="/studio" 
                  style={{ color: location.pathname === '/studio' ? '#fff' : '#a1a1aa', textDecoration: 'none', fontWeight: location.pathname === '/studio' ? 600 : 400 }}
                >
                  Studio
                </Link>

                <Link 
                  to="/admin" 
                  style={{
                    color: location.pathname === '/admin' ? '#fff' : '#a1a1aa',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: location.pathname === '/admin' ? 600 : 400
                  }}
                >
                  Admin Panel
                  {pendingCount > 0 && (
                    <span style={{
                      backgroundColor: '#f59e0b',
                      color: '#000',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      borderRadius: 9999,
                      padding: '0.1rem 0.45rem'
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </Link>

                <Link 
                  to="/editor" 
                  style={{ color: location.pathname === '/editor' ? '#fff' : '#a1a1aa', textDecoration: 'none', fontWeight: location.pathname === '/editor' ? 600 : 400 }}
                >
                  + New Article
                </Link>

                <button
                  onClick={() => setIsCreateOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#a1a1aa',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  + New Wiki
                </button>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: CONTROLS & AUTH */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user ? (
            <>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: roleBadge.bg,
                color: roleBadge.color,
                border: `1px solid ${roleBadge.color}40`,
                borderRadius: 9999,
                padding: '0.2rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                <span style={{ color: roleBadge.color }}>{roleBadge.icon}</span> {roleBadge.label}
              </span>

              <Link to="/settings" style={{ color: '#a1a1aa', textDecoration: 'none', fontSize: '0.875rem' }}>
                Settings
              </Link>
              <button
                onClick={logout}
                style={{
                  background: '#18181b',
                  color: '#f4f4f5',
                  border: '1px solid #27272a',
                  borderRadius: 4,
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8125rem',
                  cursor: 'pointer'
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link 
                to="/login" 
                style={{ color: '#d4d4d8', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Log In
              </Link>
              <Link 
                to="/register" 
                style={{
                  backgroundColor: '#f4f4f5',
                  color: '#09090b',
                  textDecoration: 'none',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  padding: '0.4rem 0.9rem',
                  borderRadius: 6
                }}
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </>
  );
}