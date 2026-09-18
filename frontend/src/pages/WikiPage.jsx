import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
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

export default function WikiPage() {
  const { wikiSlug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [wiki, setWiki] = useState(null);
  const [articles, setArticles] = useState([]);
  const [similarWikis, setSimilarWikis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Cover modal & upload states
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [coverInputUrl, setCoverInputUrl] = useState('');
  const [coverMediaId, setCoverMediaId] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [coverError, setCoverError] = useState('');

  // Deletion Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      setWiki((prev) => ({
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
      setWiki((prev) => ({ ...prev, isFollowingCategory: res.following }));
    } catch (err) {
      console.error(err);
    }
  };

  // Upload image file to Supabase via media endpoint
  const handleCoverFileUpload = async (file) => {
    if (!file) return;
    setUploadingCover(true);
    setCoverError('');

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
        throw new Error(data.message || 'Failed to upload cover file');
      }

      setCoverInputUrl(data.url);
      setCoverMediaId(data.media_id || null);
    } catch (err) {
      setCoverError(err.message || 'Failed to upload cover file');
    } finally {
      setUploadingCover(false);
    }
  };

  // Save Cover (Update or Remove)
  const handleSaveCover = async (remove = false) => {
    setSavingCover(true);
    setCoverError('');

    const targetUrl = remove ? null : coverInputUrl.trim();
    const targetMediaId = remove ? null : coverMediaId;

    try {
      await api.patch(`/wikis/${wiki.wiki_id}/cover`, {
        cover_image_url: targetUrl,
        media_id: targetMediaId
      });

      setWiki((prev) => ({ ...prev, cover_image_url: targetUrl }));
      setIsCoverModalOpen(false);
    } catch (err) {
      setCoverError(err.data?.message || err.message || 'Failed to update cover');
    } finally {
      setSavingCover(false);
    }
  };

  const handleDeleteWiki = async () => {
    setDeleting(true);
    try {
      await api.delete(`/wikis/${wiki.wiki_id}`);
      navigate('/');
    } catch (err) {
      alert(err.data?.message || err.message || 'Failed to delete wiki space');
      setDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#71717a', padding: '2rem' }}>
        Loading wiki space...
      </div>
    );
  }

  if (errorMsg || !wiki) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
        <Navbar />
        <div style={{ maxWidth: 800, margin: '3rem auto', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444' }}>Wiki Space Not Found</h2>
          <Link to="/" style={{ color: '#a1a1aa' }}>← Return Home</Link>
        </div>
      </div>
    );
  }

  const isGlobal = ['owner', 'admin'].includes(user?.global_role);
  const isAuthorOrCoAuthor = ['author', 'co_author'].includes(wiki.userRole) || wiki.creator_id === user?.user_id || isGlobal;
  const isPrimaryAuthor = wiki.userRole === 'author' || wiki.creator_id === user?.user_id || isGlobal;
  const canDeleteWiki = isGlobal || isPrimaryAuthor;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      {/* COVER IMAGE MODAL (Author / Co-Author / Owner / Admin) */}
      {isCoverModalOpen && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-card" style={{ maxWidth: 520 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                {wiki.cover_image_url ? 'Change Wiki Cover' : 'Set Wiki Cover Image'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCoverModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </header>

            {coverError && (
              <div className="auth-alert error" style={{ marginBottom: '1rem' }}>
                {coverError}
              </div>
            )}

            {/* Live Preview Box */}
            {coverInputUrl ? (
              <div style={{
                height: 140,
                width: '100%',
                borderRadius: 8,
                overflow: 'hidden',
                backgroundImage: `url(${coverInputUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '1px solid #27272a',
                marginBottom: '1rem'
              }} />
            ) : (
              <div style={{
                height: 100,
                width: '100%',
                borderRadius: 8,
                border: '1px dashed #27272a',
                backgroundColor: '#141417',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#71717a',
                fontSize: '0.85rem',
                marginBottom: '1rem'
              }}>
                No cover image selected
              </div>
            )}

            {/* Dual Input Controls: URL + Upload */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder="Paste image URL (https://...)"
                value={coverInputUrl}
                onChange={(e) => {
                  setCoverInputUrl(e.target.value);
                  setCoverMediaId(null);
                }}
                className="auth-input"
                style={{ flex: 1 }}
              />

              <label style={{
                backgroundColor: '#18181b',
                color: '#f4f4f5',
                border: '1px solid #3f3f46',
                borderRadius: 6,
                padding: '0.5rem 0.95rem',
                fontSize: '0.8rem',
                cursor: uploadingCover ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center'
              }}>
                {uploadingCover ? 'Uploading...' : '📁 Upload'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingCover}
                  onChange={(e) => handleCoverFileUpload(e.target.files?.[0])}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1f1f23', paddingTop: '1rem' }}>
              {wiki.cover_image_url ? (
                <button
                  type="button"
                  disabled={savingCover}
                  onClick={() => handleSaveCover(true)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#ef4444',
                    padding: '0.45rem 0.85rem',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Remove Cover
                </button>
              ) : <div />}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCoverModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#a1a1aa',
                    border: '1px solid #27272a',
                    padding: '0.45rem 1rem',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingCover || uploadingCover || !coverInputUrl.trim()}
                  onClick={() => handleSaveCover(false)}
                  className="auth-btn"
                  style={{ width: 'auto', padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
                >
                  {savingCover ? 'Saving...' : 'Save Cover'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE WIKI MODAL */}
      {isDeleteModalOpen && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-card" style={{ maxWidth: 480 }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#ef4444' }}>
              Delete Entire Wiki Space?
            </h3>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.25rem 0' }}>
              Are you sure you want to delete <strong>"{wiki.title}"</strong>? This will permanently delete all <strong>{wiki.article_count} published articles</strong>, versions, revision records, bookmarks, and member associations in this space. This action cannot be reversed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setIsDeleteModalOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#a1a1aa',
                  border: '1px solid #27272a',
                  padding: '0.45rem 1rem',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteWiki}
                className="auth-btn"
                style={{
                  width: 'auto',
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                  padding: '0.45rem 1.25rem'
                }}
              >
                {deleting ? 'Deleting Space...' : 'Yes, Delete Space'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 1000, margin: '2rem auto', padding: '0 1.5rem' }}>
        {/* BANNER HEADER WITH COVER IMAGE */}
        <header style={{
          backgroundColor: '#0d0d0f',
          border: '1px solid #1f1f23',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: '2rem',
          position: 'relative'
        }}>
          {wiki.cover_image_url ? (
            <div style={{
              height: 220,
              width: '100%',
              backgroundImage: `url(${wiki.cover_image_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, #0d0d0f 0%, rgba(13,13,15,0.4) 60%, rgba(13,13,15,0.1) 100%)'
              }} />

              {/* Cover Change Button for Author/Co-Author/Owner/Admin */}
              {isAuthorOrCoAuthor && (
                <button
                  type="button"
                  onClick={() => {
                    setCoverInputUrl(wiki.cover_image_url || '');
                    setCoverMediaId(null);
                    setCoverError('');
                    setIsCoverModalOpen(true);
                  }}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    backgroundColor: 'rgba(0,0,0,0.75)',
                    color: '#f4f4f5',
                    border: '1px solid #3f3f46',
                    borderRadius: 6,
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    backdropFilter: 'blur(6px)'
                  }}
                >
                  📷 Change Cover
                </button>
              )}
            </div>
          ) : (
            isAuthorOrCoAuthor && (
              <div style={{
                backgroundColor: '#141417',
                borderBottom: '1px dashed #27272a',
                padding: '0.75rem 1.5rem',
                display: 'flex',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setCoverInputUrl('');
                    setCoverMediaId(null);
                    setCoverError('');
                    setIsCoverModalOpen(true);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#a855f7',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  📷 + Add Cover Image
                </button>
              </div>
            )
          )}

          <div style={{ padding: '1.75rem 2rem' }}>
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
                <h1 style={{ fontSize: '2.1rem', margin: '0.25rem 0', fontWeight: 700 }}>{wiki.title}</h1>
                <p style={{ color: '#a1a1aa', fontSize: '0.95rem', margin: 0, maxWidth: 650 }}>
                  {wiki.description || 'A collaborative knowledge space.'}
                </p>
              </div>

              {/* ACTION CONTROLS */}
              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
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

                {/* DELETE WIKI SPACE (AUTHOR / ADMIN ONLY) */}
                {canDeleteWiki && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      borderRadius: 6,
                      padding: '0.55rem 0.85rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                    title="Delete Wiki Space"
                  >
                    🗑️
                  </button>
                )}
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
          </div>
        </header>

        {/* ARTICLES FEED WITH THUMBNAILS */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Published Articles ({articles.length})</h2>

          {articles.length === 0 ? (
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '2rem', borderRadius: 8, textAlign: 'center' }}>
              <p style={{ color: '#71717a', margin: '0 0 1rem 0' }}>No articles published in this space yet.</p>
              <Link to={`/editor?wikiId=${wiki.wiki_id}`} className="auth-btn" style={{ width: 'auto', display: 'inline-block' }}>
                Write the First Article
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {articles.map((art) => (
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
                  <div style={{
                    width: 90,
                    height: 90,
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
                      <span style={{ fontSize: '1.75rem', color: '#3f3f46' }}>📄</span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem' }}>
                      <Link to={`/wiki/${wiki.slug}/${art.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                        {art.title}
                      </Link>
                    </h3>

                    <p
                      style={{
                        margin: '0 0 0.5rem 0',
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
                      {art.description || 'No description available.'}
                    </p>

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
                      padding: '0.5rem 0.95rem',
                      borderRadius: 6,
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

        {/* SIMILAR WIKIS WITH COVERS */}
        {similarWikis.length > 0 && (
          <section>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#a1a1aa' }}>Similar Wiki Spaces</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {similarWikis.map((sw) => (
                <div
                  key={sw.wiki_id}
                  style={{
                    backgroundColor: '#0d0d0f',
                    border: '1px solid #1f1f23',
                    borderRadius: 8,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{
                    height: 90,
                    width: '100%',
                    backgroundColor: '#141417',
                    backgroundImage: sw.cover_image_url ? `url(${sw.cover_image_url})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderBottom: '1px solid #1f1f23',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {!sw.cover_image_url && <span style={{ color: '#3f3f46', fontSize: '1.5rem' }}>📚</span>}
                  </div>

                  <div style={{ padding: '0.9rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.95rem' }}>
                        <Link to={`/wiki/${sw.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {sw.title}
                        </Link>
                      </h4>
                      <p style={{
                        margin: '0 0 0.75rem 0',
                        color: '#71717a',
                        fontSize: '0.78rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {sw.description}
                      </p>
                    </div>

                    <span style={{ fontSize: '0.72rem', color: '#a1a1aa', borderTop: '1px solid #1a1a1e', paddingTop: '0.5rem' }}>
                      {sw.article_count} articles • {sw.total_views} views
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}