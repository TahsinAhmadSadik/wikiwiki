import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import WikiHoverCard from '../components/WikiHoverCard';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function parseArticleContent(text, currentWikiSlug) {
  if (!text || typeof text !== 'string') return text;

  // Match both [[Wiki Link]] and [Markdown Link](url)
  const tokenRegex = /(\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // 1. Double Bracket Wiki Syntax: [[Title]] or [[Target|Display Label]]
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2).trim();
      let target = inner;
      let label = inner;

      if (inner.includes('|')) {
        const split = inner.split('|');
        target = split[0].trim();
        label = split[1].trim();
      }

      return (
        <WikiHoverCard
          key={`wl-${index}`}
          target={target}
          currentWiki={currentWikiSlug}
        >
          {label}
        </WikiHoverCard>
      );
    }

    // 2. Standard Markdown Link Syntax: [Label](url)
    const mdMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (mdMatch) {
      const label = mdMatch[1];
      const href = mdMatch[2].trim();

      const wikiPathMatch = href.match(/\/wiki\/([^\/\s#?]+)\/([^\/\s#?]+)/);
      if (wikiPathMatch) {
        const targetWiki = wikiPathMatch[1];
        const targetSlug = wikiPathMatch[2];

        return (
          <WikiHoverCard
            key={`md-${index}`}
            target={`${targetWiki}/${targetSlug}`}
            currentWiki={currentWikiSlug}
            fallbackHref={href}
          >
            {label}
          </WikiHoverCard>
        );
      }

      // External or standard web link
      if (href.startsWith('http') || href.startsWith('//')) {
        return (
          <a
            key={`ext-${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#38bdf8', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            {label} ↗
          </a>
        );
      }

      // Relative path or local slug
      const localTarget = href.replace(/^\/+/, '').split(/[?#]/)[0];
      return (
        <WikiHoverCard
          key={`loc-${index}`}
          target={localTarget}
          currentWiki={currentWikiSlug}
          fallbackHref={href}
        >
          {label}
        </WikiHoverCard>
      );
    }

    return part;
  });
}

export default function ArticlePage() {
  const { wikiSlug, articleSlug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportStatus, setReportStatus] = useState({ text: '', type: '' });

  const [isBookmarkOpen, setIsBookmarkOpen] = useState(false);
  const [readingLists, setReadingLists] = useState([]);
  const [newListTitle, setNewListTitle] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lockStatusMsg, setLockStatusMsg] = useState('');

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
      }, 1000);
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
      setReadingLists((prev) =>
        prev.map((l) => (l.list_id === listId ? { ...l, has_article: res.saved } : l))
      );
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

  const handleToggleLock = async () => {
    try {
      const res = await api.patch(`/articles/${data.article.article_id}/lock`);
      setData((prev) => ({
        ...prev,
        article: { ...prev.article, is_locked: res.is_locked }
      }));
      setLockStatusMsg(res.message);
      setTimeout(() => setLockStatusMsg(''), 3000);
    } catch (err) {
      alert(err.data?.message || err.message || 'Failed to update lock status');
    }
  };

  const handleDeleteArticle = async () => {
    setDeleting(true);
    try {
      await api.delete(`/articles/${data.article.article_id}`);
      navigate(`/wiki/${data.article.wiki_slug || wikiSlug}`);
    } catch (err) {
      alert(err.data?.message || err.message || 'Failed to delete article');
      setDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  const formatImageUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${API_BASE}${url}`;
  };

  if (loading) return <div style={{ color: '#71717a', padding: '2rem' }}>Loading article...</div>;
  if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>{error}</div>;

  const { article, latestVersion } = data;
  const blocks = latestVersion?.content?.blocks || [];
  const isGlobal = ['owner', 'admin'].includes(user?.global_role);
  const isAuthorOrCoAuthor = ['author', 'co_author'].includes(article.userRole);
  const canManageArticle = isGlobal || isAuthorOrCoAuthor;
  const canEdit = !article.is_locked || canManageArticle;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      {/* CONFIRM DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-card" style={{ maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#ef4444' }}>
              Delete Article Permanently?
            </h3>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              Are you sure you want to delete <strong>"{article.title}"</strong>? This will permanently remove all revision histories, link dependencies, moderation reports, and bookmarked list entries.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setIsDeleteModalOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#a1a1aa',
                  border: '1px solid #27272a',
                  padding: '0.45rem 1rem',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteArticle}
                className="auth-btn"
                style={{ width: 'auto', backgroundColor: '#ef4444', borderColor: '#ef4444', padding: '0.45rem 1.25rem' }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Article'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      <main style={{ maxWidth: 840, margin: '2.5rem auto', padding: '0 1.5rem' }}>
        {lockStatusMsg && (
          <div className="auth-alert success" style={{ marginBottom: '1.5rem' }}>
            {lockStatusMsg}
          </div>
        )}

        <header style={{ borderBottom: '1px solid #1f1f23', paddingBottom: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
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
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {canManageArticle && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleLock}
                    style={{
                      background: article.is_locked ? 'rgba(239, 68, 68, 0.15)' : '#18181b',
                      border: article.is_locked ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid #27272a',
                      color: article.is_locked ? '#ef4444' : '#a1a1aa',
                      borderRadius: 6,
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                    title={article.is_locked ? 'Unlock Article' : 'Lock Article'}
                  >
                    {article.is_locked ? '🔒 Locked' : '🔓 Lock'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      borderRadius: 6,
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                    title="Delete Article"
                  >
                    🗑️
                  </button>
                </>
              )}

              {user && (
                <button
                  type="button"
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

              {/* SAVE / BOOKMARK */}
              {user && (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
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
                          type="button"
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
                          readingLists.map((l) => (
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

              {/* EDIT / CONTRIBUTE */}
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

        {/* CONTENT BLOCK RENDERER */}
        <article style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', lineHeight: 1.75 }}>
          {blocks.length === 0 ? (
            <p style={{ color: '#71717a' }}>No content available for this version.</p>
          ) : (
            blocks.map((block, i) => {
              const key = block.id || i;

              // 1. Heading block
              if (block.type === 'header') {
                return (
                  <h2 key={key} style={{ fontSize: '1.55rem', fontWeight: 600, marginTop: '1rem', color: '#fff' }}>
                    {parseArticleContent(block.data?.text || block.text, article.wiki_slug || wikiSlug)}
                  </h2>
                );
              }

              // 2. Image block
              if (block.type === 'image') {
                const imgUrl = block.data?.url || block.url;
                if (!imgUrl) return null;

                return (
                  <figure key={key} style={{ margin: '1rem 0', textAlign: 'center' }}>
                    <img
                      src={formatImageUrl(imgUrl)}
                      alt={block.data?.caption || 'Article media illustration'}
                      style={{
                        maxWidth: '100%',
                        borderRadius: 8,
                        border: '1px solid #27272a',
                        backgroundColor: '#0a0a0c',
                        maxHeight: 520,
                        objectFit: 'contain'
                      }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    {block.data?.caption && (
                      <figcaption style={{ fontSize: '0.825rem', color: '#a1a1aa', marginTop: '0.5rem', fontStyle: 'italic' }}>
                        {parseArticleContent(block.data.caption, article.wiki_slug || wikiSlug)}
                      </figcaption>
                    )}
                  </figure>
                );
              }

              // 3. Paragraph block with Wiki link & Hover Card resolution
              return (
                <p key={key} style={{ fontSize: '1.05rem', color: '#d4d4d8', margin: 0 }}>
                  {parseArticleContent(block.data?.text || block.text, article.wiki_slug || wikiSlug)}
                </p>
              );
            })
          )}
        </article>
      </main>
    </div>
  );
}