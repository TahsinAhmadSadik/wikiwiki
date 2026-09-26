import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/settings.css';
import '../styles/auth.css';

export default function SettingsPage() {
  const { user, login, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('profile');

  const [userData, setUserData] = useState(null);
  const [bio, setBio] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [uploadingPic, setUploadingPic] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [followedCategories, setFollowedCategories] = useState([]);
  const [followedWikis, setFollowedWikis] = useState([]);

  // Account Deletion States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const fallbackAvatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(user?.username || 'WikiUser')}`;
  const effectiveAvatar = profilePicUrl || fallbackAvatar;

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const res = await api.get('/users/me');
        if (res.user) {
          setUserData(res.user);
          setBio(res.user.bio || '');
          setProfilePicUrl(res.user.profile_pic_url || '');
          updateUser(res.user);
        }
        if (res.interests) {
          setFollowedCategories(res.interests.categories || []);
          setFollowedWikis(res.interests.wikis || []);
        }
      } catch (err) {
        setMessage({ text: err.data?.message || err.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, []);

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

  const getUploadEndpoint = () => {
    const raw = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const clean = raw.replace(/\/+$/, '');
    return clean.endsWith('/api') ? `${clean}/media/upload` : `${clean}/api/media/upload`;
  };

  // Upload Profile Avatar using the same media upload pipeline
  const handleAvatarFileUpload = async (file) => {
    if (!file) return;
    setUploadingPic(true);
    setMessage({ text: '', type: '' });

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
        throw new Error(data.message || 'Avatar upload failed');
      }

      setProfilePicUrl(data.url);

      // Auto-save the new profile picture URL to the user account
      const patchRes = await api.patch('/users/profile', { profile_pic_url: data.url });
      updateUser(patchRes.user);
      setMessage({ text: 'Profile picture updated successfully!', type: 'success' });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to upload profile picture.', type: 'error' });
    } finally {
      setUploadingPic(false);
    }
  };

  // Reset to DiceBear default
  const handleResetAvatar = async () => {
    setSaving(true);
    setMessage({ text: '', type: '' });
    try {
      const res = await api.patch('/users/profile', { profile_pic_url: '' });
      setProfilePicUrl('');
      updateUser(res.user);
      setMessage({ text: 'Profile picture reset to default avatar.', type: 'success' });
    } catch (err) {
      setMessage({ text: err.data?.message || err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await api.patch('/users/profile', { bio, profile_pic_url: profilePicUrl });
      updateUser(res.user);
      setMessage({ text: 'Profile updated successfully', type: 'success' });
    } catch (err) {
      setMessage({ text: err.data?.message || err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (newPassword !== confirmPassword) {
      setMessage({ text: 'New passwords do not match', type: 'error' });
      return;
    }

    setSaving(true);

    try {
      const res = await api.post('/users/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      login(res.token, user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ text: res.message, type: 'success' });
    } catch (err) {
      setMessage({ text: err.data?.message || err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnfollowCategory = async (categoryId) => {
    try {
      await api.delete(`/users/follows/category/${categoryId}`);
      setFollowedCategories((prev) => prev.filter((c) => c.category_id !== categoryId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnfollowWiki = async (wikiId) => {
    try {
      await api.delete(`/users/follows/wiki/${wikiId}`);
      setFollowedWikis((prev) => prev.filter((w) => w.wiki_id !== wikiId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError('');

    if (deleteConfirmationEmail.trim().toLowerCase() !== user?.email.toLowerCase()) {
      setDeleteError('Entered email does not match your account email.');
      return;
    }

    setDeleting(true);

    try {
      await api.delete('/users/account', {
        confirm_email: deleteConfirmationEmail.trim(),
      });
      await logout();
      navigate('/register');
    } catch (err) {
      setDeleteError(err.data?.message || err.message);
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="settings-container" style={{ color: '#71717a' }}>Loading settings...</div>;
  }

  const demerits = userData?.demerit_points ?? user?.demerit_points ?? 0;

  return (
    <div className="settings-container">
      {/* TOP NAVIGATION */}
      <header className="settings-topbar">
        <button 
          type="button" 
          onClick={() => navigate(-1)} 
          className="topbar-btn"
          style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 0 }}
        >
          ← Back
        </button>
        <button onClick={logout} className="topbar-btn">
          Log out
        </button>
      </header>

      <div className="settings-header">
        <h1>Account Settings</h1>
        <p>Manage your credentials, contributor standing, and wiki preferences</p>
      </div>

      <nav className="settings-nav">
        <button
          className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => { setActiveTab('profile'); setMessage({ text: '', type: '' }); }}
        >
          Profile
        </button>
        <button
          className={`settings-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => { setActiveTab('security'); setMessage({ text: '', type: '' }); }}
        >
          Security
        </button>
        <button
          className={`settings-tab ${activeTab === 'interests' ? 'active' : ''}`}
          onClick={() => { setActiveTab('interests'); setMessage({ text: '', type: '' }); }}
        >
          Preferences
        </button>
      </nav>

      {message.text && (
        <div className={`auth-alert ${message.type}`} style={{ marginBottom: '1.5rem' }}>
          {message.text}
        </div>
      )}

      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <>
          {/* COMMUNITY STANDING GAUGE */}
          <div style={{
            backgroundColor: '#0d0d0f',
            border: demerits > 0 ? '1px solid #ef444460' : '1px solid #1f1f23',
            borderRadius: 8,
            padding: '1.25rem 1.5rem',
            marginBottom: '1.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Community Standing</h3>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 9999,
                  fontWeight: 600,
                  backgroundColor: demerits > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: demerits > 0 ? '#ef4444' : '#10b981',
                  border: `1px solid ${demerits > 0 ? '#ef444440' : '#10b98140'}`
                }}>
                  {demerits === 0 ? 'Good Standing' : 'Under Review'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#a1a1aa', maxWidth: 500 }}>
                {demerits === 0
                  ? 'Your account has 0 violations. All your contributions adhere to community standards.'
                  : 'Demerit points are issued when article revisions are flagged and confirmed by moderators. Reaching 5 points results in an automatic, irreversible platform ban.'}
              </p>
            </div>

            <div style={{
              textAlign: 'center',
              padding: '0.6rem 1.25rem',
              borderRadius: 6,
              backgroundColor: demerits > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${demerits > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
            }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#a1a1aa', display: 'block', fontWeight: 600 }}>
                Demerit Points
              </span>
              <span style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: demerits > 0 ? '#ef4444' : '#10b981'
              }}>
                {demerits} / 5
              </span>
            </div>
          </div>

          {/* AVATAR CONFIGURATION CARD */}
          <div className="settings-card" style={{ marginBottom: '1.75rem' }}>
            <h2>Profile Avatar</h2>
            <p className="section-desc">Personalize your avatar with an uploaded image or use the gender-neutral robot avatar.</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <div style={{ position: 'relative' }}>
                <img
                  src={effectiveAvatar}
                  alt="Profile Avatar"
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    backgroundColor: '#141417',
                    border: '2px solid rgba(168, 85, 247, 0.4)',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)'
                  }}
                  onError={(e) => { e.currentTarget.src = fallbackAvatar; }}
                />
                {uploadingPic && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    color: '#c084fc'
                  }}>
                    ⏳
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: profilePicUrl ? '#10b981' : '#a1a1aa', fontWeight: 500 }}>
                  {profilePicUrl ? '✓ Custom uploaded picture' : '🤖 Default DiceBear avatar active'}
                </span>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label style={{
                    backgroundColor: '#18181b',
                    color: '#f4f4f5',
                    border: '1px solid #3f3f46',
                    borderRadius: 6,
                    padding: '0.45rem 0.95rem',
                    fontSize: '0.8125rem',
                    cursor: uploadingPic ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}>
                    {uploadingPic ? 'Uploading...' : '📁 Upload New Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingPic}
                      onChange={(e) => handleAvatarFileUpload(e.target.files?.[0])}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {profilePicUrl && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleResetAvatar}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 6,
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.8125rem',
                        cursor: 'pointer'
                      }}
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#71717a' }}>
                  Supported formats: JPG, PNG, WebP, SVG. Max 10MB.
                </span>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <h2>Public Profile</h2>
            <p className="section-desc">Personal details visible across wiki articles and discussions</p>

            <form onSubmit={handleUpdateProfile}>
              <div className="settings-group">
                <label>Username</label>
                <input type="text" disabled value={user?.username || ''} className="settings-input" />
              </div>

              <div className="settings-group">
                <label>Email Address</label>
                <input type="email" disabled value={user?.email || ''} className="settings-input" />
              </div>

              <div className="settings-group">
                <label>Bio</label>
                <textarea
                  placeholder="Write a brief introduction..."
                  value={bio}
                  maxLength={500}
                  onChange={(e) => setBio(e.target.value)}
                  className="settings-textarea"
                />
              </div>

              <button type="submit" disabled={saving} className="auth-btn" style={{ width: 'auto' }}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </div>
        </>
      )}

      {/* SECURITY TAB */}
      {activeTab === 'security' && (
        <>
          <div className="settings-card">
            <h2>Change Password</h2>
            <p className="section-desc">Ensure your account is using a secure, unique password</p>

            <form onSubmit={handleChangePassword}>
              <div className="settings-group">
                <label>Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="settings-input"
                />
              </div>

              <div className="settings-group">
                <label>New Password</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="settings-input"
                />
              </div>

              <div className="settings-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="settings-input"
                />
              </div>

              <button type="submit" disabled={saving} className="auth-btn" style={{ width: 'auto' }}>
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          <div className="settings-card danger">
            <h2>Danger Zone</h2>
            <p className="section-desc">Permanently remove your account and all associated preferences</p>
            <button
              type="button"
              className="danger-btn"
              onClick={() => {
                setDeleteError('');
                setDeleteConfirmationEmail('');
                setIsDeleteModalOpen(true);
              }}
            >
              Delete Account
            </button>
          </div>
        </>
      )}

      {/* PREFERENCES TAB */}
      {activeTab === 'interests' && (
        <div className="settings-card">
          <h2>Followed Interests</h2>
          <p className="section-desc">Manage categories and wikis you receive updates for</p>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>
              Categories
            </label>
            <div className="settings-badge-row">
              {followedCategories.length === 0 ? (
                <span style={{ fontSize: '0.8125rem', color: '#52525b' }}>No followed categories</span>
              ) : (
                followedCategories.map((c) => (
                  <span key={c.category_id} className="preference-badge">
                    {c.name}
                    <button type="button" className="badge-remove-btn" onClick={() => handleUnfollowCategory(c.category_id)}>
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', color: '#a1a1aa', marginBottom: '0.5rem' }}>
              Wiki Spaces
            </label>
            <div className="settings-badge-row">
              {followedWikis.length === 0 ? (
                <span style={{ fontSize: '0.8125rem', color: '#52525b' }}>No followed wikis</span>
              ) : (
                followedWikis.map((w) => (
                  <span key={w.wiki_id} className="preference-badge">
                    {w.title}
                    <button type="button" className="badge-remove-btn" onClick={() => handleUnfollowWiki(w.wiki_id)}>
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETION MODAL */}
      {isDeleteModalOpen && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-card">
            <header className="delete-modal-header">
              <h3>Delete Account</h3>
              <p>
                This action is permanent and irreversible. Your personal profile, follows, and session keys will be completely erased.
              </p>
            </header>

            {deleteError && (
              <div className="auth-alert error" style={{ marginBottom: '1rem' }}>
                {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteAccount}>
              <div className="settings-group">
                <label style={{ fontSize: '0.8125rem', color: '#a1a1aa' }}>
                  Please type <strong>{user?.email}</strong> to confirm:
                </label>
                <input
                  type="email"
                  required
                  className="settings-input"
                  placeholder="name@example.com"
                  value={deleteConfirmationEmail}
                  onChange={(e) => setDeleteConfirmationEmail(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="delete-modal-actions">
                <button
                  type="button"
                  className="topbar-btn"
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="danger-btn"
                  disabled={
                    deleting ||
                    deleteConfirmationEmail.trim().toLowerCase() !== user?.email.toLowerCase()
                  }
                >
                  {deleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}