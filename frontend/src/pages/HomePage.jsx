import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/auth.css';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';


const PIE_COLORS = [
  '#a855f7',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#8b5cf6'
];

export default function HomePage() {
  const { user } = useAuth();

  // Data States
  const [categories, setCategories] = useState([]);
  const [velocityWikis, setVelocityWikis] = useState([]);
  const [topReads, setTopReads] = useState([]);
  const [forYouArticles, setForYouArticles] = useState([]);

  // Analytical Explorer State (Stats 1, 2, and 3)
  const [statTab, setStatTab] = useState('top-reads');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [timeDays, setTimeDays] = useState(30);
  const [topicArticles, setTopicArticles] = useState([]);
  const [crossTopicArticles, setCrossTopicArticles] = useState([]);

  //pie chart 
  const [topicReadDistribution, setTopicReadDistribution] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [followedCategories, setFollowedCategories] = useState([]);
  const [followedWikis, setFollowedWikis] = useState([]);
    const pieData =
  topicReadDistribution.length <= 7
    ? topicReadDistribution
    : [
        ...topicReadDistribution.slice(0, 7),
        {
          category_name: 'Others',
          total_reads: topicReadDistribution
            .slice(7)
            .reduce((sum, item) => sum + Number(item.total_reads), 0)
        }
      ];


  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        const [catRes, velRes, topRes, distributionRes] = await Promise.all([
          api.get('/categories'),
          api.get('/stats/wiki-velocity?limit=4'),
          api.get('/stats/top-reads?limit=6'),
          api.get('/stats/topic-read-distribution')
        ]);
        setCategories(catRes.categories || []);
        setVelocityWikis(velRes.data || []);
        setTopReads(topRes.data || []);
        setTopicReadDistribution(distributionRes.data || []);

        if (catRes.categories?.length > 0) {
          setSelectedCategory(String(catRes.categories[0].category_id));
        }

        if (user) {
          const forYouRes = await api.get('/home/for-you');
          setForYouArticles(forYouRes.articles || []);
          setFollowedCategories(forYouRes.followedCategories || []);
          setFollowedWikis(forYouRes.followedWikis || []);
        }
      } catch (err) {
        setErrorMsg(err.data?.message || err.message || 'Failed to load explore feed.');
      } finally {
        setLoading(false);
      }
    };

    fetchLandingData();
  }, [user]);

  useEffect(() => {
    if (statTab === 'topic-time' && selectedCategory) {
      api.get(`/stats/topic-performance?category_id=${selectedCategory}&days=${timeDays}&limit=6`)
        .then((res) => setTopicArticles(res.data || []))
        .catch((err) => console.error(err));
    }
  }, [statTab, selectedCategory, timeDays]);

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

        {/* 2. STAT 4: TRENDING WIKI SPACES (WITH COVERS) */}
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Trending Wiki Spaces</h2>
              <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Ranked by view velocity and community followers</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
            {velocityWikis.map((wiki) => (
              <div key={wiki.wiki_id} style={{
                backgroundColor: '#0d0d0f',
                border: '1px solid #1f1f23',
                borderRadius: 8,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  {/* Wiki Card Cover */}
                  <div style={{
                    height: 100,
                    width: '100%',
                    backgroundColor: '#141417',
                    backgroundImage: wiki.cover_image_url ? `url(${wiki.cover_image_url})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderBottom: '1px solid #1f1f23',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {!wiki.cover_image_url && <span style={{ color: '#3f3f46', fontSize: '1.75rem' }}>📚</span>}
                  </div>

                  <div style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                        <Link to={`/wiki/${wiki.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {wiki.title}
                        </Link>
                      </h3>
                      <span style={{ fontSize: '0.7rem', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>
                        ⚡ {wiki.velocity_score}
                      </span>
                    </div>
                    <p style={{
                      color: '#71717a',
                      fontSize: '0.825rem',
                      margin: '0.25rem 0 0.75rem 0',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {wiki.description || 'No description available'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#a1a1aa', borderTop: '1px solid #1f1f23', padding: '0.75rem 1rem' }}>
                  <span>{wiki.total_articles} Articles</span>
                  <span>{wiki.total_views} Reads</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. TEACHER'S STATS HUB */}
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

            <div style={{ display: 'flex', backgroundColor: '#141417', borderRadius: 6, padding: '0.2rem', border: '1px solid #27272a' }}>
              <button
                type="button"
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
                type="button"
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
                type="button"
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
              <button
                type="button"
                onClick={() => setStatTab('topic-distribution')}
                style={{
                  background: statTab === 'topic-distribution' ? '#27272a' : 'transparent',
                  color: statTab === 'topic-distribution' ? '#fff' : '#a1a1aa',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Readership Distribution (Stat 4)
              </button>
            </div>
          </div>

          {/* STAT 1: TOP READS */}
          {statTab === 'top-reads' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {topReads.map((art, idx) => (
                <div key={art.article_id} style={{ backgroundColor: '#141417', border: '1px solid #27272a', padding: '1rem', borderRadius: 6, display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                  {art.thumbnail_url && (
                    <img
                      src={art.thumbnail_url}
                      alt={art.title}
                      style={{ width: 55, height: 55, borderRadius: 6, objectFit: 'cover', flexShrink: 0, backgroundColor: '#09090b' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#a855f7', fontWeight: 600 }}>#{idx + 1} Most Read</span>
                      <span style={{ fontSize: '0.75rem', color: '#71717a' }}>{art.read_count} views</span>
                    </div>
                    <h4 style={{ margin: '0.25rem 0', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                        {art.title}
                      </Link>
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                      {art.wiki_title} • {art.category_name || 'General'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* STAT 2: TOPIC OVER TIME */}
          {statTab === 'topic-time' && (
            <div>
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
                      type="button"
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

          {/* STAT 3: CROSS TOPIC LEADERBOARD */}
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
                    type="button"
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
          {/* STAT 4: READERSHIP DISTRIBUTION */}
          {statTab === 'topic-distribution' && (
            <div>
              <h3 style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.1rem'
              }}>
                Readership Distribution by Topic
              </h3>

              <p style={{
                color: '#71717a',
                fontSize: '0.8rem',
                marginBottom: '1rem'
              }}>
                Percentage of total article reads contributed by each topic.
              </p>

              {topicReadDistribution.length === 0 ? (
                <p style={{
                  color: '#71717a',
                  margin: 0
                }}>
                  No readership data available.
                </p>
              ) : (
                <div style={{
                  width: '100%',
                  height: 400
                }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="total_reads"
                        nameKey="category_name"
                        cx="50%"
                        cy="50%"
                        outerRadius={130}
                        label={({ category_name, percent }) =>
                          `${category_name} ${(percent * 100).toFixed(1)}%`
                        }
                      >
                        {topicReadDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>

                      <Tooltip
                        formatter={(value) => [`${value} reads`, 'Total Reads']}
                      />

                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}







        </section>

        {/* 4. "FOR YOU" FEED (WITH ARTICLE THUMBNAILS) */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.35rem', margin: '0 0 1rem 0' }}>For You: Recommended Articles</h2>

          {user && (
            <div style={{
              backgroundColor: '#0d0d0f',
              border: '1px solid #1f1f23',
              borderRadius: 8,
              padding: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.95rem', margin: 0, color: '#f4f4f5' }}>Your Followed Interests</h3>
                <Link to="/settings" style={{ fontSize: '0.75rem', color: '#a855f7', textDecoration: 'none' }}>
                  Manage in Settings →
                </Link>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                {followedWikis.length === 0 && followedCategories.length === 0 ? (
                  <span style={{ fontSize: '0.8rem', color: '#71717a' }}>
                    You are not following any spaces or genres yet. Explore categories above to personalize your feed!
                  </span>
                ) : (
                  <>
                    {followedWikis.map((w) => (
                      <Link
                        key={w.wiki_id}
                        to={`/wiki/${w.slug}`}
                        style={{
                          fontSize: '0.75rem',
                          backgroundColor: 'rgba(168, 85, 247, 0.1)',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          color: '#c084fc',
                          padding: '0.25rem 0.65rem',
                          borderRadius: 9999,
                          textDecoration: 'none'
                        }}
                      >
                        📖 {w.title}
                      </Link>
                    ))}
                    {followedCategories.map((c) => (
                      <span
                        key={c.category_id}
                        style={{
                          fontSize: '0.75rem',
                          backgroundColor: '#18181b',
                          border: '1px solid #27272a',
                          color: '#d4d4d8',
                          padding: '0.25rem 0.65rem',
                          borderRadius: 9999
                        }}
                      >
                        🏷️ {c.name}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

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
                You haven't followed any categories or wiki spaces yet. Follow some from Settings or explore the topics above!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {forYouArticles.map((art) => (
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
                  {/* Article Thumbnail Preview */}
                  <div style={{
                    width: 80,
                    height: 80,
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
                      <span style={{ fontSize: '1.6rem', color: '#3f3f46' }}>📄</span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.75rem', color: '#a855f7' }}>
                      {art.category_name} •{' '}
                      <Link to={`/wiki/${art.wiki_slug}`} style={{ color: '#a855f7', textDecoration: 'underline' }}>
                        {art.wiki_title}
                      </Link>
                    </span>
                    <h3 style={{ margin: '0.2rem 0', fontSize: '1.15rem' }}>
                      <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                        {art.title}
                      </Link>
                    </h3>

                    <p
                      style={{
                        margin: '0.25rem 0 0 0',
                        color: '#a1a1aa',
                        fontSize: '0.85rem',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {art.description || art.excerpt || 'No description available.'}
                    </p>
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
