import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import CategoryTreeExplorer from '../components/CategoryTreeExplorer';
import { api } from '../services/api';
import '../styles/auth.css';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [q, setQ] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'articles' | 'wikis'
  const [sort, setSort] = useState('relevance');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Boolean Advanced Constraints Accordion
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allWords, setAllWords] = useState('');
  const [anyWords, setAnyWords] = useState('');
  const [noneWords, setNoneWords] = useState('');
  const [exactPhrase, setExactPhrase] = useState('');

  // Data
  const [articles, setArticles] = useState([]);
  const [wikis, setWikis] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load category tree once
  useEffect(() => {
    api.get('/search/categories/tree')
      .then(res => setCategoryTree(res.tree || []))
      .catch(err => console.error(err));
  }, []);

  // Trigger search on filter changes
  const executeSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.append('q', q.trim());
      if (allWords.trim()) params.append('all', allWords.trim());
      if (anyWords.trim()) params.append('any', anyWords.trim());
      if (noneWords.trim()) params.append('none', noneWords.trim());
      if (exactPhrase.trim()) params.append('exact', exactPhrase.trim());
      if (selectedCategory) params.append('category_id', selectedCategory);
      params.append('sort', sort);
      params.append('type', activeTab);

      setSearchParams(params);

      const res = await api.get(`/search?${params.toString()}`);
      setArticles(res.articles || []);
      setWikis(res.wikis || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeSearch();
  }, [activeTab, sort, selectedCategory]);

  const handleSubmit = (e) => {
    e.preventDefault();
    executeSearch();
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <main style={{ maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Search & Explore</h1>
          <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>
            Full-text indexing with Boolean logic, trigram matching, and recursive category filtering.
          </p>
        </header>

        {/* SEARCH BAR & CONTROLS */}
        <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="Search across all articles and wiki spaces..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="auth-input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="auth-btn" style={{ width: 'auto', padding: '0.6rem 1.5rem' }}>
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                backgroundColor: showAdvanced ? '#27272a' : '#18181b',
                color: '#f4f4f5',
                border: '1px solid #27272a',
                borderRadius: 6,
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              ⚙ {showAdvanced ? 'Hide Advanced' : 'Advanced'}
            </button>
          </div>

          {/* ADVANCED BOOLEAN ACCORDION (MODULE 10) */}
          {showAdvanced && (
            <div style={{
              backgroundColor: '#0d0d0f',
              border: '1px solid #1f1f23',
              borderRadius: 6,
              padding: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.25rem' }}>
                  All these words (AND):
                </label>
                <input
                  type="text"
                  placeholder="e.g. cache pipeline"
                  value={allWords}
                  onChange={(e) => setAllWords(e.target.value)}
                  className="auth-input"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.25rem' }}>
                  Exact phrase (&lt;-&gt;):
                </label>
                <input
                  type="text"
                  placeholder="e.g. computer architecture"
                  value={exactPhrase}
                  onChange={(e) => setExactPhrase(e.target.value)}
                  className="auth-input"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.25rem' }}>
                  Any of these words (OR):
                </label>
                <input
                  type="text"
                  placeholder="e.g. RISC MIPS ARM"
                  value={anyWords}
                  onChange={(e) => setAnyWords(e.target.value)}
                  className="auth-input"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.25rem' }}>
                  None of these words (NOT):
                </label>
                <input
                  type="text"
                  placeholder="e.g. deprecated legacy"
                  value={noneWords}
                  onChange={(e) => setNoneWords(e.target.value)}
                  className="auth-input"
                />
              </div>
            </div>
          )}
        </form>

        {/* MAIN LAYOUT: SIDEBAR & RESULTS */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
          
          {/* LEFT SIDEBAR: CATEGORY TREE */}
          <aside>
            <CategoryTreeExplorer
              tree={categoryTree}
              onSelectCategory={(id) => setSelectedCategory(id)}
              selectedId={selectedCategory}
            />
          </aside>

          {/* RIGHT COLUMN: RESULTS */}
          <section>
            {/* FILTER & SORT BAR */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #1f1f23',
              paddingBottom: '0.75rem',
              marginBottom: '1.25rem'
            }}>
              {/* Type Tabs */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['all', 'articles', 'wikis'].map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === tab ? '2px solid #fff' : '2px solid transparent',
                      color: activeTab === tab ? '#fff' : '#71717a',
                      padding: '0.35rem 0.6rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      textTransform: 'capitalize'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Sort Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Sort:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="auth-input"
                  style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem', backgroundColor: '#09090b' }}
                >
                  <option value="relevance">Relevance / Views</option>
                  <option value="new_edit">Recently Edited</option>
                  <option value="new_created">Newest Created</option>
                  <option value="alpha">Alphabetical</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p style={{ color: '#71717a' }}>Searching indexes...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* WIKIS SECTION */}
                {['all', 'wikis'].includes(activeTab) && wikis.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', color: '#a855f7', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                      Wiki Spaces ({wikis.length})
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                        {wikis.map(w => (
                            <div key={w.wiki_id} style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1rem', borderRadius: 6 }}>
                                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>
                                <Link 
                                    to={`/wiki/${w.slug}`} 
                                    style={{ color: '#fff', textDecoration: 'none' }}
                                >
                                    {w.title}
                                </Link>
                                </h4>
                                <p style={{ margin: '0 0 0.5rem 0', color: '#71717a', fontSize: '0.8rem' }}>{w.description}</p>
                                <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                                {w.article_count} articles • {w.total_views} views
                                </span>
                            </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* ARTICLES SECTION */}
                {['all', 'articles'].includes(activeTab) && (
                  <div>
                    {activeTab === 'all' && (
                      <h3 style={{ fontSize: '0.85rem', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                        Articles ({articles.length})
                      </h3>
                    )}

                    {articles.length === 0 && wikis.length === 0 ? (
                      <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '2.5rem', borderRadius: 6, textAlign: 'center' }}>
                        <p style={{ color: '#71717a', margin: 0 }}>No matching records found. Try adjusting your search or Boolean terms.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {articles.map(art => (
                          <div key={art.article_id} style={{
                            backgroundColor: '#0d0d0f',
                            border: '1px solid #1f1f23',
                            borderRadius: 6,
                            padding: '1.25rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                                    <Link 
                                        to={`/wiki/${art.wiki_slug}`} 
                                        style={{ color: '#a855f7', textDecoration: 'none' }}
                                    >
                                        {art.wiki_title}
                                    </Link>{' '}
                                    • {art.category_name || 'General'}
                                </span>
                              <h3 style={{ margin: '0.2rem 0', fontSize: '1.15rem' }}>
                                <Link to={`/wiki/${art.wiki_slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                                  {art.title}
                                </Link>
                              </h3>
                              <p style={{ margin: '0 0 0.4rem 0', color: '#a1a1aa', fontSize: '0.85rem' }}>
                                {art.snippet || 'No excerpt available.'}
                              </p>
                              <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                                v{art.version_number} • {art.read_count} reads • Edited {new Date(art.last_edited_at).toLocaleDateString()}
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
                              Read →
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}