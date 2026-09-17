import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export default function ArticlePage() {
  const { wikiSlug, articleSlug } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Report Modal State
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportStatus, setReportStatus] = useState({ text: '', type: '' });

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