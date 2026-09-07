import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../services/api';
import '../styles/auth.css';

export default function ArticleEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editArticleId = searchParams.get('articleId');

  const [wikis, setWikis] = useState([]);
  const [wikiId, setWikiId] = useState('');
  const [wikiTitle, setWikiTitle] = useState('');
  const [articleSlug, setArticleSlug] = useState('');
  const [wikiSlug, setWikiSlug] = useState('');
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
          // Version Commit Mode: Load existing article & latest blocks
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
          // New Article Mode: Load available wikis
          const res = await api.get('/wikis/managed');
          setWikis(res.wikis || []);
          if (res.wikis?.length > 0) setWikiId(res.wikis[0].wiki_id);
        }
      } catch (err) {
        setMsg({ text: err.data?.message || err.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    initializeEditor();
  }, [editArticleId]);

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
        // Commit a new version to the existing article
        const res = await api.post(`/articles/${editArticleId}/versions`, {
          content: contentPayload,
          edit_summary: summary || 'Revised article content'
        });
        setMsg({ text: res.message, type: 'success' });
        setTimeout(() => navigate(`/wiki/${wikiSlug}/${articleSlug}`), 1500);
      } else {
        // Create an entirely new article
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

  if (loading) {
    return <div style={{ color: '#71717a', padding: '2rem', backgroundColor: '#000', minHeight: '100vh' }}>Loading editor canvas...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <main style={{ maxWidth: 850, margin: '2rem auto', padding: '0 1.5rem' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>
            {editArticleId ? `Edit Article: ${title}` : 'Create Wiki Article'}
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0.35rem 0 0 0' }}>
            {editArticleId 
              ? 'Your modifications will be saved as a new version. Authors and Admins publish immediately; contributors submit for review.' 
              : 'Compose a new article in one of your managed wiki spaces.'}
          </p>
        </header>

        {msg.text && <div className={`auth-alert ${msg.type}`} style={{ marginBottom: '1.25rem' }}>{msg.text}</div>}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>Wiki Space</label>
              {editArticleId ? (
                <input
                  type="text"
                  disabled
                  value={wikiTitle}
                  className="auth-input"
                  style={{ opacity: 0.6 }}
                />
              ) : (
                <select
                  required
                  value={wikiId}
                  onChange={(e) => setWikiId(e.target.value)}
                  className="auth-input"
                  style={{ backgroundColor: '#050506' }}
                >
                  {wikis.map((w) => (
                    <option key={w.wiki_id} value={w.wiki_id}>{w.title}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ flex: 2 }}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>Article Title</label>
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