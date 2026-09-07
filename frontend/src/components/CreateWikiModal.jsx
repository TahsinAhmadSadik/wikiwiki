import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import '../styles/auth.css';

export default function CreateWikiModal({ isOpen, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const loadCategories = async () => {
      try {
        const res = await api.get('/categories');
        setCategories(res.categories || []);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCategories();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/wikis', {
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId ? Number(categoryId) : null,
      });

      onCreated(res.wiki);
      onClose();
    } catch (err) {
      setError(err.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="delete-modal-overlay">
      <div className="delete-modal-card" style={{ maxWidth: 500 }}>
        <header style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: '#f4f4f5' }}>
            Create Wiki Space
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#a1a1aa' }}>
            You will become the primary Author with administrative rights over this wiki.
          </p>
        </header>

        {error && (
          <div className="auth-alert error" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="settings-group">
            <label style={{ fontSize: '0.8125rem', color: '#d4d4d8' }}>Wiki Title *</label>
            <input
              type="text"
              required
              placeholder="e.g., Computer Architecture"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="settings-input"
              autoFocus
            />
          </div>

          <div className="settings-group">
            <label style={{ fontSize: '0.8125rem', color: '#d4d4d8' }}>Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="settings-input"
              style={{ backgroundColor: '#050506' }}
            >
              <option value="">-- Select a Category (Optional) --</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-group">
            <label style={{ fontSize: '0.8125rem', color: '#d4d4d8' }}>Description</label>
            <textarea
              placeholder="What is this wiki space about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="settings-textarea"
              style={{ minHeight: 70 }}
            />
          </div>

          <div className="delete-modal-actions" style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="topbar-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="auth-btn"
              style={{ width: 'auto' }}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Wiki'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}