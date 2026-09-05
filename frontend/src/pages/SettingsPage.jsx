import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import '../styles/settings.css';
import '../styles/auth.css';

export default function SettingsPage() {
  const { user, login, logout, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  const [bio, setBio] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [followedCategories, setFollowedCategories] = useState([]);
  const [followedWikis, setFollowedWikis] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const res = await api.get('/users/me');
        if (res.user) {
          setBio(res.user.bio || '');
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

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await api.patch('/users/profile', { bio });
      updateUser({ bio: res.user.bio });
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

  if (loading) {
    return <div className="settings-container" style={{ color: '#71717a' }}>Loading settings...</div>;
  }

  return (
    <div className="settings-container">
      {/* TOP NAVIGATION */}
      <header className="settings-topbar">
        <Link to="/" className="topbar-link">
          ← Back to Dashboard
        </Link>
        <button onClick={logout} className="topbar-btn">
          Log out
        </button>
      </header>

      <div className="settings-header">
        <h1>Account Settings</h1>
        <p>Manage your account credentials, public profile, and wiki preferences</p>
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
      )}

      {/* SECURITY TAB */}
      {activeTab === 'security' && (
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
      )}

      {/* PREFERENCES / INTERESTS TAB */}
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
    </div>
  );
}