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

  const [readingLists, setReadingLists] = useState([]);
  const [activeListDetail, setActiveListDetail] = useState(null);
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  const fallbackAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(user?.username || 'WikiUser')}`;
  const avatarSrc = user?.profile_pic_url || fallbackAvatar;

  const fetchLibrary = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
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
        if (updateUser) updateUser(meRes.user);
      }
    } catch (err) {
      setErrorMsg(err.data?.message || err.message || 'Failed to load library resources.');
    } finally {
      setLoading(false);
    }

    try {
      const listsRes = await api.get('/reading-lists');
      setReadingLists(listsRes.lists || []);
    } catch (err) {
      console.error('Failed to load reading lists:', err);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [user?.user_id]);

  const handleCreateCollection = async (e) => {
    e.preventDefault();
    if (!newCollectionTitle.trim()) return;
    setCreatingList(true);
    try {
      const res = await api.post('/reading-lists', { title: newCollectionTitle.trim() });
      setReadingLists([res.list, ...readingLists]);
      setNewCollectionTitle('');
    } catch (err) {
      setErrorMsg(err.data?.message || err.message || 'Failed to create reading list.');
    } finally {
      setCreatingList(false);
    }
  };

  const handleOpenList = async (listId) => {
    try {
      const res = await api.get(`/reading-lists/${listId}`);
      setActiveListDetail(res);
    } catch (err) {
      setErrorMsg(err.data?.message || err.message || 'Failed to load list details.');
    }
  };

  const handleDeleteList = async (listId) => {
    try {
      await api.delete(`/reading-lists/${listId}`);
      setReadingLists((prev) => prev.filter((l) => l.list_id !== listId));
      if (activeListDetail?.list?.list_id === listId) setActiveListDetail(null);
    } catch (err) {
      setErrorMsg(err.data?.message || err.message || 'Failed to delete reading list.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <main style={{ maxWidth: 1000, margin: '2rem auto', padding: '0 1.5rem' }}>
        {/* STUDIO HEADER WITH AVATAR */}
        <header style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {user && (
            <img
              src={avatarSrc}
              alt={user.username}
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                objectFit: 'cover',
                backgroundColor: '#141417',
                border: '2px solid rgba(168, 85, 247, 0.45)',
                boxShadow: '0 4px 16px rgba(168, 85, 247, 0.15)',
                flexShrink: 0
              }}
              onError={(e) => { e.currentTarget.src = fallbackAvatar; }}
            />
          )}

          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>{user.username}'s Library</h1>
            <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>
              Manage your authored articles, pending reviews, moderation standing, and reading lists.
            </p>
          </div>
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
              Log in to view your authored publications, draft revisions, reading lists, and wiki spaces.
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
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #1f1f23', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setTab('published'); setActiveListDetail(null); }}
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
                onClick={() => { setTab('pending'); setActiveListDetail(null); }}
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
                onClick={() => { setTab('reports'); setActiveListDetail(null); }}
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
              <button
                onClick={() => { setTab('lists'); setActiveListDetail(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === 'lists' ? '2px solid #a855f7' : '2px solid transparent',
                  color: tab === 'lists' ? '#fff' : '#71717a',
                  padding: '0.65rem 0.5rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Reading Lists ({readingLists.length})
              </button>
            </div>

            {/* TAB 1: PUBLISHED ARTICLES */}
            {tab === 'published' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.published.length === 0 ? (
                  <p style={{ color: '#71717a' }}>No published articles yet.</p>
                ) : (
                  data.published.map((art) => (
                    <div
                      key={art.article_id}
                      style={{
                        backgroundColor: '#0d0d0f',
                        border: '1px solid #1f1f23',
                        padding: '1.15rem 1.25rem',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1.25rem'
                      }}
                    >
                      <div style={{
                        width: 75,
                        height: 75,
                        borderRadius: 6,
                        backgroundColor: '#141417',
                        border: '1px solid #27272a',
                        flexShrink: 0,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {art.thumbnail_url ? (
                          <img
                            src={art.thumbnail_url}
                            alt={art.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <span style={{ fontSize: '1.5rem', color: '#3f3f46' }}>📄</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                          <Link to={`/wiki/${art.wiki_slug}`} style={{ color: '#a1a1aa', textDecoration: 'none' }}>
                            {art.wiki_title}
                          </Link>
                        </span>
                        <h3 style={{ margin: '0.2rem 0', fontSize: '1.1rem' }}>{art.title}</h3>

                        <p style={{
                          margin: '0.25rem 0 0.5rem 0',
                          color: '#a1a1aa',
                          fontSize: '0.85rem',
                          lineHeight: 1.45,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {art.description || 'No description available.'}
                        </p>

                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                          Live Version: v{art.published_version} • {art.read_count} reads
                        </span>
                      </div>

                      <Link
                        to={`/wiki/${art.wiki_slug}/${art.slug}`}
                        style={{
                          backgroundColor: '#18181b',
                          color: '#fff',
                          border: '1px solid #27272a',
                          padding: '0.45rem 0.85rem',
                          borderRadius: 4,
                          textDecoration: 'none',
                          fontSize: '0.8125rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Read Article →
                      </Link>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: PENDING APPROVAL */}
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

            {/* TAB 3: ARTICLE REPORTS */}
            {tab === 'reports' && (
              <div>
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

            {/* TAB 4: READING LISTS */}
            {tab === 'lists' && (
              <div>
                <form onSubmit={handleCreateCollection} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <input
                    type="text"
                    required
                    placeholder="Create a new reading collection..."
                    value={newCollectionTitle}
                    onChange={(e) => setNewCollectionTitle(e.target.value)}
                    className="auth-input"
                    style={{ flex: 1 }}
                  />
                  <button type="submit" disabled={creatingList} className="auth-btn" style={{ width: 'auto', padding: '0.6rem 1.25rem' }}>
                    {creatingList ? 'Creating...' : '+ New List'}
                  </button>
                </form>

                {activeListDetail && (
                  <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #a855f750', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 600 }}>Viewing Collection</span>
                        <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.2rem' }}>{activeListDetail.list.title}</h3>
                      </div>
                      <button
                        onClick={() => setActiveListDetail(null)}
                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                        ✕ Close
                      </button>
                    </div>

                    {activeListDetail.articles.length === 0 ? (
                      <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>No articles added to this list yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activeListDetail.articles.map((art) => (
                          <div key={art.article_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#141417', padding: '0.65rem 0.85rem', borderRadius: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {art.thumbnail_url && (
                                <img
                                  src={art.thumbnail_url}
                                  alt={art.title}
                                  style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }}
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                              <div>
                                <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
                                  {art.title}
                                </Link>
                                <span style={{ fontSize: '0.75rem', color: '#71717a', marginLeft: '0.75rem' }}>
                                  {art.wiki_title} • {art.read_count} views
                                </span>
                              </div>
                            </div>
                            <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ fontSize: '0.75rem', color: '#a855f7', textDecoration: 'none' }}>
                              Read →
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {readingLists.length === 0 ? (
                  <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '2.5rem', borderRadius: 6, textAlign: 'center' }}>
                    <p style={{ color: '#71717a', margin: 0 }}>No reading lists created yet. Create one above or bookmark an article!</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                    {readingLists.map((l) => (
                      <div key={l.list_id} style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', borderRadius: 6, padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: l.is_private ? '#71717a' : '#10b981' }}>
                              {l.is_private ? '🔒 Private' : '🌐 Public'}
                            </span>
                            <button
                              onClick={() => handleDeleteList(l.list_id)}
                              style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '0.8rem' }}
                              title="Delete List"
                            >
                              🗑
                            </button>
                          </div>
                          <h3 style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '1.1rem' }}>{l.title}</h3>
                          <p style={{ color: '#71717a', fontSize: '0.8rem', margin: 0 }}>
                            {l.article_count} {l.article_count === 1 ? 'article' : 'articles'} saved
                          </p>
                        </div>

                        <button
                          onClick={() => handleOpenList(l.list_id)}
                          style={{
                            marginTop: '1rem',
                            backgroundColor: '#18181b',
                            color: '#fff',
                            border: '1px solid #27272a',
                            borderRadius: 4,
                            padding: '0.45rem',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                        >
                          View Saved Articles →
                        </button>
                      </div>
                    ))}
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