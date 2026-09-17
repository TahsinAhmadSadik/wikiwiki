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

  if (loading) return <div style={{ color: '#71717a', padding: '2rem' }}>Loading article...</div>;
  if (error) return <div style={{ color: '#ef4444', padding: '2rem' }}>{error}</div>;

  const { article, latestVersion } = data;
  const blocks = latestVersion?.content?.blocks || [];
  const isGlobal = ['owner', 'admin'].includes(user?.global_role);
  const canEdit = !article.is_locked || isGlobal;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <main style={{ maxWidth: 800, margin: '2.5rem auto', padding: '0 1.5rem' }}>
        <header style={{ borderBottom: '1px solid #1f1f23', paddingBottom: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
                Wiki:{' '}
                <Link 
                  to={`/wiki/${article.wiki_slug || wikiSlug}`} 
                  style={{ color: '#a855f7', textDecoration: 'none', fontWeight: 500 }}
                >
                  {article.wiki_title}
                </Link>
              </span>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 700, margin: '0.5rem 0' }}>{article.title}</h1>
            </div>

            {/* CONTRIBUTE / EDIT / LOGIN BUTTON */}
            <div>
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