import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export default function ArticlePage() {
  const { wikiSlug, articleSlug } = useParams();
  const { user } = useAuth();
  
  // 1. Data states
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 2. Report modal states
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportStatus, setReportStatus] = useState({ text: '', type: '' });

  // 3. Bookmark / Reading list states (MUST be declared before early returns)
  const [isBookmarkOpen, setIsBookmarkOpen] = useState(false);
  const [readingLists, setReadingLists] = useState([]);
  const [newListTitle, setNewListTitle] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        const res = await api.get(`/articles/${wikiSlug}/${articleSlug}`);
        setData(res);
      } catch (err) {
        setError(err.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchArticle();
  }, [wikiSlug, articleSlug]);

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    setReportStatus({ text: '', type: '' });
    try {
      const res = await api.post('/reports', {
        article_id: data.article.article_id,
        version_id: data.latestVersion?.version_id,
        reason: reportReason
      });
      setReportStatus({ text: res.message, type: 'success' });
      setTimeout(() => {
        setIsReportOpen(false);
        setReportReason('');
        setReportStatus({ text: '', type: '' });
      }, 1800);
    } catch (err) {
      setReportStatus({ text: err.data?.message || err.message, type: 'error' });
    }
  };

  const loadReadingLists = async () => {
    if (!user || !data?.article?.article_id) return;
    try {
      const res = await api.get(`/reading-lists/article-status/${data.article.article_id}`);
      setReadingLists(res.lists || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleList = async (listId) => {
    try {
      const res = await api.post(`/reading-lists/${listId}/toggle-article`, {
        article_id: data.article.article_id
      });
      setReadingLists(prev => prev.map(l => l.list_id === listId ? { ...l, has_article: res.saved } : l));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    setCreatingList(true);
    try {
      const res = await api.post('/reading-lists', { title: newListTitle.trim(), is_private: true });
      await api.post(`/reading-lists/${res.list.list_id}/toggle-article`, {
        article_id: data.article.article_id
      });
      setNewListTitle('');
      loadReadingLists();
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingList(false);
    }
  };

  // CONDITIONAL RETURNS MUST COME AFTER ALL HOOKS
  if (loading) return <div style={{ color: '#71717a', padding: '2rem' }}>Loading article...</div>;
  if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>{error}</div>;

  const { article, latestVersion } = data;
  const blocks = latestVersion?.content?.blocks || [];
  const isGlobal = ['owner', 'admin'].includes(user?.global_role);
  const canEdit = !article.is_locked || isGlobal;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      {/* REPORT MODAL */}
      {isReportOpen && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-card" style={{ maxWidth: 480 }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>Report Article</h3>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
              Flag inaccurate information, vandalism, or policy violations to the moderators.
            </p>

            {reportStatus.text && (
              <div className={`auth-alert ${reportStatus.type}`} style={{ marginBottom: '1rem' }}>
                {reportStatus.text}
              </div>
            )}

            <form onSubmit={handleSubmitReport}>
              <textarea
                required
                rows={4}
                placeholder="Describe the issue with this revision..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="auth-input"
                style={{ width: '100%', resize: 'vertical', marginBottom: '1rem' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsReportOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#a1a1aa',
                    border: '1px solid #27272a',
                    padding: '0.45rem 1rem',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="auth-btn"
                  style={{ width: 'auto', backgroundColor: '#ef4444', borderColor: '#ef4444' }}
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 800, margin: '2.5rem auto', padding: '0 1.5rem' }}>
        <header style={{ borderBottom: '1px solid #1f1f23', paddingBottom: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                Wiki:{' '}
                <Link to={`/wiki/${article.wiki_slug || wikiSlug}`} style={{ color: '#a855f7', textDecoration: 'none' }}>
                  {article.wiki_title}
                </Link>
              </span>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 700, margin: '0.5rem 0' }}>{article.title}</h1>
            </div>

            {/* ACTION CONTROLS */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {user && (
                <button
                  onClick={() => setIsReportOpen(true)}
                  style={{
                    background: 'none',
                    border: '1px solid #27272a',
                    color: '#71717a',
                    borderRadius: 6,
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                  title="Report Article"
                >
                  🚩
                </button>
              )}

              {user && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => {
                      setIsBookmarkOpen(!isBookmarkOpen);
                      if (!isBookmarkOpen) loadReadingLists();
                    }}
                    style={{
                      background: isBookmarkOpen ? '#27272a' : 'none',
                      border: '1px solid #27272a',
                      color: '#f4f4f5',
                      borderRadius: 6,
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                    title="Save to Reading List"
                  >
                    🔖 Save
                  </button>

                  {/* BOOKMARK POPOVER */}
                  {isBookmarkOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '110%',
                      right: 0,
                      backgroundColor: '#0d0d0f',
                      border: '1px solid #27272a',
                      borderRadius: 8,
                      padding: '1rem',
                      width: 260,
                      zIndex: 50,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>Add to Reading List</span>
                        <button
                          onClick={() => setIsBookmarkOpen(false)}
                          style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1rem' }}
                        >
                          ×
                        </button>
                      </div>

                      <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: '0.75rem' }}>
                        {readingLists.length === 0 ? (
                          <p style={{ color: '#71717a', fontSize: '0.75rem', margin: 0 }}>No lists created yet.</p>
                        ) : (
                          readingLists.map(l => (
                            <label key={l.list_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', cursor: 'pointer', fontSize: '0.8rem', color: '#d4d4d8' }}>
                              <input
                                type="checkbox"
                                checked={Boolean(l.has_article)}
                                onChange={() => handleToggleList(l.list_id)}
                              />
                              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {l.title}
                              </span>
                            </label>
                          ))
                        )}
                      </div>

                      {/* QUICK CREATE LIST */}
                      <form onSubmit={handleCreateList} style={{ borderTop: '1px solid #1f1f23', paddingTop: '0.6rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <input
                            type="text"
                            placeholder="New list name..."
                            value={newListTitle}
                            onChange={(e) => setNewListTitle(e.target.value)}
                            className="auth-input"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                          />
                          <button
                            type="submit"
                            disabled={creatingList || !newListTitle.trim()}
                            className="auth-btn"
                            style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            +
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {!user ? (
                <Link
                  to="/login"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    backgroundColor: '#18181b',
                    color: '#f4f4f5',
                    border: '1px solid #27272a',
                    padding: '0.5rem 0.9rem',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    textDecoration: 'none'
                  }}
                >
                  🔒 Log In to Contribute
                </Link>
              ) : canEdit ? (
                <Link
                  to={`/editor?articleId=${article.article_id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    backgroundColor: '#18181b',
                    color: '#f4f4f5',
                    border: '1px solid #27272a',
                    padding: '0.5rem 0.9rem',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    textDecoration: 'none'
                  }}
                >
                  ✏️ Contribute / Edit
                </Link>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  color: '#ef4444',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 4,
                  padding: '0.4rem 0.75rem'
                }}>
                  🔒 Article Locked
                </span>
              )}
            </div>
          </div>

          <span style={{ fontSize: '0.8rem', color: '#71717a' }}>
            Version {latestVersion?.version_number || 1} • Edited by {latestVersion?.author_name || 'Contributor'} • {article.read_count} views
          </span>
        </header>

        {/* BLOCK RENDERER */}
        <article style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', lineHeight: 1.7 }}>
          {blocks.length === 0 ? (
            <p style={{ color: '#71717a' }}>No content available for this version.</p>
          ) : (
            blocks.map((block) => {
              if (block.type === 'header') {
                return <h2 key={block.id} style={{ fontSize: '1.5rem', marginTop: '1rem' }}>{block.data?.text || block.text}</h2>;
              }
              return <p key={block.id} style={{ fontSize: '1rem', color: '#d4d4d8' }}>{block.data?.text || block.text}</p>;
            })
          )}
        </article>
      </main>
    </div>
  );
}