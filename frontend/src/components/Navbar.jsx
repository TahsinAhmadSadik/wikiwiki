import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleConfig } from '../utils/roles';
import { api } from '../services/api';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const roleBadge = getRoleConfig(user?.global_role);

 useEffect(() => {
  const isAdmin = ['admin', 'owner'].includes(user?.global_role);

  if (!isAdmin) {
    setPendingCount(0);
    return;
  }

  const checkPending = async () => {
    try {
      const res = await api.get('/admin/pending-count');
      setPendingCount(res.total_pending || 0);
    } catch {
      setPendingCount(0);
    }
  };

  checkPending();

  const interval = setInterval(checkPending, 20000);

  return () => clearInterval(interval);
}, [user]);

  const isActive = (path) => location.pathname === path;
  const isContributeActive = location.pathname === '/search' && location.search.includes('needs_contribution=true');

  // Gender-neutral DiceBear bot avatar fallback
  const fallbackAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(user?.username || 'WikiUser')}`;
  const avatarSrc = user?.profile_pic_url || fallbackAvatar;

  return (
    <>
      <style>{`
        .wiki-navbar {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 2rem;
          background: rgba(10, 10, 12, 0.85);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.2s ease;
        }

        .nav-link {
          position: relative;
          color: #a1a1aa;
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 500;
          padding: 0.4rem 0.65rem;
          border-radius: 6px;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        .nav-link:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }

        .nav-link.active {
          color: #fff;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.07);
        }

        .nav-link.contribute-active {
          color: #38bdf8;
          font-weight: 600;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.25);
        }

        .nav-icon-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          color: #a1a1aa;
          background: #141417;
          border: 1px solid #27272a;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .nav-icon-btn:hover {
          color: #fff;
          background: #1c1c21;
          border-color: #3f3f46;
          transform: translateY(-1px);
        }

        .user-highlight-pill {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.25rem 0.85rem 0.25rem 0.35rem;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(99, 102, 241, 0.08));
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 9999px;
          text-decoration: none;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .user-highlight-pill:hover {
          border-color: rgba(168, 85, 247, 0.55);
          box-shadow: 0 0 16px rgba(168, 85, 247, 0.2);
          transform: translateY(-1px);
        }

        .user-avatar-image {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
          background: #18181b;
          border: 1px solid rgba(168, 85, 247, 0.4);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
          display: block;
        }

        .logo-hover-effect {
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .brand-link:hover .logo-hover-effect {
          transform: rotate(-6deg) scale(1.1);
        }

        .new-article-btn {
          background: rgba(168, 85, 247, 0.12);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.35);
          font-weight: 600;
          padding: 0.4rem 0.85rem;
          border-radius: 6px;
          text-decoration: none;
          font-size: 0.8125rem;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          transition: all 0.2s ease;
        }

        .new-article-btn:hover {
          background: rgba(168, 85, 247, 0.22);
          border-color: #a855f7;
          color: #e9d5ff;
          transform: translateY(-1px);
        }
      `}</style>

      <nav className="wiki-navbar">
        {/* LEFT: BRAND LOGO & CORE LINKS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link
            to="/"
            className="brand-link"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '1.2rem',
              letterSpacing: '-0.025em'
            }}
          >
            <img
              src="/logo.png"
              alt="WikiWiki Logo"
              className="logo-hover-effect"
              style={{
                width: 24,
                height: 24,
                display: 'block'
              }}
            />
            <span>WikiWiki</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Link
              to="/"
              className={`nav-link ${isActive('/') ? 'active' : ''}`}
            >
              Explore
            </Link>

            {/* DIRECT CONTRIBUTION EXPLORER LINK */}
            <Link
              to="/search?needs_contribution=true"
              className={`nav-link ${isContributeActive ? 'contribute-active' : ''}`}
              title="Browse articles where authors are seeking community contributions"
            >
              <span>📢</span> Contribute
            </Link>

            {user && (
              <>
                <Link
                  to="/studio"
                  className={`nav-link ${isActive('/studio') ? 'active' : ''}`}
                >
                  Studio
                </Link>

    {['admin', 'owner'].includes(user?.global_role) && (
      <Link
        to="/admin"
        className={`nav-link ${isActive('/admin') ? 'active' : ''}`}
      >
        Admin Panel

        {pendingCount > 0 && (
          <span
            style={{
              width: '7px',
              height: '7px',
              backgroundColor: '#ef4444',
              borderRadius: '50%',
              display: 'inline-block',
              boxShadow: '0 0 6px rgba(239, 68, 68, 0.7)'
            }}
            title={`${pendingCount} pending admin task${pendingCount !== 1 ? 's' : ''}`}
          />
        )}
      </Link>
    )}

    <Link to="/editor" className="new-article-btn">
      <span>+</span> New Article
    </Link>
  </>
)}
          </div>
        </div>

        {/* RIGHT: SEARCH, USERNAME, SETTINGS & AUTH */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* SEARCH ICON */}
          <Link
            to="/search"
            className="nav-icon-btn"
            title="Search Articles & Wikis"
            style={{ borderColor: isActive('/search') && !isContributeActive ? '#a855f7' : '#27272a' }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </Link>

          {user ? (
            <>
              {/* USERNAME & AVATAR PILL */}
              <Link to="/settings" className="user-highlight-pill" title="Edit Profile & Avatar">
                <img
                  src={avatarSrc}
                  alt={user.username}
                  className="user-avatar-image"
                  onError={(e) => { e.currentTarget.src = fallbackAvatar; }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#f4f4f5',
                      letterSpacing: '-0.01em'
                    }}
                  >
                    {user.username}
                  </span>

                  {['owner', 'admin'].includes(user.global_role) && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        color: roleBadge.color,
                        backgroundColor: roleBadge.bg,
                        border: `1px solid ${roleBadge.color}35`,
                        borderRadius: 4,
                        padding: '0.1rem 0.35rem',
                        lineHeight: 1.2
                      }}
                    >
                      {roleBadge.label}
                    </span>
                  )}
                </div>
              </Link>

              {/* SETTINGS ICON */}
              <Link
                to="/settings"
                className="nav-icon-btn"
                title="Account Settings & Preferences"
                style={{ borderColor: isActive('/settings') ? '#a855f7' : '#27272a' }}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>

              {/* LOGOUT BUTTON */}
              <button
                type="button"
                onClick={logout}
                style={{
                  background: 'transparent',
                  color: '#71717a',
                  border: '1px solid #27272a',
                  borderRadius: 6,
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#71717a';
                  e.currentTarget.style.borderColor = '#27272a';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <Link
                to="/login"
                style={{
                  color: '#d4d4d8',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  padding: '0.4rem 0.8rem',
                  borderRadius: 6,
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#d4d4d8'; }}
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
                  padding: '0.45rem 0.95rem',
                  borderRadius: 6,
                  boxShadow: '0 2px 8px rgba(255, 255, 255, 0.1)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f4f4f5';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}