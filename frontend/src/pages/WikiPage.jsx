import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/auth.css';

export default function WikiPage() {
  const { wikiSlug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [wiki, setWiki] = useState(null);
  const [articles, setArticles] = useState([]);
  const [similarWikis, setSimilarWikis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchWikiHub = async () => {
    try {
      const res = await api.get(`/wikis/public/${wikiSlug}`);
      setWiki(res.wiki);
      setArticles(res.articles || []);
      setSimilarWikis(res.similarWikis || []);
    } catch (err) {
      setErrorMsg(err.data?.message || err.message || 'Failed to load wiki space');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWikiHub();
  }, [wikiSlug, user]);

  const handleToggleWikiFollow = async () => {
    if (!user) return navigate('/login');
    try {
      const res = await api.post(`/wikis/${wiki.wiki_id}/follow`);
      setWiki(prev => ({
        ...prev,
        isFollowingWiki: res.following,
        follower_count: res.following ? prev.follower_count + 1 : prev.follower_count - 1
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleCategoryFollow = async () => {
    if (!user) return navigate('/login');
    try {
      const res = await api.post(`/wikis/categories/${wiki.category_id}/follow`);
      setWiki(prev => ({ ...prev, isFollowingCategory: res.following }));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#71717a', padding: '2rem' }}>Loading wiki space...</div>;
  if (errorMsg || !wiki) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '3rem auto', textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444' }}>Wiki Space Not Found</h2>
        <Link to="/" style={{ color: '#a1a1aa' }}>← Return Home</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <main style={{ maxWidth: 1000, margin: '2rem auto', padding: '0 1.5rem' }}>
        {/* BANNER HEADER */}
        <header style={{
          backgroundColor: '#0d0d0f',
          border: '1px solid #1f1f23',
          borderRadius: 8,
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              {wiki.category_name && (
                <button
                  type="button"
                  onClick={handleToggleCategoryFollow}
                  style={{
                    backgroundColor: wiki.isFollowingCategory ? '#27272a' : '#141417',
                    border: '1px solid #3f3f46',
                    color: wiki.isFollowingCategory ? '#10b981' : '#a1a1aa',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 9999,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    marginBottom: '0.5rem'
                  }}
                >
                  Topic: {wiki.category_name} {wiki.isFollowingCategory ? '✓ Following' : '+ Follow'}
                </button>
              )}
              <h1 style={{ fontSize: '2rem', margin: '0.25rem 0' }}>{wiki.title}</h1>
              <p style={{ color: '#a1a1aa', fontSize: '0.95rem', margin: 0, maxWidth: 650 }}>
                {wiki.description || 'A collaborative knowledge space.'}
              </p>
            </div>

            {/* ACTION CONTROLS */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleToggleWikiFollow}
                style={{
                  backgroundColor: wiki.isFollowingWiki ? '#27272a' : '#f4f4f5',
                  color: wiki.isFollowingWiki ? '#f4f4f5' : '#09090b',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0.55rem 1.15rem',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {wiki.isFollowingWiki ? '✓ Following' : '+ Follow Wiki'}
              </button>

              <Link
                to={`/editor?wikiId=${wiki.wiki_id}`}
                className="auth-btn"
                style={{ width: 'auto', padding: '0.55rem 1.15rem', textDecoration: 'none' }}
              >
                + New Article
              </Link>
            </div>
          </div>

          {/* STATS BAR */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '1rem',
            borderTop: '1px solid #1f1f23',
            marginTop: '1.5rem',
            paddingTop: '1.25rem'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#71717a', textTransform: 'uppercase' }}>Articles</span>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.25rem' }}>{wiki.article_count}</h3>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#71717a', textTransform: 'uppercase' }}>Total Reads</span>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.25rem' }}>{wiki.total_views}</h3>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#71717a', textTransform: 'uppercase' }}>Followers</span>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.25rem' }}>{wiki.follower_count}</h3>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#71717a', textTransform: 'uppercase' }}>Authors</span>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.25rem' }}>{wiki.author_count}</h3>
            </div>
          </div>
        </header>

        {/* ARTICLES FEED */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Published Articles ({articles.length})</h2>

          {articles.length === 0 ? (
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '2rem', borderRadius: 6, textAlign: 'center' }}>
              <p style={{ color: '#71717a', margin: '0 0 1rem 0' }}>No articles published in this space yet.</p>
              <Link to={`/editor?wikiId=${wiki.wiki_id}`} className="auth-btn" style={{ width: 'auto', display: 'inline-block' }}>
                Write the First Article
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {articles.map((art) => (
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
                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>
                      <Link to={`/wiki/${wiki.slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                        {art.title}
                      </Link>
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                      v{art.published_version} • {art.read_count} reads • Published {new Date(art.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <Link
                    to={`/wiki/${wiki.slug}/${art.slug}`}
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
                    Read →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SIMILAR WIKIS */}
        {similarWikis.length > 0 && (
          <section>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#a1a1aa' }}>Similar Wiki Spaces</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {similarWikis.map((sw) => (
                <div key={sw.wiki_id} style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1rem', borderRadius: 6 }}>
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem' }}>
                    <Link to={`/wiki/${sw.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                      {sw.title}
                    </Link>
                  </h4>
                  <p style={{ margin: '0 0 0.75rem 0', color: '#71717a', fontSize: '0.8rem' }}>{sw.description}</p>
                  <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                    {sw.article_count} articles • {sw.total_views} views
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}