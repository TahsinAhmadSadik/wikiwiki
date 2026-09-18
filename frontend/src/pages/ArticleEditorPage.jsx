import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../services/api';
import '../styles/auth.css';

export default function ArticleEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editArticleId = searchParams.get('articleId');
  const urlWikiId = searchParams.get('wikiId');

  // Wiki selection state
  const [wikiId, setWikiId] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [wikiSlug, setWikiSlug] = useState('');
  const [articleSlug, setArticleSlug] = useState('');

  // Wiki data lists
  const [managedWikis, setManagedWikis] = useState([]);
  const [allWikis, setAllWikis] = useState([]);

  // Modal & Search state
  const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
  const [wikiSearchQuery, setWikiSearchQuery] = useState('');

  // Article form state
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [blocks, setBlocks] = useState([
    { id: '1', type: 'header', text: 'Introduction' },
    { id: '2', type: 'paragraph', text: 'Write your wiki article content here...' }
  ]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    const initializeEditor = async () => {
      setLoading(true);
      try {
        if (editArticleId) {
          // Version Commit Mode: Load existing article details
          const res = await api.get(`/articles/edit/${editArticleId}`);
          const art = res.article;
          setTitle(art.title);
          setWikiId(art.wiki_id);
          setWikiTitle(art.wiki_title);
          setWikiSlug(art.wiki_slug);
          setArticleSlug(art.slug);

          if (res.latestVersion?.content?.blocks?.length > 0) {
            setBlocks(
              res.latestVersion.content.blocks.map((b) => ({
                id: b.id || String(Math.random()),
                type: b.type || 'paragraph',
                text: b.data?.text || b.text || ''
              }))
            );
          }
        } else {
          // New Article Mode: Load managed wikis & all directory wikis in parallel
          const [managedRes, dirRes] = await Promise.all([
            api.get('/wikis/managed').catch(() => ({ wikis: [] })),
            api.get('/wikis/directory').catch(() => ({ wikis: [] }))
          ]);

          const managedList = managedRes.wikis || [];
          const dirList = dirRes.wikis || [];

          setManagedWikis(managedList);
          setAllWikis(dirList);

          // Auto-select wiki if passed via URL, else default to first managed or first directory wiki
          if (urlWikiId) {
            const preselected = dirList.find((w) => String(w.wiki_id) === String(urlWikiId)) ||
                                managedList.find((w) => String(w.wiki_id) === String(urlWikiId));
            if (preselected) {
              setWikiId(preselected.wiki_id);
              setWikiTitle(preselected.title);
              setWikiSlug(preselected.slug);
            }
          } else if (managedList.length > 0) {
            setWikiId(managedList[0].wiki_id);
            setWikiTitle(managedList[0].title);
            setWikiSlug(managedList[0].slug);
          } else if (dirList.length > 0) {
            setWikiId(dirList[0].wiki_id);
            setWikiTitle(dirList[0].title);
            setWikiSlug(dirList[0].slug);
          }
        }
      } catch (err) {
        setMsg({ text: err.data?.message || err.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    initializeEditor();
  }, [editArticleId, urlWikiId]);

  const handleSelectWiki = (selected) => {
    setWikiId(selected.wiki_id);
    setWikiTitle(selected.title);
    setWikiSlug(selected.slug);
    setIsWikiModalOpen(false);
    setWikiSearchQuery('');
  };

  const addBlock = (type) => {
    setBlocks((prev) => [...prev, { id: String(Date.now()), type, text: '' }]);
  };

  const updateBlockText = (id, text) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
  };

  const removeBlock = (id) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!wikiId) {
      setMsg({ text: 'Please select a target Wiki Space.', type: 'error' });
      return;
    }

    setSaving(true);
    setMsg({ text: '', type: '' });

    const contentPayload = {
      time: Date.now(),
      blocks: blocks.map((b) => ({
        id: b.id,
        type: b.type,
        data: { text: b.text }
      }))
    };

    try {
      if (editArticleId) {
        const res = await api.post(`/articles/${editArticleId}/versions`, {
          content: contentPayload,
          edit_summary: summary || 'Revised article content'
        });
        setMsg({ text: res.message, type: 'success' });
        setTimeout(() => navigate(`/wiki/${wikiSlug}/${articleSlug}`), 1500);
      } else {
        const res = await api.post('/articles', {
          wiki_id: Number(wikiId),
          title,
          content: contentPayload,
          edit_summary: summary || 'Initial draft'
        });
        setMsg({ text: res.message, type: 'success' });
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      setMsg({ text: err.data?.message || err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Search filtering
  const query = wikiSearchQuery.toLowerCase().trim();
  const filteredManaged = managedWikis.filter(
    (w) => w.title.toLowerCase().includes(query) || (w.description && w.description.toLowerCase().includes(query))
  );

  const managedIds = new Set(managedWikis.map((w) => w.wiki_id));
  const otherWikis = allWikis.filter((w) => !managedIds.has(w.wiki_id));
  const filteredOther = otherWikis.filter(
    (w) => w.title.toLowerCase().includes(query) || (w.description && w.description.toLowerCase().includes(query))
  );

  if (loading) {
    return (
      <div style={{ color: '#71717a', padding: '2rem', backgroundColor: '#000', minHeight: '100vh' }}>
        Loading editor canvas...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      {/* WIKI SELECTION MODAL */}
      {isWikiModalOpen && (
        <div className="delete-modal-overlay" style={{ zIndex: 100 }}>
          <div
            className="delete-modal-card"
            style={{
              maxWidth: 620,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0d0d0f',
              border: '1px solid #27272a'
            }}
          >
            <header style={{ borderBottom: '1px solid #1f1f23', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>Select Wiki Space</h3>
                <button
                  type="button"
                  onClick={() => setIsWikiModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.25rem' }}
                >
                  ×
                </button>
              </div>
              <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0.35rem 0 0.75rem 0' }}>
                Choose which wiki space this article belongs to.
              </p>

              <input
                type="text"
                autoFocus
                placeholder="Search wiki spaces by name or topic..."
                value={wikiSearchQuery}
                onChange={(e) => setWikiSearchQuery(e.target.value)}
                className="auth-input"
                style={{ width: '100%', backgroundColor: '#050506' }}
              />
            </header>

            {/* SCROLLABLE WIKI DIRECTORY */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* SECTION 1: USER'S MANAGED WIKIS */}
              {filteredManaged.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      👑 Your Managed Spaces (Direct Publish)
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {filteredManaged.map((w) => (
                      <div
                        key={w.wiki_id}
                        onClick={() => handleSelectWiki(w)}
                        style={{
                          backgroundColor: String(wikiId) === String(w.wiki_id) ? '#1c1917' : '#141417',
                          border: String(wikiId) === String(w.wiki_id) ? '1px solid #f59e0b' : '1px solid #27272a',
                          padding: '0.85rem 1rem',
                          borderRadius: 6,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'border 0.15s ease'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{w.title}</strong>
                            <span style={{ fontSize: '0.65rem', backgroundColor: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40', padding: '0.1rem 0.4rem', borderRadius: 4, textTransform: 'capitalize' }}>
                              {w.user_role || 'Author'}
                            </span>
                          </div>
                          <p style={{ margin: '0.2rem 0 0 0', color: '#a1a1aa', fontSize: '0.8rem' }}>
                            {w.description || 'No description provided'}
                          </p>
                        </div>
                        {String(wikiId) === String(w.wiki_id) && (
                          <span style={{ color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600 }}>Selected ✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 2: ALL PUBLIC WIKIS */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🌐 All Wiki Spaces (Contributor Proposal)
                  </span>
                </div>

                {filteredOther.length === 0 ? (
                  <p style={{ color: '#71717a', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                    {query ? 'No matching wiki spaces found.' : 'No other public wikis available.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {filteredOther.map((w) => (
                      <div
                        key={w.wiki_id}
                        onClick={() => handleSelectWiki(w)}
                        style={{
                          backgroundColor: String(wikiId) === String(w.wiki_id) ? '#18181b' : '#0a0a0c',
                          border: String(wikiId) === String(w.wiki_id) ? '1px solid #a855f7' : '1px solid #1f1f23',
                          padding: '0.85rem 1rem',
                          borderRadius: 6,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'border 0.15s ease'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{w.title}</strong>
                            {w.category_name && (
                              <span style={{ fontSize: '0.65rem', backgroundColor: '#27272a', color: '#a1a1aa', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
                                {w.category_name}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '0.2rem 0 0 0', color: '#71717a', fontSize: '0.8rem' }}>
                            {w.description || 'A collaborative knowledge space.'}
                          </p>
                        </div>
                        {String(wikiId) === String(w.wiki_id) && (
                          <span style={{ color: '#a855f7', fontSize: '0.8rem', fontWeight: 600 }}>Selected ✓</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <footer style={{ borderTop: '1px solid #1f1f23', paddingTop: '0.75rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsWikiModalOpen(false)}
                style={{
                  backgroundColor: '#18181b',
                  color: '#fff',
                  border: '1px solid #27272a',
                  padding: '0.45rem 1rem',
                  borderRadius: 6,
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

      {/* MAIN EDITOR FORM */}
      <main style={{ maxWidth: 850, margin: '2rem auto', padding: '0 1.5rem' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>
            {editArticleId ? `Edit Article: ${title}` : 'Create Wiki Article'}
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0.35rem 0 0 0' }}>
            {editArticleId 
              ? 'Your modifications will be saved as a new version. Authors and Admins publish immediately; contributors submit for review.' 
              : 'Compose a new article in any chosen wiki space.'}
          </p>
        </header>

        {msg.text && <div className={`auth-alert ${msg.type}`} style={{ marginBottom: '1.25rem' }}>{msg.text}</div>}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {/* WIKI SELECTOR TRIGGER */}
            <div style={{ flex: 1, minWidth: 260 }}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>
                Wiki Space *
              </label>

              {editArticleId ? (
                <input
                  type="text"
                  disabled
                  value={wikiTitle}
                  className="auth-input"
                  style={{ opacity: 0.6 }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsWikiModalOpen(true)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#0d0d0f',
                    border: '1px solid #27272a',
                    borderRadius: 6,
                    padding: '0.55rem 0.85rem',
                    color: wikiTitle ? '#fff' : '#71717a',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {wikiTitle ? `📖 ${wikiTitle}` : 'Select a Wiki Space...'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#a855f7', marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                    Change ↗
                  </span>
                </button>
              )}
            </div>

            {/* ARTICLE TITLE */}
            <div style={{ flex: 2, minWidth: 280 }}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>Article Title *</label>
              <input
                type="text"
                required
                disabled={Boolean(editArticleId)}
                placeholder="Title of the article"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="auth-input"
                style={editArticleId ? { opacity: 0.6 } : {}}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>Edit Summary *</label>
            <input
              type="text"
              required={Boolean(editArticleId)}
              placeholder={editArticleId ? "Describe the changes made in this version..." : "e.g., Initial creation"}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="auth-input"
            />
          </div>

          {/* BLOCK CANVAS */}
          <div style={{ border: '1px solid #1f1f23', borderRadius: 8, padding: '1.5rem', backgroundColor: '#0d0d0f' }}>
            <h3 style={{ fontSize: '0.9rem', color: '#a1a1aa', textTransform: 'uppercase', margin: '0 0 1rem 0' }}>
              Content Blocks
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {blocks.map((block) => (
                <div key={block.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', color: '#71717a', paddingTop: '0.5rem', width: 60 }}>
                    {block.type.toUpperCase()}
                  </span>

                  {block.type === 'header' ? (
                    <input
                      type="text"
                      className="auth-input"
                      value={block.text}
                      onChange={(e) => updateBlockText(block.id, e.target.value)}
                      placeholder="Header title..."
                      style={{ fontWeight: 600, fontSize: '1.1rem' }}
                    />
                  ) : (
                    <textarea
                      className="auth-input"
                      value={block.text}
                      onChange={(e) => updateBlockText(block.id, e.target.value)}
                      placeholder="Paragraph text..."
                      style={{ minHeight: 75, resize: 'vertical' }}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => addBlock('paragraph')}
                style={{ background: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '0.35rem 0.75rem', borderRadius: 4, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                + Add Paragraph
              </button>
              <button
                type="button"
                onClick={() => addBlock('header')}
                style={{ background: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '0.35rem 0.75rem', borderRadius: 4, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                + Add Header
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="auth-btn"
            style={{ width: 'auto', alignSelf: 'flex-start', padding: '0.65rem 1.5rem' }}
          >
            {saving ? 'Saving...' : editArticleId ? 'Commit New Version' : 'Submit & Save Article'}
          </button>
        </form>
      </main>
    </div>
  );
}