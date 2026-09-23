import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Data States
  const [categories, setCategories] = useState([]);
  const [velocityWikis, setVelocityWikis] = useState([]);
  const [topReads, setTopReads] = useState([]);
  const [forYouArticles, setForYouArticles] = useState([]);

  // Analytical Explorer State (Defaulted to Popular in Topics)
  const [statTab, setStatTab] = useState('cross-topic');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [timeDays, setTimeDays] = useState(30);
  const [topicArticles, setTopicArticles] = useState([]);
  const [crossTopicArticles, setCrossTopicArticles] = useState([]);

  // Readership Distribution Pie
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

  // Calculate highest velocity score to normalize ratings strictly between 0 and 100
  const maxVelocity = Math.max(
    ...velocityWikis.map((w) => Number(w.velocity_score) || 0),
    100
  );

  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        const [catRes, velRes, topRes, distributionRes] = await Promise.all([
          api.get('/categories'),
          api.get('/stats/wiki-velocity?limit=6'),
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

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#09090b', color: '#f4f4f5', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <style>{`
        .topic-pill {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .topic-pill:hover {
          background-color: #27272a !important;
          border-color: #a855f7 !important;
          color: #f4f4f5 !important;
          transform: translateY(-2px);
        }
        .large-article-card {
          transition: all 0.25s ease;
        }
        .large-article-card:hover {
          border-color: #3f3f46 !important;
          transform: translateY(-3px);
          box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.6);
        }
        .large-article-card:hover .card-img {
          transform: scale(1.03);
        }
        .wiki-card-hover {
          transition: all 0.25s ease;
        }
        .wiki-card-hover:hover {
          border-color: #a855f7 !important;
          transform: translateY(-3px);
          box-shadow: 0 10px 25px -8px rgba(168, 85, 247, 0.15);
        }
        .stat-tab-btn {
          transition: all 0.15s ease;
        }
        .stat-card-hover {
          transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .stat-card-hover:hover {
          border-color: #3f3f46 !important;
          transform: translateY(-2px);
        }
      `}</style>

      <main style={{ maxWidth: 1120, width: '100%', margin: '0 auto', padding: '2.5rem 1.5rem', flex: 1 }}>
        {errorMsg && <div className="auth-alert error" style={{ marginBottom: '2rem' }}>{errorMsg}</div>}

        {/* 1. HERO: MINIMAL HEADER + SEARCH BAR + TOP CATEGORIES */}
        <section style={{ textAlign: 'center', marginBottom: '4.5rem', marginTop: '1rem' }}>
          <h1 style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            margin: '0 0 2rem 0',
            background: 'linear-gradient(180deg, #ffffff 40%, #a1a1aa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Explore the Architecture of Code
          </h1>

          {/* Search Form */}
          <form
            onSubmit={handleSearchSubmit}
            style={{
              maxWidth: 620,
              margin: '0 auto 1.5rem auto',
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <span style={{ position: 'absolute', left: '1.25rem', color: '#71717a', fontSize: '1.1rem', pointerEvents: 'none' }}>
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search concepts, algorithms, systems, wikis..."
              style={{
                width: '100%',
                padding: '0.95rem 1.25rem 0.95rem 3.25rem',
                backgroundColor: '#121215',
                border: '1px solid #27272a',
                borderRadius: 9999,
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
                boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.4)',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#a855f7';
                e.target.style.boxShadow = '0 0 0 3px rgba(168, 85, 247, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#27272a';
                e.target.style.boxShadow = '0 4px 20px -2px rgba(0, 0, 0, 0.4)';
              }}
            />
          </form>

          {/* Top 5-6 Topics / Categories with Hover */}
          {categories.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
              {categories.slice(0, 6).map((cat) => (
                <Link
                  key={cat.category_id}
                  to={`/search?category_id=${cat.category_id}&sort=relevance`}
                  className="topic-pill"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    color: '#a1a1aa',
                    padding: '0.35rem 0.95rem',
                    borderRadius: 9999,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 2. MOST READ ARTICLES (4 ARTICLES IN 2 ROWS - FULL CARD LINK) */}
        <section style={{ marginBottom: '4.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              Most Read Articles
            </h2>
            <Link to="/search" style={{ fontSize: '0.825rem', color: '#71717a', textDecoration: 'none' }}>
              View all articles →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {topReads.slice(0, 6).map((art) => (
              <Link
                key={art.article_id}
                to={`/wiki/${art.wiki_slug}/${art.slug}`}
                className="large-article-card"
                style={{
                  backgroundColor: '#121215',
                  border: '1px solid #222227',
                  borderRadius: 12,
                  overflow: 'hidden',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  color: 'inherit'
                }}
              >
                {/* Large Cover Banner */}
                <div style={{ height: 175, width: '100%', position: 'relative', overflow: 'hidden', backgroundColor: '#18181b' }}>
                  {art.thumbnail_url ? (
                    <img
                      src={art.thumbnail_url}
                      alt={art.title}
                      className="card-img"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontSize: '2.5rem' }}>
                      📄
                    </div>
                  )}
                  <span style={{
                    position: 'absolute',
                    top: '0.85rem',
                    left: '0.85rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#e4e4e7',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.6rem',
                    borderRadius: 9999
                  }}>
                    {art.category_name || 'General'}
                  </span>
                </div>

                {/* Card Content Body */}
                <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.4, color: '#f4f4f5' }}>
                      {art.title}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #1c1c21', fontSize: '0.78rem', color: '#71717a' }}>
                    <span style={{ color: '#a1a1aa' }}>In {art.wiki_title}</span>
                    <span style={{ color: '#a855f7', fontWeight: 500 }}>{Number(art.read_count).toLocaleString()} reads</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 3. FOR YOU (SAME LARGE CARD STYLE WITH UN-AUTH PROMPT) */}
        <section style={{ marginBottom: '4.5rem' }}>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 1.5rem 0' }}>
            Recommended For You
          </h2>

          {!user ? (
            <div style={{
              backgroundColor: '#121215',
              border: '1px dashed #27272a',
              borderRadius: 12,
              padding: '3rem 2rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✨</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: '#f4f4f5' }}>
                Personalize Your Reading Feed
              </h3>
              <p style={{ color: '#71717a', maxWidth: 460, margin: '0 auto 1.5rem auto', fontSize: '0.875rem', lineHeight: 1.5 }}>
                Log in to follow topics, tracks, and curated wiki spaces tailored to your learning interests.
              </p>
              <Link
                to="/login"
                className="auth-btn"
                style={{ width: 'auto', display: 'inline-block', padding: '0.55rem 1.75rem', fontSize: '0.875rem', borderRadius: 9999 }}
              >
                Log In to Personalize
              </Link>
            </div>
          ) : forYouArticles.length === 0 ? (
            <div style={{ backgroundColor: '#121215', border: '1px solid #222227', padding: '2.5rem', borderRadius: 12, textAlign: 'center' }}>
              <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>
                Follow categories or wiki spaces in Settings to train your personalized feed.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {forYouArticles.slice(0, 6).map((art) => (
                <Link
                  key={art.article_id}
                  to={`/wiki/${art.wiki_slug}/${art.slug}`}
                  className="large-article-card"
                  style={{
                    backgroundColor: '#121215',
                    border: '1px solid #222227',
                    borderRadius: 12,
                    overflow: 'hidden',
                    textDecoration: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    color: 'inherit'
                  }}
                >
                  <div style={{ height: 175, width: '100%', position: 'relative', overflow: 'hidden', backgroundColor: '#18181b' }}>
                    {art.thumbnail_url ? (
                      <img
                        src={art.thumbnail_url}
                        alt={art.title}
                        className="card-img"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontSize: '2.5rem' }}>
                        📄
                      </div>
                    )}
                    <span style={{
                      position: 'absolute',
                      top: '0.85rem',
                      left: '0.85rem',
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#c084fc',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.6rem',
                      borderRadius: 9999
                    }}>
                      {art.category_name || 'Personalized'}
                    </span>
                  </div>

                  <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.4, color: '#f4f4f5' }}>
                        {art.title}
                      </h3>
                      <p style={{
                        margin: 0,
                        color: '#71717a',
                        fontSize: '0.825rem',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {art.description || 'Comprehensive architectural guide and technical breakdown.'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #1c1c21', fontSize: '0.78rem', color: '#71717a' }}>
                      <span style={{ color: '#a1a1aa' }}>In {art.wiki_title}</span>
                      <span style={{ color: '#10b981', fontWeight: 500 }}>{Number(art.read_count).toLocaleString()} reads</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 4. TRENDING WIKIS (DISTINCT WIKI CARDS WITH 0-100 RATING) */}
        <section style={{ marginBottom: '4.5rem' }}>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 1.5rem 0' }}>
            Trending Wiki Spaces
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {velocityWikis.map((wiki) => {
              // Ensure normalized trending rating is strictly between 0 and 100
              const trendingRating = Math.min(
                100,
                Math.max(1, Math.round(((Number(wiki.velocity_score) || 0) / maxVelocity) * 100))
              );

              return (
                <div
                  key={wiki.wiki_id}
                  className="wiki-card-hover"
                  style={{
                    backgroundColor: '#121215',
                    border: '1px solid #222227',
                    borderRadius: 12,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    {/* Wiki Cover */}
                    <div style={{
                      height: 120,
                      width: '100%',
                      backgroundColor: '#18181b',
                      backgroundImage: wiki.cover_image_url ? `url(${wiki.cover_image_url})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      position: 'relative'
                    }}>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(18,18,21,0.95) 100%)'
                      }} />
                      <span style={{
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.55rem',
                        borderRadius: 6
                      }}>
                        ⚡ {trendingRating}/100
                      </span>
                    </div>

                    <div style={{ padding: '1rem 1.25rem 0.5rem 1.25rem' }}>
                      <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', fontWeight: 600 }}>
                        <Link to={`/wiki/${wiki.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {wiki.title}
                        </Link>
                      </h3>
                      <p style={{
                        color: '#71717a',
                        fontSize: '0.825rem',
                        margin: 0,
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {wiki.description || 'Curated programming compendium.'}
                      </p>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: '#a1a1aa',
                    borderTop: '1px solid #1c1c21',
                    padding: '0.85rem 1.25rem',
                    marginTop: '1rem',
                    backgroundColor: '#0e0e11'
                  }}>
                    <span>📚 {wiki.total_articles} Articles</span>
                    <span>👁️ {Number(wiki.total_views).toLocaleString()} Views</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. SITE ANALYTICS (3 TABS: Popular in Topics [Top 1 only], Popular in Time, Readership Distribution) */}
        <section style={{
          backgroundColor: '#121215',
          border: '1px solid #222227',
          borderRadius: 14,
          padding: '1.75rem',
          marginBottom: '3rem'
        }}>
          {/* Section Header & Tab Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 0.2rem 0' }}>
                Platform Analytics
              </h2>
              <span style={{ fontSize: '0.78rem', color: '#71717a' }}>Query performance and topic readership dynamics</span>
            </div>

            <div style={{ display: 'flex', backgroundColor: '#18181b', borderRadius: 8, padding: '0.25rem', border: '1px solid #27272a' }}>
              <button
                type="button"
                className="stat-tab-btn"
                onClick={() => setStatTab('cross-topic')}
                style={{
                  background: statTab === 'cross-topic' ? '#27272a' : 'transparent',
                  color: statTab === 'cross-topic' ? '#fff' : '#a1a1aa',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Popular in Topics
              </button>

              <button
                type="button"
                className="stat-tab-btn"
                onClick={() => setStatTab('topic-time')}
                style={{
                  background: statTab === 'topic-time' ? '#27272a' : 'transparent',
                  color: statTab === 'topic-time' ? '#fff' : '#a1a1aa',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Popular in Time
              </button>

              <button
                type="button"
                className="stat-tab-btn"
                onClick={() => setStatTab('topic-distribution')}
                style={{
                  background: statTab === 'topic-distribution' ? '#27272a' : 'transparent',
                  color: statTab === 'topic-distribution' ? '#fff' : '#a1a1aa',
                  border: 'none',
                  padding: '0.4rem 0.85rem',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Readership Distribution
              </button>
            </div>
          </div>

          {/* TAB 1: POPULAR IN TOPICS (FILTERED STRICTLY TO TOPMOST #1 ONLY) */}
          {statTab === 'cross-topic' && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#71717a' }}>Time Horizon:</span>
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
                      padding: '0.3rem 0.75rem',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {crossTopicArticles.filter((art) => Number(art.category_rank) === 1).length === 0 ? (
                <p style={{ color: '#71717a', margin: 0, fontSize: '0.85rem' }}>No rankings available for this timeframe.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  {crossTopicArticles
                    .filter((art) => Number(art.category_rank) === 1) // Strictly topmost #1 article only
                    .map((art) => (
                      <div
                        key={art.article_id}
                        className="stat-card-hover"
                        style={{
                          backgroundColor: '#18181b',
                          border: '1px solid #27272a',
                          padding: '0.85rem 1rem',
                          borderRadius: 8
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                            {art.category_name}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#71717a' }}>
                            {Number(art.read_count).toLocaleString()} reads
                          </span>
                        </div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                            {art.title}
                          </Link>
                        </h4>
                        <span style={{ fontSize: '0.72rem', color: '#71717a' }}>{art.wiki_title}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: POPULAR IN TIME */}
          {statTab === 'topic-time' && (
            <div>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    maxWidth: 220,
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
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
                        padding: '0.3rem 0.75rem',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {topicArticles.length === 0 ? (
                <p style={{ color: '#71717a', margin: 0, fontSize: '0.85rem' }}>No published articles found in this category for the selected timeframe.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  {topicArticles.map((art) => (
                    <div
                      key={art.article_id}
                      className="stat-card-hover"
                      style={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        padding: '0.85rem 1rem',
                        borderRadius: 8
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.72rem', color: '#3b82f6', fontWeight: 600 }}>{art.category_name}</span>
                        <span style={{ fontSize: '0.72rem', color: '#71717a' }}>{Number(art.read_count).toLocaleString()} reads</span>
                      </div>
                      <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {art.title}
                        </Link>
                      </h4>
                      <span style={{ fontSize: '0.72rem', color: '#71717a' }}>v{art.published_version} • {art.wiki_title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: READERSHIP DISTRIBUTION (RECHARTS PIE) */}
          {statTab === 'topic-distribution' && (
            <div>
              {topicReadDistribution.length === 0 ? (
                <p style={{ color: '#71717a', margin: 0, fontSize: '0.85rem' }}>No readership data available.</p>
              ) : (
                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="total_reads"
                        nameKey="category_name"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        stroke="#121215"
                        strokeWidth={2}
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
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: 8, fontSize: '0.8rem' }}
                        formatter={(value) => [`${Number(value).toLocaleString()} reads`, 'Volume']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* 6. MINIMAL FOOTER */}
      <footer style={{
        borderTop: '1px solid #1c1c21',
        backgroundColor: '#0c0c0e',
        padding: '2rem 1.5rem',
        marginTop: 'auto'
      }}>
        <div style={{
          maxWidth: 1120,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.825rem',
          color: '#71717a'
        }}>
          <div>
            <span style={{ fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.02em', marginRight: '0.75rem' }}>
              WikiWiki
            </span>
            <span>The collaborative engineering and algorithm encyclopedia.</span>
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            <Link to="/search" style={{ color: '#71717a', textDecoration: 'none' }}>Search</Link>
            <Link to={user ? "/settings" : "/login"} style={{ color: '#71717a', textDecoration: 'none' }}>
              {user ? "Preferences" : "Sign In"}
            </Link>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}