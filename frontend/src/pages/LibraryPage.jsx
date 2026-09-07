import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../services/api';
import '../styles/auth.css';

export default function LibraryPage() {
  const [tab, setTab] = useState('published');
  const [data, setData] = useState({ published: [], pending: [], reports: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const res = await api.get('/studio/library');
        setData(res);
      } catch (err) {
        console.error('Failed to load library:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLibrary();
  }, []);

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

        {/* Tabs */}
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

        {loading ? (
          <div style={{ color: '#71717a' }}>Loading library...</div>
        ) : (
          <div>
            {/* PUBLISHED TAB */}
            {tab === 'published' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.published.length === 0 ? (
                  <p style={{ color: '#71717a' }}>No published articles yet.</p>
                ) : (
                  data.published.map((art) => (
                    <div key={art.article_id} style={{
                      backgroundColor: '#0d0d0f',
                      border: '1px solid #1f1f23',
                      padding: '1.25rem',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>{art.wiki_title}</span>
                        <h3 style={{ margin: '0.2rem 0', fontSize: '1.1rem' }}>{art.title}</h3>
                        <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
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
                          fontSize: '0.8125rem'
                        }}
                      >
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
                    <div key={rev.version_id} style={{
                      backgroundColor: '#0d0d0f',
                      border: '1px solid #f59e0b40',
                      padding: '1.25rem',
                      borderRadius: 6
                    }}>
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
                        Wiki Space: {rev.wiki_title}
                      </p>
                      <div style={{ backgroundColor: '#141417', padding: '0.65rem 0.85rem', borderRadius: 4, fontSize: '0.8rem', color: '#d4d4d8' }}>
                        <strong>Edit Summary:</strong> {rev.edit_summary || 'No description provided'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* REPORTS TAB */}
            {tab === 'reports' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.reports.length === 0 ? (
                  <p style={{ color: '#71717a' }}>No moderation reports on your articles.</p>
                ) : (
                  data.reports.map((rep) => (
                    <div key={rep.report_id} style={{
                      backgroundColor: '#0d0d0f',
                      border: '1px solid #1f1f23',
                      padding: '1.25rem',
                      borderRadius: 6
                    }}>
                      <span style={{
                        fontSize: '0.75rem',
                        color: rep.status === 'pending' ? '#ef4444' : '#10b981',
                        textTransform: 'uppercase'
                      }}>
                        [{rep.status}]
                      </span>
                      <h4 style={{ margin: '0.25rem 0' }}>Article: {rep.article_title}</h4>
                      <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: 0 }}>Reason: {rep.reason}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}