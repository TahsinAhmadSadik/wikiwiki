import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/auth.css';

export default function HomePage() {
  const { user } = useAuth();

  // Data States
  const [categories, setCategories] = useState([]);
  const [velocityWikis, setVelocityWikis] = useState([]);
  const [topReads, setTopReads] = useState([]);
  const [forYouArticles, setForYouArticles] = useState([]);

  // Teacher Stats Interactive Explorer State (Stat 2 & 3)
  const [statTab, setStatTab] = useState('top-reads'); // 'top-reads' | 'topic-time' | 'cross-topic'
  const [selectedCategory, setSelectedCategory] = useState('');
  const [timeDays, setTimeDays] = useState(30);
  const [topicArticles, setTopicArticles] = useState([]);
  const [crossTopicArticles, setCrossTopicArticles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        const [catRes, velRes, topRes] = await Promise.all([
          api.get('/categories'),
          api.get('/stats/wiki-velocity?limit=4'),
          api.get('/stats/top-reads?limit=6')
        ]);

        setCategories(catRes.categories || []);
        setVelocityWikis(velRes.data || []);
        setTopReads(topRes.data || []);

        if (catRes.categories?.length > 0) {
          setSelectedCategory(String(catRes.categories[0].category_id));
        }

        if (user) {
          const forYouRes = await api.get('/home/for-you');
          setForYouArticles(forYouRes.articles || []);
        }
      } catch (err) {
        setErrorMsg(err.data?.message || err.message || 'Failed to load explore feed.');
      } finally {
        setLoading(false);
      }
    };

    fetchLandingData();
  }, [user]);

  // Fetch Topic Performance (Stat 2) when category or days toggle changes
  useEffect(() => {
    if (statTab === 'topic-time' && selectedCategory) {
      api.get(`/stats/topic-performance?category_id=${selectedCategory}&days=${timeDays}&limit=6`)
        .then((res) => setTopicArticles(res.data || []))
        .catch((err) => console.error(err));
    }
  }, [statTab, selectedCategory, timeDays]);

  // Fetch Cross Topic Leaderboard (Stat 3) when days toggle changes
  useEffect(() => {
    if (statTab === 'cross-topic') {
      api.get(`/stats/cross-topic-leaderboard?days=${timeDays}&rank_limit=2`)
        .then((res) => setCrossTopicArticles(res.data || []))
        .catch((err) => console.error(err));
    }
  }, [statTab, timeDays]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <main style={{ maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem' }}>
        {errorMsg && <div className="auth-alert error" style={{ marginBottom: '1.5rem' }}>{errorMsg}</div>}

        {/* 1. HERO BANNER */}
        <section style={{
          padding: '3rem 2rem',
          backgroundColor: '#0d0d0f',
          border: '1px solid #1f1f23',
          borderRadius: 8,
          marginBottom: '2.5rem',
          textAlign: 'center'
        }}>
          <span style={{ fontSize: '0.8rem', color: '#a855f7', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Collaborative Knowledge Repository
          </span>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0.5rem 0 1rem 0' }}>
            Discover, Author, and Curate Wikis
          </h1>
          <p style={{ color: '#a1a1aa', maxWidth: 650, margin: '0 auto 1.75rem auto', fontSize: '1rem', lineHeight: 1.6 }}>
            Explore verified community articles, follow dynamic subject spaces, or contribute versioned improvements across topics.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link to={user ? "/editor" : "/login"} className="auth-btn" style={{ width: 'auto', padding: '0.6rem 1.5rem', textDecoration: 'none' }}>
              {user ? "+ Write an Article" : "Get Started"}
            </Link>
            <a href="#stats-section" style={{
              backgroundColor: '#18181b',
              color: '#f4f4f5',
              border: '1px solid #27272a',
              borderRadius: 6,
              padding: '0.6rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center'
            }}>
              View Platform Stats ↓
            </a>
          </div>

          {/* Root Categories Pill Bar */}
          {categories.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginTop: '2rem' }}>
              {categories.slice(0, 10).map((cat) => (
                <span key={cat.category_id} style={{
                  fontSize: '0.75rem',
                  backgroundColor: '#141417',
                  border: '1px solid #27272a',
                  color: '#d4d4d8',
                  padding: '0.25rem 0.75rem',
                  borderRadius: 9999
                }}>
                  {cat.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 2. STAT 4: TRENDING WIKI SPACES (VELOCITY) */}
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Trending Wiki Spaces</h2>
              <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Ranked by view velocity and community followers</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {velocityWikis.map((wiki) => (
              <div key={wiki.wiki_id} style={{
                backgroundColor: '#0d0d0f',
                border: '1px solid #1f1f23',
                borderRadius: 6,
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                            <Link 
                            to={`/wiki/${wiki.slug}`} 
                            style={{ color: '#fff', textDecoration: 'none' }}
                            >
                            {wiki.title}
                            </Link>
                        </h3>
                        <span style={{ fontSize: '0.7rem', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>
                            ⚡ {wiki.velocity_score}
                        </span>
                    </div>
                  <p style={{ color: '#71717a', fontSize: '0.825rem', margin: '0.5rem 0 1rem 0' }}>
                    {wiki.description || 'No description available'}
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#a1a1aa', borderTop: '1px solid #1f1f23', paddingTop: '0.75rem' }}>
                  <span>{wiki.total_articles} Articles</span>
                  <span>{wiki.total_views} Reads</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. TEACHER'S STATS HUB (Stats 1, 2, and 3) */}
        <section id="stats-section" style={{
          backgroundColor: '#0d0d0f',
          border: '1px solid #1f1f23',
          borderRadius: 8,
          padding: '1.75rem',
          marginBottom: '3rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', margin: '0 0 0.25rem 0' }}>Analytical Metrics Hub</h2>
              <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Database functions & window queries</span>
            </div>

            {/* Metric Switcher Tabs */}
            <div style={{ display: 'flex', backgroundColor: '#141417', borderRadius: 6, padding: '0.2rem', border: '1px solid #27272a' }}>
              <button
                onClick={() => setStatTab('top-reads')}
                style={{
                  background: statTab === 'top-reads' ? '#27272a' : 'transparent',
                  color: statTab === 'top-reads' ? '#fff' : '#a1a1aa',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Top Reads (Stat 1)
              </button>
              <button
                onClick={() => setStatTab('topic-time')}
                style={{
                  background: statTab === 'topic-time' ? '#27272a' : 'transparent',
                  color: statTab === 'topic-time' ? '#fff' : '#a1a1aa',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Topic vs Time (Stat 2)
              </button>
              <button
                onClick={() => setStatTab('cross-topic')}
                style={{
                  background: statTab === 'cross-topic' ? '#27272a' : 'transparent',
                  color: statTab === 'cross-topic' ? '#fff' : '#a1a1aa',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Cross-Topic Matrix (Stat 3)
              </button>
            </div>
          </div>

          {/* STAT 1: ALL TIME TOP READS */}
          {statTab === 'top-reads' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {topReads.map((art, idx) => (
                <div key={art.article_id} style={{ backgroundColor: '#141417', border: '1px solid #27272a', padding: '1rem', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 600 }}>#{idx + 1} Most Read</span>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>{art.read_count} views</span>
                  </div>
                  <h4 style={{ margin: '0.35rem 0', fontSize: '1.05rem' }}>
                    <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                      {art.title}
                    </Link>
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                    {art.wiki_title} • {art.category_name || 'General'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* STAT 2: TOPIC OVER TIME (USES UDF) */}
          {statTab === 'topic-time' && (
            <div>
              {/* Controls: Topic Picker and Time Period Toggle */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="auth-input"
                  style={{ maxWidth: 250, backgroundColor: '#09090b' }}
                >
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>{c.name}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {[
                    { label: 'Past 7 Days', val: 7 },
                    { label: 'Past 30 Days', val: 30 },
                    { label: 'All-Time', val: 0 }
                  ].map((p) => (
                    <button
                      key={p.val}
                      onClick={() => setTimeDays(p.val)}
                      style={{
                        backgroundColor: timeDays === p.val ? '#3b82f6' : '#18181b',
                        color: timeDays === p.val ? '#fff' : '#a1a1aa',
                        border: '1px solid #27272a',
                        padding: '0.35rem 0.75rem',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {topicArticles.length === 0 ? (
                <p style={{ color: '#71717a', margin: 0 }}>No published articles found in this category for the selected time window.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {topicArticles.map((art) => (
                    <div key={art.article_id} style={{ backgroundColor: '#141417', border: '1px solid #27272a', padding: '1rem', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>{art.category_name}</span>
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>{art.read_count} views</span>
                      </div>
                      <h4 style={{ margin: '0.35rem 0', fontSize: '1.05rem' }}>
                        <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {art.title}
                        </Link>
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>v{art.published_version} • {art.wiki_title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STAT 3: CROSS TOPIC LEADERBOARD (WINDOW FUNCTION) */}
          {statTab === 'cross-topic' && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>Time Horizon:</span>
                {[
                  { label: 'Past 30 Days', val: 30 },
                  { label: 'Past 90 Days', val: 90 },
                  { label: 'All-Time', val: 0 }
                ].map((p) => (
                  <button
                    key={p.val}
                    onClick={() => setTimeDays(p.val)}
                    style={{
                      backgroundColor: timeDays === p.val ? '#10b981' : '#18181b',
                      color: timeDays === p.val ? '#fff' : '#a1a1aa',
                      border: '1px solid #27272a',
                      padding: '0.35rem 0.75rem',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {crossTopicArticles.length === 0 ? (
                <p style={{ color: '#71717a', margin: 0 }}>No rankings available for this time window.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {crossTopicArticles.map((art) => (
                    <div key={art.article_id} style={{ backgroundColor: '#141417', border: '1px solid #27272a', padding: '1rem', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                          #{art.category_rank} in {art.category_name}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>{art.read_count} reads</span>
                      </div>
                      <h4 style={{ margin: '0.35rem 0', fontSize: '1.05rem' }}>
                        <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {art.title}
                        </Link>
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>{art.wiki_title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 4. "FOR YOU" FEED (MODULE 01) */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.35rem', margin: '0 0 1rem 0' }}>For You: Recommended Articles</h2>

          {!user ? (
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '2rem', borderRadius: 6, textAlign: 'center' }}>
              <p style={{ color: '#a1a1aa', margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
                Log in and follow topics or wiki spaces to build your personalized knowledge feed.
              </p>
              <Link to="/login" className="auth-btn" style={{ width: 'auto', display: 'inline-block', padding: '0.45rem 1.25rem' }}>
                Log In to Personalize
              </Link>
            </div>
          ) : forYouArticles.length === 0 ? (
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '2rem', borderRadius: 6, textAlign: 'center' }}>
              <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>
                You haven't followed any categories or wiki spaces yet. Follow some from your Settings or explore the topics above!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {forYouArticles.map((art) => (
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
                    <span style={{ fontSize: '0.75rem', color: '#a855f7' }}>
                        {art.category_name} •{' '}
                        <Link 
                            to={`/wiki/${art.wiki_slug}`} 
                            style={{ color: '#a855f7', textDecoration: 'underline' }}
                        >
                            {art.wiki_title}
                        </Link>
                    </span>
                    <h3 style={{ margin: '0.2rem 0', fontSize: '1.15rem' }}>
                      <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                        {art.title}
                      </Link>
                    </h3>
                    <p style={{ margin: 0, color: '#a1a1aa', fontSize: '0.85rem' }}>{art.excerpt}</p>
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
                    Read →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}