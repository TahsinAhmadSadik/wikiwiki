import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import '../styles/auth.css';

const getUploadEndpoint = () => {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const clean = raw.replace(/\/+$/, '');
  return clean.endsWith('/api') ? `${clean}/media/upload` : `${clean}/api/media/upload`;
};

const getStoredToken = () => {
  for (const key of ['token', 'accessToken', 'authToken', 'jwt', 'access_token']) {
    const val = localStorage.getItem(key);
    if (val) return val.replace(/^"|"$/g, '');
  }
  try {
    const rawUser = localStorage.getItem('user');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed.token) return parsed.token;
      if (parsed.accessToken) return parsed.accessToken;
    }
  } catch (_) {}
  return null;
};

export default function CreateWikiModal({ isOpen, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  
  // Cover image states
  const [coverUrl, setCoverUrl] = useState('');
  const [mediaId, setMediaId] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);

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

  // Reset form states
  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategoryId('');
    setCoverUrl('');
    setMediaId(null);
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploadingCover(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    const token = getStoredToken();

    try {
      const uploadUrl = getUploadEndpoint();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to upload cover image');
      }

      setCoverUrl(data.url);
      setMediaId(data.media_id || null);
    } catch (err) {
      setError(err.message || 'Failed to upload cover image');
    } finally {
      setUploadingCover(false);
    }
  };

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
        cover_image_url: coverUrl.trim() || null,
        media_id: mediaId ? Number(mediaId) : null,
      });

      onCreated(res.wiki);
      resetForm();
      onClose();
    } catch (err) {
      setError(err.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="delete-modal-overlay">
      <div className="delete-modal-card" style={{ maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
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
          {/* Wiki Title */}
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

          {/* Category */}
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

          {/* Cover Image Upload / URL */}
          <div className="settings-group">
            <label style={{ fontSize: '0.8125rem', color: '#d4d4d8', marginBottom: '0.35rem', display: 'block' }}>
              Cover Image (Optional)
            </label>

            {coverUrl ? (
              <div style={{
                position: 'relative',
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid #27272a',
                height: 120,
                backgroundImage: `url(${coverUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                marginBottom: '0.5rem'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setCoverUrl('');
                    setMediaId(null);
                  }}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    backgroundColor: 'rgba(0,0,0,0.75)',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 4,
                    width: 26,
                    height: 26,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem'
                  }}
                  title="Remove cover"
                >
                  ✕
                </button>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Paste cover URL (https://...)"
                value={coverUrl}
                onChange={(e) => {
                  setCoverUrl(e.target.value);
                  setMediaId(null);
                }}
                className="settings-input"
                style={{ flex: 1 }}
              />

              <label style={{
                backgroundColor: '#18181b',
                color: '#f4f4f5',
                border: '1px solid #3f3f46',
                borderRadius: 6,
                padding: '0.55rem 0.85rem',
                fontSize: '0.8rem',
                cursor: uploadingCover ? 'wait' : 'pointer',
                whiteSpace: 'nowrap'
              }}>
                {uploadingCover ? 'Uploading...' : '📁 Upload'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingCover}
                  onChange={(e) => handleFileUpload(e.target.files?.[0])}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* Description */}
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
              onClick={handleClose}
              disabled={loading || uploadingCover}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="auth-btn"
              style={{ width: 'auto' }}
              disabled={loading || uploadingCover}
            >
              {loading ? 'Creating...' : 'Create Wiki'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}