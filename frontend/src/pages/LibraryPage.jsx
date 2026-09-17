import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/auth.css';

export default function LibraryPage() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState('published');
  const [data, setData] = useState({ published: [], pending: [], reports: [] });
  const [demerits, setDemerits] = useState(user?.demerit_points || 0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchLibrary = async () => {
      setErrorMsg('');
      try {
        const [res, meRes] = await Promise.all([
          api.get('/studio/library'),
          api.get('/users/me')
        ]);
        setData(res);
        if (meRes.user) {
          const liveDemerits = meRes.user.demerit_points || 0;
          setDemerits(liveDemerits);
          if (updateUser) {
            updateUser(meRes.user);
          }
        }
      } catch (err) {
        setErrorMsg(err.data?.message || err.message || 'Failed to load library resources.');
      } finally {
        setLoading(false);
      }
    };

    fetchLibrary();
  }, [user?.user_id]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <main style={{ maxWidth: 1000, margin: '2rem auto', padding: '0 1.5rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Studio Library</h1>
          <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>
            Manage your published articles, pending contribution drafts, and moderation feedback.
          </p>
        </header>

        {errorMsg && (
          <div className="auth-alert error" style={{ marginBottom: '1.5rem' }}>
            {errorMsg}
          </div>
        )}

        {!user ? (
          <div style={{
            backgroundColor: '#0d0d0f',
            border: '1px solid #1f1f23',
            borderRadius: 8,
            padding: '3rem 2rem',
            textAlign: 'center',
            maxWidth: 600,
            margin: '3rem auto'
          }}>
            <h2 style={{ fontSize: '1.4rem', margin: '0 0 0.5rem 0' }}>Your Knowledge Base Awaits</h2>
            <p style={{ color: '#a1a1aa', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
              Log in to view your authored publications, draft revisions, reading lists, and wiki administrative controls.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <Link to="/login" className="auth-btn" style={{ width: 'auto', padding: '0.55rem 1.5rem', textDecoration: 'none' }}>
                Log In
              </Link>
              <Link to="/register" style={{ backgroundColor: '#18181b', color: '#f4f4f5', border: '1px solid #27272a', borderRadius: 6, padding: '0.55rem 1.5rem', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Create an Account
              </Link>
            </div>
          </div>
        ) : loading ? (
          <div style={{ color: '#71717a' }}>Loading library...</div>
        ) : (
          <div>
            {/* TABS */}
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #1f1f23', marginBottom: '1.5rem' }}>
              <button
                onClick={() => setTab('published')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === 'published' ? '2px solid #fff' : '2px solid transparent',
                  color: tab === 'published' ? '#fff' : '#71717a',
                  padding: '0.65rem 0.5rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Published ({data.published.length})
              </button>
              <button
                onClick={() => setTab('pending')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === 'pending' ? '2px solid #fff' : '2px solid transparent',
                  color: tab === 'pending' ? '#fff' : '#71717a',
                  padding: '0.65rem 0.5rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Pending Approval ({data.pending.length})
              </button>
              <button
                onClick={() => setTab('reports')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === 'reports' ? '2px solid #fff' : '2px solid transparent',
                  color: tab === 'reports' ? '#fff' : '#71717a',
                  padding: '0.65rem 0.5rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Article Reports ({data.reports.length})
              </button>
            </div>

            {/* PUBLISHED TAB */}
            {tab === 'published' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.published.length === 0 ? (
                  <p style={{ color: '#71717a' }}>No published articles yet.</p>
                ) : (
                  data.published.map((art) => (
                    <div key={art.article_id} style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.25rem', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                          <Link to={`/wiki/${art.wiki_slug}`} style={{ color: '#a1a1aa', textDecoration: 'none' }}>
                            {art.wiki_title}
                          </Link>
                        </span>
                        <h3 style={{ margin: '0.2rem 0', fontSize: '1.1rem' }}>{art.title}</h3>
                        <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                          Live Version: v{art.published_version} • {art.read_count} reads
                        </span>
                      </div>
                      <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '0.45rem 0.85rem', borderRadius: 4, textDecoration: 'none', fontSize: '0.8125rem' }}>
                        Read Article →
                      </Link>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PENDING APPROVAL TAB */}
            {tab === 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.pending.length === 0 ? (
                  <p style={{ color: '#71717a' }}>No revisions awaiting confirmation.</p>
                ) : (
                  data.pending.map((rev) => (
                    <div key={rev.version_id} style={{ backgroundColor: '#0d0d0f', border: '1px solid #f59e0b40', padding: '1.25rem', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                          ● Version {rev.version_number} Awaiting Author Confirmation
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                          Submitted {new Date(rev.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 style={{ margin: '0.2rem 0 0.4rem 0', fontSize: '1.1rem' }}>{rev.article_title}</h3>
                      <p style={{ margin: '0 0 0.5rem 0', color: '#a1a1aa', fontSize: '0.85rem' }}>
                        Wiki Space:{' '}
                        <Link to={`/wiki/${rev.wiki_slug}`} style={{ color: '#a855f7', textDecoration: 'none' }}>
                          {rev.wiki_title}
                        </Link>
                      </p>
                      <div style={{ backgroundColor: '#141417', padding: '0.65rem 0.85rem', borderRadius: 4, fontSize: '0.8rem', color: '#d4d4d8' }}>
                        <strong>Edit Summary:</strong> {rev.edit_summary || 'No description provided'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* REPORTS & MODERATION TAB */}
            {tab === 'reports' && (
              <div>
                {/* CONTRIBUTOR STANDING CALLOUT */}
                <div style={{
                  backgroundColor: '#0d0d0f',
                  border: demerits > 0 ? '1px solid #ef444450' : '1px solid #1f1f23',
                  borderRadius: 6,
                  padding: '1rem 1.25rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>Your Contributor Standing</span>
                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: '#a1a1aa' }}>
                      {demerits === 0
                        ? 'Zero demerit points. None of your submitted articles have received confirmed violation penalties.'
                        : 'You have active demerits. Reaching 5 points results in an automatic account ban.'}
                    </p>
                  </div>
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    padding: '0.3rem 0.75rem',
                    borderRadius: 4,
                    backgroundColor: demerits > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: demerits > 0 ? '#ef4444' : '#10b981',
                    border: `1px solid ${demerits > 0 ? '#ef444440' : '#10b98140'}`
                  }}>
                    {demerits} / 5 Demerits
                  </span>
                </div>

                {data.reports.length === 0 ? (
                  <p style={{ color: '#71717a' }}>No moderation reports filed on your revisions.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {data.reports.map((rep) => {
                      const isPending = rep.status === 'pending';
                      const isResolved = rep.status === 'resolved';
                      const reportDemerits = rep.demerit_points ?? (demerits > 0 ? demerits : 0);
                      const isWarningOnly = isResolved && reportDemerits === 0;

                      // Badge configuration based on outcome
                      let badgeText = 'Report Dismissed';
                      let badgeColor = '#10b981';
                      let badgeBg = 'rgba(16, 185, 129, 0.15)';
                      let borderColor = '#10b98140';

                      if (isPending) {
                        badgeText = 'Under Review';
                        badgeColor = '#f59e0b';
                        badgeBg = 'rgba(245, 158, 11, 0.15)';
                        borderColor = '#f59e0b40';
                      } else if (isWarningOnly) {
                        badgeText = 'Resolved with Warning (0 Demerits)';
                        badgeColor = '#34d399';
                        badgeBg = 'rgba(52, 211, 153, 0.12)';
                        borderColor = 'rgba(52, 211, 153, 0.3)';
                      } else if (isResolved) {
                        badgeText = `Violation Confirmed (+${reportDemerits} Demerit${reportDemerits > 1 ? 's' : ''})`;
                        badgeColor = '#ef4444';
                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                        borderColor = 'rgba(239, 68, 68, 0.3)';
                      }

                      return (
                        <div key={rep.report_id} style={{
                          backgroundColor: '#0d0d0f',
                          border: `1px solid ${borderColor}`,
                          padding: '1.25rem',
                          borderRadius: 6
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.55rem',
                              borderRadius: 4,
                              textTransform: 'uppercase',
                              backgroundColor: badgeBg,
                              color: badgeColor,
                              border: `1px solid ${badgeColor}30`
                            }}>
                              {badgeText}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                              Reported on {new Date(rep.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <h4 style={{ margin: '0.35rem 0 0.2rem 0', fontSize: '1.05rem' }}>
                            <Link to={`/wiki/${rep.wiki_slug}/${rep.article_slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                              {rep.article_title}
                            </Link>
                          </h4>
                          <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: 0 }}>
                            <strong>Reason:</strong> {rep.reason}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}