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
        // Suppress failure for guests/unauthorized
      }
    };
    if (user) checkPending();
  }, [user, location.pathname]);

  return (
    <>
      <CreateWikiModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => window.location.reload()}
      />

      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.85rem 2rem',
        backgroundColor: '#0d0d0f',
        borderBottom: '1px solid #1f1f23'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '1.1rem' }}>
            WikiWiki
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.875rem' }}>
            <Link 
              to="/" 
              style={{ color: location.pathname === '/' ? '#fff' : '#a1a1aa', textDecoration: 'none' }}
            >
              Library
            </Link>
            <Link 
              to="/admin" 
              style={{
                color: location.pathname === '/admin' ? '#fff' : '#a1a1aa',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
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
              style={{ color: location.pathname === '/editor' ? '#fff' : '#a1a1aa', textDecoration: 'none' }}
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
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
            <span>{roleBadge.icon}</span> {roleBadge.label}
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
        </div>
      </nav>
    </>
  );
}