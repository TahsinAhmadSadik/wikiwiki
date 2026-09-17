import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import CreateWikiModal from '../components/CreateWikiModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { getRoleConfig } from '../utils/roles';
import '../styles/auth.css';

export default function AdminPanelPage() {
  const { user } = useAuth();
  const [wikis, setWikis] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [reviewActionMsg, setReviewActionMsg] = useState({ text: '', type: '' });

  // Inspection modal state
  const [inspectingVersion, setInspectingVersion] = useState(null);
  const [approvalFeedback, setApprovalFeedback] = useState('');

  // Co-author form
  const [selectedWikiId, setSelectedWikiId] = useState('');
  const [coAuthorEmail, setCoAuthorEmail] = useState('');
  const [coAuthorMsg, setCoAuthorMsg] = useState({ text: '', type: '' });

  // Site Owner form
  const [adminEmail, setAdminEmail] = useState('');
  const [ownerMsg, setOwnerMsg] = useState({ text: '', type: '' });

  const isOwner = user?.global_role === 'owner';
  const isGlobalAdmin = ['owner', 'admin'].includes(user?.global_role);

  const fetchAdminData = async () => {
    try {
      const [wikisRes, pendingRes] = await Promise.all([
        api.get('/wikis/managed'),
        api.get('/articles/pending-reviews')
      ]);

      setWikis(wikisRes.wikis || []);
      setPendingReviews(pendingRes.pending || []);

      if (isGlobalAdmin) {
        const statsRes = await api.get('/admin/stats');
        setGlobalStats(statsRes.stats);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [isGlobalAdmin]);

  const handleReviewAction = async (versionId, action) => {
    setReviewActionMsg({ text: '', type: '' });
    try {
      const res = await api.post(`/articles/versions/${versionId}/review`, { 
        action,
        approval_feedback: approvalFeedback.trim() || undefined
      });
      setReviewActionMsg({ text: res.message, type: 'success' });
      setPendingReviews((prev) => prev.filter((r) => r.version_id !== versionId));
      setInspectingVersion(null);
      setApprovalFeedback('');
    } catch (err) {
      setReviewActionMsg({ text: err.data?.message || err.message, type: 'error' });
    }
  };

  const handleAddCoAuthor = async (e) => {
    e.preventDefault();
    setCoAuthorMsg({ text: '', type: '' });
    try {
      const res = await api.post(`/wikis/${selectedWikiId}/members`, { email: coAuthorEmail });
      setCoAuthorMsg({ text: res.message, type: 'success' });
      setCoAuthorEmail('');
    } catch (err) {
      setCoAuthorMsg({ text: err.data?.message || err.message, type: 'error' });
    }
  };

  const handleAssignGlobalAdmin = async (e) => {
    e.preventDefault();
    setOwnerMsg({ text: '', type: '' });
    try {
      const res = await api.patch('/admin/roles', { email: adminEmail, role: 'admin' });
      setOwnerMsg({ text: res.message, type: 'success' });
      setAdminEmail('');
    } catch (err) {
      setOwnerMsg({ text: err.data?.message || err.message, type: 'error' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#f4f4f5' }}>
      <Navbar />

      <CreateWikiModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => fetchAdminData()}
      />

      {/* INSPECT REVISION MODAL */}
      {inspectingVersion && (
        <div className="delete-modal-overlay">
          <div className="delete-modal-card" style={{ maxWidth: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <header style={{ borderBottom: '1px solid #1f1f23', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>
                  Reviewing Version {inspectingVersion.version_number}
                </span>
                <button
                  onClick={() => setInspectingVersion(null)}
                  style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.25rem' }}
                >
                  ×
                </button>
              </div>
              <h2 style={{ margin: '0.25rem 0', fontSize: '1.4rem' }}>{inspectingVersion.article_title}</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#a1a1aa' }}>
                Submitted by {inspectingVersion.contributor_name} ({inspectingVersion.contributor_email})
              </p>
              <div style={{ marginTop: '0.5rem', backgroundColor: '#141417', padding: '0.5rem 0.75rem', borderRadius: 4, fontSize: '0.8rem', color: '#d4d4d8' }}>
                <strong>Edit Summary:</strong> {inspectingVersion.edit_summary || 'None provided'}
              </div>
            </header>

            {/* VERSION CONTENT PREVIEW */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem', marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: '#71717a', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Proposed Article Content:
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#050506', padding: '1rem', borderRadius: 6, border: '1px solid #1f1f23' }}>
                {inspectingVersion.content?.blocks?.length > 0 ? (
                  inspectingVersion.content.blocks.map((block) => (
                    <div key={block.id || Math.random()}>
                      {block.type === 'header' ? (
                        <h3 style={{ fontSize: '1.2rem', margin: '0.5rem 0 0.25rem 0', color: '#fff' }}>
                          {block.data?.text || block.text}
                        </h3>
                      ) : (
                        <p style={{ margin: 0, fontSize: '0.95rem', color: '#d4d4d8', lineHeight: 1.6 }}>
                          {block.data?.text || block.text}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: '#71717a' }}>No content blocks found in this version.</p>
                )}
              </div>
            </div>

            {/* MODAL ACTIONS */}
            <footer style={{ borderTop: '1px solid #1f1f23', paddingTop: '1rem' }}>
              <input
                type="text"
                placeholder="Optional feedback or note for the contributor..."
                value={approvalFeedback}
                onChange={(e) => setApprovalFeedback(e.target.value)}
                className="auth-input"
                style={{ marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => handleReviewAction(inspectingVersion.version_id, 'reject')}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    padding: '0.5rem 1rem',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Reject & Discard
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewAction(inspectingVersion.version_id, 'approve')}
                  className="auth-btn"
                  style={{ width: 'auto', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                >
                  Approve & Publish Live
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 1000, margin: '2rem auto', padding: '0 1.5rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Admin Dashboard</h1>
            <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>
              Confirm contributor submissions, manage wiki memberships, and monitor platform statistics.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="auth-btn"
            style={{ width: 'auto', padding: '0.55rem 1.15rem' }}
          >
            + Create Wiki Space
          </button>
        </header>

        {reviewActionMsg.text && (
          <div className={`auth-alert ${reviewActionMsg.type}`} style={{ marginBottom: '1.5rem' }}>
            {reviewActionMsg.text}
          </div>
        )}

        {/* REVIEW QUEUE */}
        <section style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.5rem', borderRadius: 8, marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
              Pending Revisions Review Queue ({pendingReviews.length})
            </h2>
            {pendingReviews.length > 0 && (
              <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.2rem 0.6rem', borderRadius: 9999 }}>
                Action Required
              </span>
            )}
          </div>

          {loading ? (
            <p style={{ color: '#71717a' }}>Loading pending reviews...</p>
          ) : pendingReviews.length === 0 ? (
            <p style={{ color: '#71717a', margin: 0, fontSize: '0.9rem' }}>
              All contributor submissions have been confirmed. No pending edits.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {pendingReviews.map((rev) => (
                <div key={rev.version_id} style={{ backgroundColor: '#141417', border: '1px solid #27272a', borderRadius: 6, padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                        Wiki:{' '}
                        <Link 
                          to={`/wiki/${rev.wiki_slug}`} 
                          style={{ color: '#a855f7', textDecoration: 'none' }}
                        >
                          {rev.wiki_title}
                        </Link>
                      </span>
                      <h3 style={{ margin: '0.2rem 0', fontSize: '1.15rem' }}>{rev.article_title} (v{rev.version_number})</h3>
                      <span style={{ fontSize: '0.8rem', color: '#71717a' }}>
                        Submitted by <strong>{rev.contributor_name}</strong> ({rev.contributor_email}) on {new Date(rev.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setInspectingVersion(rev);
                          setApprovalFeedback('');
                        }}
                        style={{
                          backgroundColor: '#18181b',
                          color: '#f4f4f5',
                          border: '1px solid #27272a',
                          padding: '0.45rem 0.95rem',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: '0.8125rem'
                        }}
                      >
                        Inspect & Read
                      </button>
                      <button
                        onClick={() => handleReviewAction(rev.version_id, 'approve')}
                        className="auth-btn"
                        style={{ width: 'auto', padding: '0.45rem 0.95rem', fontSize: '0.8125rem' }}
                      >
                        Quick Approve
                      </button>
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#09090b', padding: '0.75rem', borderRadius: 4, marginTop: '0.75rem', fontSize: '0.825rem' }}>
                    <strong>Edit Summary:</strong> {rev.edit_summary || 'No edit summary submitted'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* GLOBAL STATS */}
        {isGlobalAdmin && globalStats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.25rem', borderRadius: 6 }}>
              <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Total Platform Users</span>
              <h2 style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem' }}>{globalStats.total_users}</h2>
            </div>
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.25rem', borderRadius: 6 }}>
              <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Total Wikis</span>
              <h2 style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem' }}>{globalStats.total_wikis}</h2>
            </div>
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.25rem', borderRadius: 6 }}>
              <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Total Articles</span>
              <h2 style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem' }}>{globalStats.total_articles}</h2>
            </div>
            <div style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.25rem', borderRadius: 6 }}>
              <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Pending Reports</span>
              <h2 style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', color: '#ef4444' }}>{globalStats.pending_reports}</h2>
            </div>
          </div>
        )}

        {/* SITE OWNER CONTROLS */}
        {isOwner && (
          <section style={{ backgroundColor: '#0d0d0f', border: '1px solid #a855f750', padding: '1.5rem', borderRadius: 8, marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0', color: '#a855f7' }}>👑 Site Owner Controls</h2>
            <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 1rem 0' }}>
              Assign any registered contributor as a Global Admin by email.
            </p>

            {ownerMsg.text && <div className={`auth-alert ${ownerMsg.type}`} style={{ marginBottom: '1rem' }}>{ownerMsg.text}</div>}

            <form onSubmit={handleAssignGlobalAdmin} style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="email"
                required
                placeholder="contributor@example.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="auth-input"
                style={{ maxWidth: 350 }}
              />
              <button type="submit" className="auth-btn" style={{ width: 'auto' }}>
                Promote to Global Admin
              </button>
            </form>
          </section>
        )}

        {/* MANAGED WIKIS */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Your Managed Wikis</h2>
          {wikis.length === 0 ? (
            <p style={{ color: '#71717a' }}>You are not an author or co-author of any wiki spaces yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {wikis.map((w) => {
                const roleBadge = getRoleConfig(null, w.user_role);
                return (
                  <div key={w.wiki_id} style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.25rem', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <Link 
                        to={`/wiki/${w.slug}`} 
                        style={{ color: '#fff', textDecoration: 'none' }}
                      >
                        {w.title}
                      </Link>
                      <span style={{ fontSize: '0.7rem', color: roleBadge.color, backgroundColor: roleBadge.bg, padding: '0.2rem 0.5rem', borderRadius: 9999 }}>
                        <span style={{ color: roleBadge.color }}>{roleBadge.icon}</span> {roleBadge.label}
                      </span>
                    </div>
                    <p style={{ color: '#71717a', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>{w.description || 'No description provided'}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#a1a1aa', borderTop: '1px solid #1f1f23', paddingTop: '0.75rem' }}>
                      <span>Articles: {w.article_count}</span>
                      <span>Views: {w.total_views}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ADD CO-AUTHOR */}
        {wikis.length > 0 && (
          <section style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.5rem', borderRadius: 8 }}>
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0' }}>Add Co-Author to a Wiki</h2>
            <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 1rem 0' }}>
              Grant another contributor administrative control over your wiki space.
            </p>

            {coAuthorMsg.text && <div className={`auth-alert ${coAuthorMsg.type}`} style={{ marginBottom: '1rem' }}>{coAuthorMsg.text}</div>}

            <form onSubmit={handleAddCoAuthor} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 500 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>Select Wiki</label>
                <select
                  required
                  value={selectedWikiId}
                  onChange={(e) => setSelectedWikiId(e.target.value)}
                  className="auth-input"
                  style={{ backgroundColor: '#050506' }}
                >
                  <option value="">-- Select a wiki space --</option>
                  {wikis.map((w) => (
                    <option key={w.wiki_id} value={w.wiki_id}>{w.title} ({w.user_role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>Contributor Email</label>
                <input
                  type="email"
                  required
                  placeholder="collaborator@example.com"
                  value={coAuthorEmail}
                  onChange={(e) => setCoAuthorEmail(e.target.value)}
                  className="auth-input"
                />
              </div>

              <button type="submit" className="auth-btn" style={{ width: 'auto', alignSelf: 'flex-start' }}>
                Add as Co-Author
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}