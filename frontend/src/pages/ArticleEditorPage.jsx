import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/auth.css';

export default function ArticleEditorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const queryWikiId = searchParams.get('wikiId');
  const queryArticleId = searchParams.get('articleId');

  // Metadata states
  const [wikis, setWikis] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [selectedWikiId, setSelectedWikiId] = useState(queryWikiId || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  // Wiki Selection Modal states
  const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
  const [wikiModalSearch, setWikiModalSearch] = useState('');

  // Category quick filter
  const [categoryFilter, setCategoryFilter] = useState('');

  const [title, setTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [templateType, setTemplateType] = useState('standard');

  // Editor content states (Simple Block Editor format)
  const [blocks, setBlocks] = useState([
    { id: '1', type: 'paragraph', data: { text: '' } }
  ]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [isEditMode, setIsEditMode] = useState(false);

  // 1. Initial Data Fetch
  useEffect(() => {
    const initEditor = async () => {
      try {
        const [dirRes, catRes, managedRes] = await Promise.all([
          api.get('/wikis/directory'),
          api.get('/categories'),
          user ? api.get('/wikis/managed').catch(() => ({ wikis: [] })) : Promise.resolve({ wikis: [] })
        ]);

        const loadedCats = catRes.categories || [];
        setAllCategories(loadedCats);

        // Map managed roles onto directory wikis
        const managedMap = new Map();
        (managedRes.wikis || []).forEach((mw) => {
          managedMap.set(Number(mw.wiki_id), mw.user_role || 'author');
        });

        const loadedWikis = (dirRes.wikis || []).map((w) => ({
          ...w,
          user_role: managedMap.get(Number(w.wiki_id)) || null
        }));
        setWikis(loadedWikis);

        if (queryArticleId) {
          setIsEditMode(true);
          const artRes = await api.get(`/articles/edit/${queryArticleId}`);
          const art = artRes.article;
          setTitle(art.title);
          setSelectedWikiId(String(art.wiki_id));
          setSelectedCategoryId(art.category_id ? String(art.category_id) : '');
          setTemplateType(art.template_type || 'standard');

          if (artRes.latestVersion?.content?.blocks) {
            setBlocks(artRes.latestVersion.content.blocks);
          }
        } else {
          // Determine initial default wiki space
          let defaultWiki = null;
          if (queryWikiId) {
            defaultWiki = loadedWikis.find((w) => String(w.wiki_id) === String(queryWikiId));
          } else {
            // Prioritize user's owned wiki spaces first if available
            defaultWiki = loadedWikis.find((w) => Boolean(w.user_role)) || loadedWikis[0];
          }

          if (defaultWiki) {
            setSelectedWikiId(String(defaultWiki.wiki_id));
            if (defaultWiki.category_id) {
              setSelectedCategoryId(String(defaultWiki.category_id));
            }
          }
        }
      } catch (err) {
        setStatusMsg({ text: err.data?.message || err.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    initEditor();
  }, [queryArticleId, queryWikiId, user?.user_id]);

  // Derive currently active wiki space
  const selectedWiki = useMemo(() => {
    return wikis.find((w) => String(w.wiki_id) === String(selectedWikiId)) || null;
  }, [wikis, selectedWikiId]);

  const isAuthorOrCoAuthor = useMemo(() => {
    if (!selectedWiki) return false;
    if (['owner', 'admin'].includes(user?.global_role)) return true;
    return Boolean(selectedWiki.user_role);
  }, [selectedWiki, user]);

  // Group wikis for modal display
  const { ownedWikis, otherWikis } = useMemo(() => {
    const isGlobal = ['owner', 'admin'].includes(user?.global_role);
    const owned = [];
    const other = [];

    wikis.forEach((w) => {
      if (Boolean(w.user_role) || isGlobal) {
        owned.push(w);
      } else {
        other.push(w);
      }
    });

    return { ownedWikis: owned, otherWikis: other };
  }, [wikis, user]);

  const filteredOwnedWikis = useMemo(() => {
    if (!wikiModalSearch.trim()) return ownedWikis;
    const q = wikiModalSearch.toLowerCase();
    return ownedWikis.filter(
      (w) => w.title.toLowerCase().includes(q) || (w.category_name && w.category_name.toLowerCase().includes(q))
    );
  }, [ownedWikis, wikiModalSearch]);

  const filteredOtherWikis = useMemo(() => {
    if (!wikiModalSearch.trim()) return otherWikis;
    const q = wikiModalSearch.toLowerCase();
    return otherWikis.filter(
      (w) => w.title.toLowerCase().includes(q) || (w.category_name && w.category_name.toLowerCase().includes(q))
    );
  }, [otherWikis, wikiModalSearch]);

  const filteredCategories = useMemo(() => {
    if (!categoryFilter.trim()) return allCategories;
    return allCategories.filter((c) =>
      c.name.toLowerCase().includes(categoryFilter.toLowerCase()) ||
      (c.parent_name && c.parent_name.toLowerCase().includes(categoryFilter.toLowerCase()))
    );
  }, [allCategories, categoryFilter]);

  const handleWikiSelect = (w) => {
    setSelectedWikiId(String(w.wiki_id));
    if (!isEditMode && w.category_id) {
      setSelectedCategoryId(String(w.category_id));
    }
    setIsWikiModalOpen(false);
    setWikiModalSearch('');
  };

  // Block Helpers
  const handleBlockChange = (id, text) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, data: { ...b.data, text } } : b))
    );
  };

  const handleAddBlock = (type) => {
    const newBlock = {
      id: String(Date.now()),
      type,
      data: { text: '' }
    };
    setBlocks([...blocks, newBlock]);
  };

  const handleRemoveBlock = (id) => {
    if (blocks.length === 1) return;
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  // Submit Handler
  const handlePublish = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setStatusMsg({ text: 'Article title is required.', type: 'error' });
      return;
    }
    if (!selectedWikiId) {
      setStatusMsg({ text: 'Please select a target Wiki Space.', type: 'error' });
      return;
    }

    setSaving(true);
    setStatusMsg({ text: '', type: '' });

    try {
      if (isEditMode) {
        const res = await api.post(`/articles/${queryArticleId}/versions`, {
          content: { blocks },
          edit_summary: editSummary.trim() || 'Updated content revision'
        });
        setStatusMsg({ text: res.message, type: 'success' });
        setTimeout(() => navigate('/studio/library'), 1200);
      } else {
        const res = await api.post('/articles', {
          wiki_id: Number(selectedWikiId),
          category_id: selectedCategoryId ? Number(selectedCategoryId) : null,
          title: title.trim(),
          template_type: templateType,
          content: { blocks },
          edit_summary: editSummary.trim() || 'Initial creation'
        });

        setStatusMsg({ text: res.message, type: 'success' });
        setTimeout(() => {
          navigate(`/wiki/${selectedWiki?.slug || res.article.slug || selectedWikiId}`);
        }, 1200);
      }
    } catch (err) {
      setStatusMsg({ text: err.data?.message || err.message || 'Failed to save article.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ color: '#71717a', padding: '2rem' }}>Loading editor workbench...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      {/* WIKI SELECTION MODAL */}
      {isWikiModalOpen && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-card" style={{ maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <header style={{ borderBottom: '1px solid #1f1f23', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Select Target Wiki Space</h3>
                  <span style={{ fontSize: '0.8rem', color: '#71717a' }}>
                    Choose where your article will be published or reviewed
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsWikiModalOpen(false);
                    setWikiModalSearch('');
                  }}
                  style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.4rem' }}
                >
                  ×
                </button>
              </div>

              {/* Live Search Input */}
              <input
                type="text"
                autoFocus
                placeholder="Search wiki spaces by title or topic..."
                value={wikiModalSearch}
                onChange={(e) => setWikiModalSearch(e.target.value)}
                className="auth-input"
                style={{ backgroundColor: '#141417' }}
              />
            </header>

            {/* Modal Scrollable List */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* 1. Owned / Managed Spaces */}
              {filteredOwnedWikis.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                    👑 Your Spaces ({filteredOwnedWikis.length}) — Direct Publishing
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {filteredOwnedWikis.map((w) => {
                      const isSelected = String(selectedWikiId) === String(w.wiki_id);
                      return (
                        <div
                          key={w.wiki_id}
                          onClick={() => handleWikiSelect(w)}
                          style={{
                            backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.1)' : '#141417',
                            border: isSelected ? '1px solid #10b981' : '1px solid #27272a',
                            borderRadius: 6,
                            padding: '0.85rem 1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <h4 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
                                {w.title}
                              </h4>
                              {w.category_name && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#27272a', color: '#a1a1aa', padding: '0.15rem 0.5rem', borderRadius: 9999 }}>
                                  {w.category_name}
                                </span>
                              )}
                              <span style={{ fontSize: '0.7rem', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.4rem', borderRadius: 4, textTransform: 'capitalize' }}>
                                {w.user_role || 'Author'}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#71717a', maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {w.description || 'No description provided'}
                            </p>
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                              {w.article_count || 0} articles
                            </span>
                            {isSelected && (
                              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                                ✓ Selected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Other Community Spaces */}
              {filteredOtherWikis.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a855f7', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                    🌐 Community Spaces ({filteredOtherWikis.length}) — Requires Author Confirmation
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {filteredOtherWikis.map((w) => {
                      const isSelected = String(selectedWikiId) === String(w.wiki_id);
                      return (
                        <div
                          key={w.wiki_id}
                          onClick={() => handleWikiSelect(w)}
                          style={{
                            backgroundColor: isSelected ? 'rgba(168, 85, 247, 0.1)' : '#141417',
                            border: isSelected ? '1px solid #a855f7' : '1px solid #27272a',
                            borderRadius: 6,
                            padding: '0.85rem 1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <h4 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
                                {w.title}
                              </h4>
                              {w.category_name && (
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#27272a', color: '#a1a1aa', padding: '0.15rem 0.5rem', borderRadius: 9999 }}>
                                  {w.category_name}
                                </span>
                              )}
                              <span style={{ fontSize: '0.7rem', color: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.15)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>
                                Public
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#71717a', maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {w.description || 'No description provided'}
                            </p>
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                              {w.article_count || 0} articles
                            </span>
                            {isSelected && (
                              <span style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 600 }}>
                                ✓ Selected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredOwnedWikis.length === 0 && filteredOtherWikis.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#71717a' }}>
                  No wiki spaces match "{wikiModalSearch}".
                </div>
              )}
            </div>

            <footer style={{ borderTop: '1px solid #1f1f23', paddingTop: '1rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setIsWikiModalOpen(false);
                  setWikiModalSearch('');
                }}
                style={{
                  backgroundColor: '#18181b',
                  color: '#a1a1aa',
                  border: '1px solid #27272a',
                  borderRadius: 6,
                  padding: '0.45rem 1.25rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Done
              </button>
            </footer>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 960, margin: '2rem auto', padding: '0 1.5rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1f1f23', paddingBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 600, margin: 0 }}>
              {isEditMode ? 'Edit Article Revision' : 'Write New Article'}
            </h1>
            <span style={{ fontSize: '0.8rem', color: '#71717a' }}>
              Publish verified documentation directly to a collaborative wiki space.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link
              to="/studio/library"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #27272a',
                color: '#a1a1aa',
                padding: '0.5rem 1rem',
                borderRadius: 6,
                fontSize: '0.85rem',
                textDecoration: 'none'
              }}
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={saving}
              onClick={handlePublish}
              className="auth-btn"
              style={{ width: 'auto', padding: '0.5rem 1.25rem' }}
            >
              {saving ? 'Publishing...' : isEditMode ? 'Commit Revision' : 'Publish Article'}
            </button>
          </div>
        </header>

        {statusMsg.text && (
          <div className={`auth-alert ${statusMsg.type}`} style={{ marginBottom: '1.5rem' }}>
            {statusMsg.text}
          </div>
        )}

        {/* METADATA CONFIGURATION BAR WITH MODAL SELECTOR */}
        <section style={{
          backgroundColor: '#0d0d0f',
          border: '1px solid #1f1f23',
          borderRadius: 8,
          padding: '1.25rem',
          marginBottom: '2rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem'
        }}>
          {/* 1. Target Wiki Space Modal Trigger Card */}
          <div>
            <label style={{ fontSize: '0.75rem', color: '#a1a1aa', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
              Target Wiki Space *
            </label>

            <div style={{
              backgroundColor: '#141417',
              border: '1px solid #27272a',
              borderRadius: 6,
              padding: '0.65rem 0.9rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              minHeight: 46
            }}>
              {selectedWiki ? (
                <div style={{ overflow: 'hidden', paddingRight: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📖 {selectedWiki.title}
                    </span>
                    {isAuthorOrCoAuthor ? (
                      <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.1rem 0.4rem', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        ✓ Direct Publish
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.1rem 0.4rem', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        Review Queue
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span style={{ color: '#71717a', fontSize: '0.85rem' }}>No wiki space selected</span>
              )}

              {!isEditMode && (
                <button
                  type="button"
                  onClick={() => setIsWikiModalOpen(true)}
                  style={{
                    backgroundColor: '#1f1f23',
                    color: '#f4f4f5',
                    border: '1px solid #3f3f46',
                    borderRadius: 4,
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {selectedWiki ? 'Change ⇄' : 'Select Wiki →'}
                </button>
              )}
            </div>
          </div>

          {/* 2. Global Category Selector */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#a1a1aa', fontWeight: 600 }}>
                Taxonomy Category
              </label>
              {allCategories.length > 3 && (
                <input
                  type="text"
                  placeholder="Filter topics..."
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.4rem',
                    width: 110
                  }}
                />
              )}
            </div>

            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="auth-input"
              style={{ backgroundColor: '#141417', height: 46 }}
            >
              <option value="">-- Select Category --</option>
              {filteredCategories.length === 0 ? (
                <option value="" disabled>No categories match filter</option>
              ) : (
                filteredCategories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.parent_id ? `↳ ${c.name} (${c.parent_name})` : `📁 ${c.name}`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* 3. Edit Summary */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>
              Revision Summary
            </label>
            <input
              type="text"
              placeholder="e.g. Initial draft, expanded algorithm analysis, fixed typo..."
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              className="auth-input"
            />
          </div>
        </section>

        {/* ARTICLE TITLE */}
        <div style={{ marginBottom: '1.5rem' }}>
          <input
            type="text"
            disabled={isEditMode}
            placeholder="Article Title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: '2px solid #27272a',
              color: '#fff',
              fontSize: '2rem',
              fontWeight: 700,
              padding: '0.5rem 0',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* BLOCK EDITOR CANVAS */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          {blocks.map((b, idx) => (
            <div key={b.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', color: '#52525b', width: 24, paddingTop: '0.6rem' }}>
                #{idx + 1}
              </span>

              {b.type === 'header' ? (
                <input
                  type="text"
                  placeholder="Heading text..."
                  value={b.data?.text || ''}
                  onChange={(e) => handleBlockChange(b.id, e.target.value)}
                  className="auth-input"
                  style={{ fontSize: '1.25rem', fontWeight: 600 }}
                />
              ) : (
                <textarea
                  rows={3}
                  placeholder="Write content paragraph (supports [[Wiki Link]] syntax)..."
                  value={b.data?.text || ''}
                  onChange={(e) => handleBlockChange(b.id, e.target.value)}
                  className="auth-input"
                  style={{ resize: 'vertical', lineHeight: 1.6 }}
                />
              )}

              <button
                type="button"
                onClick={() => handleRemoveBlock(b.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  paddingTop: '0.5rem',
                  fontSize: '0.9rem'
                }}
                title="Remove block"
              >
                ✕
              </button>
            </div>
          ))}

          {/* ADD BLOCK BUTTONS */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleAddBlock('paragraph')}
              style={{
                backgroundColor: '#141417',
                border: '1px dashed #3f3f46',
                color: '#d4d4d8',
                borderRadius: 6,
                padding: '0.45rem 0.85rem',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              + Add Paragraph
            </button>
            <button
              type="button"
              onClick={() => handleAddBlock('header')}
              style={{
                backgroundColor: '#141417',
                border: '1px dashed #3f3f46',
                color: '#d4d4d8',
                borderRadius: 6,
                padding: '0.45rem 0.85rem',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              + Add Subheading
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}