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
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [reviewActionMsg, setReviewActionMsg] = useState({ text: '', type: '' });

  const [inspectingVersion, setInspectingVersion] = useState(null);
  const [approvalFeedback, setApprovalFeedback] = useState('');
  
  // Demerit & Rollback selections per report
  const [demeritSelections, setDemeritSelections] = useState({});
  const [rollbackSelections, setRollbackSelections] = useState({});

  const [newCatName, setNewCatName] = useState('');
  const [parentCatId, setParentCatId] = useState('');
  const [catStatus, setCatStatus] = useState({ text: '', type: '' });
  const [creatingCat, setCreatingCat] = useState(false);

  // Wiki membership management state
  const [selectedWikiId, setSelectedWikiId] = useState('');
  const [wikiMembers, setWikiMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [coAuthorEmail, setCoAuthorEmail] = useState('');
  const [coAuthorMsg, setCoAuthorMsg] = useState({ text: '', type: '' });

  // Site owner global role state
  const [adminEmail, setAdminEmail] = useState('');
  const [targetGlobalRole, setTargetGlobalRole] = useState('admin');
  const [ownerMsg, setOwnerMsg] = useState({ text: '', type: '' });

  const isOwner = user?.global_role === 'owner';
  const isGlobalAdmin = ['owner', 'admin'].includes(user?.global_role);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [wikisRes, pendingRes, reportRes, catRes] = await Promise.allSettled([
        api.get('/wikis/managed'),
        api.get('/articles/pending-reviews'),
        api.get('/reports/pending'),
        api.get('/categories')
      ]);

      if (wikisRes.status === 'fulfilled') {
        setWikis(wikisRes.value?.wikis || []);
      } else {
        console.error('Managed wikis fetch failed:', wikisRes.reason);
      }

      if (pendingRes.status === 'fulfilled') {
        setPendingReviews(pendingRes.value?.pending || []);
      } else {
        console.error('Pending reviews fetch failed:', pendingRes.reason);
      }

      if (reportRes.status === 'fulfilled') {
        setReports(reportRes.value?.reports || []);
      } else {
        console.error('Reports fetch failed:', reportRes.reason);
      }

      if (catRes.status === 'fulfilled') {
        setCategories(catRes.value?.categories || []);
      } else {
        console.error('Categories fetch failed:', catRes.reason);
      }

      if (isGlobalAdmin) {
        try {
          const statsRes = await api.get('/admin/stats');
          setGlobalStats(statsRes.stats);
        } catch (statsErr) {
          console.error('Admin stats fetch failed:', statsErr);
        }
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

  // Load wiki members whenever selected wiki changes
  useEffect(() => {
    if (!selectedWikiId) {
      setWikiMembers([]);
      return;
    }

    const loadMembers = async () => {
      setLoadingMembers(true);
      try {
        const res = await api.get(`/wikis/${selectedWikiId}/members`);
        setWikiMembers(res.members || []);
      } catch (err) {
        console.error('Failed to load wiki members:', err);
      } finally {
        setLoadingMembers(false);
      }
    };

    loadMembers();
  }, [selectedWikiId]);

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

  const handleResolveReport = async (reportId, action) => {
    setReviewActionMsg({ text: '', type: '' });
    const demerits = Number(demeritSelections[reportId] || 0);
    const rollbackVerId = rollbackSelections[reportId] ? Number(rollbackSelections[reportId]) : null;

    try {
      const res = await api.post(`/reports/${reportId}/resolve`, {
        action,
        demerit_points: action === 'resolved' ? demerits : 0,
        rollback_version_id: action === 'resolved' ? rollbackVerId : null
      });
      setReviewActionMsg({ text: res.message, type: 'success' });
      setReports((prev) => prev.filter((r) => r.report_id !== reportId));
    } catch (err) {
      setReviewActionMsg({ text: err.data?.message || err.message, type: 'error' });
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setCreatingCat(true);
    setCatStatus({ text: '', type: '' });

    try {
      const res = await api.post('/categories', {
        name: newCatName.trim(),
        parent_id: parentCatId ? Number(parentCatId) : null
      });

      setCatStatus({ text: res.message, type: 'success' });
      setNewCatName('');
      setParentCatId('');

      const updatedCats = await api.get('/categories');
      setCategories(updatedCats.categories || []);
    } catch (err) {
      setCatStatus({ text: err.data?.message || err.message, type: 'error' });
    } finally {
      setCreatingCat(false);
    }
  };

  const handleAddCoAuthor = async (e) => {
    e.preventDefault();
    setCoAuthorMsg({ text: '', type: '' });
    try {
      const res = await api.post(`/wikis/${selectedWikiId}/members`, { email: coAuthorEmail });
      setCoAuthorMsg({ text: res.message, type: 'success' });
      setCoAuthorEmail('');
      
      const membersRes = await api.get(`/wikis/${selectedWikiId}/members`);
      setWikiMembers(membersRes.members || []);
    } catch (err) {
      setCoAuthorMsg({ text: err.data?.message || err.message, type: 'error' });
    }
  };

  const handleRemoveCoAuthor = async (memberUserId, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} as co-author?`)) return;
    setCoAuthorMsg({ text: '', type: '' });
    try {
      const res = await api.delete(`/wikis/${selectedWikiId}/members/${memberUserId}`);
      setCoAuthorMsg({ text: res.message, type: 'success' });
      setWikiMembers((prev) => prev.filter((m) => m.user_id !== memberUserId));
    } catch (err) {
      setCoAuthorMsg({ text: err.data?.message || err.message, type: 'error' });
    }
  };

  const handleAssignGlobalRole = async (e) => {
    e.preventDefault();
    setOwnerMsg({ text: '', type: '' });
    try {
      const res = await api.patch('/admin/roles', { 
        email: adminEmail, 
        role: targetGlobalRole 
      });
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
              Confirm contributor submissions, resolve moderation reports, and manage wiki spaces.
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

        {/* 1. REVISION REVIEW QUEUE */}
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
                        <Link to={`/wiki/${rev.wiki_slug}`} style={{ color: '#a855f7', textDecoration: 'none' }}>
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

        {/* 2. MODERATION REPORTS QUEUE */}
        <section style={{ backgroundColor: '#0d0d0f', border: '1px solid #ef444430', padding: '1.5rem', borderRadius: 8, marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
              Flagged Article Reports ({reports.length})
            </h2>
            {reports.length > 0 && (
              <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.2rem 0.6rem', borderRadius: 9999 }}>
                Moderation Needed
              </span>
            )}
          </div>

          {loading ? (
            <p style={{ color: '#71717a' }}>Loading reports...</p>
          ) : reports.length === 0 ? (
            <p style={{ color: '#71717a', margin: 0, fontSize: '0.9rem' }}>
              No pending violation reports on your managed wikis. Clean record!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {reports.map((rep) => (
                <div key={rep.report_id} style={{ backgroundColor: '#141417', border: '1px solid #27272a', borderRadius: 6, padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
                        Wiki:{' '}
                        <Link to={`/wiki/${rep.wiki_slug}`} style={{ color: '#a855f7', textDecoration: 'none' }}>
                          {rep.wiki_title}
                        </Link>
                      </span>
                      <h3 style={{ margin: '0.2rem 0', fontSize: '1.15rem' }}>
                        <Link to={`/wiki/${rep.wiki_slug}/${rep.article_slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                          {rep.article_title}
                        </Link>
                      </h3>
                      <span style={{ fontSize: '0.8rem', color: '#71717a' }}>
                        Reported by <strong>{rep.reporter_name}</strong> on {new Date(rep.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <select
                        value={demeritSelections[rep.report_id] || '0'}
                        onChange={(e) => setDemeritSelections({ ...demeritSelections, [rep.report_id]: e.target.value })}
                        className="auth-input"
                        style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#09090b' }}
                      >
                        <option value="0">0 Demerits (Warning)</option>
                        <option value="1">1 Demerit</option>
                        <option value="2">2 Demerits</option>
                        <option value="5">5 Demerits (Instant Ban)</option>
                      </select>

                      {rep.available_versions?.length > 1 && (
                        <select
                          value={rollbackSelections[rep.report_id] || ''}
                          onChange={(e) => setRollbackSelections({ ...rollbackSelections, [rep.report_id]: e.target.value })}
                          className="auth-input"
                          style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#09090b', color: '#eab308' }}
                        >
                          <option value="">Keep Current Version</option>
                          {rep.available_versions.map((v) => (
                            <option key={v.version_id} value={v.version_id}>
                              ↺ Revert to v{v.version_number} ({v.edit_summary ? v.edit_summary.slice(0, 20) : 'Snapshot'})
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        onClick={() => handleResolveReport(rep.report_id, 'dismissed')}
                        style={{
                          backgroundColor: '#18181b',
                          color: '#a1a1aa',
                          border: '1px solid #27272a',
                          padding: '0.45rem 0.75rem',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: '0.8rem'
                        }}
                      >
                        Dismiss
                      </button>

                      <button
                        onClick={() => handleResolveReport(rep.report_id, 'resolved')}
                        className="auth-btn"
                        style={{ width: 'auto', padding: '0.45rem 0.95rem', fontSize: '0.8rem', backgroundColor: '#ef4444', borderColor: '#ef4444' }}
                      >
                        Penalize & Resolve
                      </button>
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#09090b', padding: '0.75rem', borderRadius: 4, marginTop: '0.75rem', fontSize: '0.825rem' }}>
                    <strong style={{ color: '#ef4444' }}>Report Reason:</strong> {rep.reason}
                    {rep.editor_name && (
                      <span style={{ marginLeft: '1rem', color: '#71717a' }}>
                        Target Contributor: <strong>{rep.editor_name}</strong> (Current Demerits: {rep.editor_demerits})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. GLOBAL PLATFORM STATS */}
        {isGlobalAdmin && globalStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
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

        {/* 4. TAXONOMY & CATEGORY TREE */}
        {isGlobalAdmin && (
          <section style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', borderRadius: 8, padding: '1.5rem', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>Taxonomy & Category Tree</h2>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
              Define global root topics or nest subcategories to organize wiki spaces and articles.
            </p>

            {catStatus.text && (
              <div className={`auth-alert ${catStatus.type}`} style={{ marginBottom: '1rem' }}>
                {catStatus.text}
              </div>
            )}

            <form onSubmit={handleCreateCategory} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr)) auto', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Graph Theory, Quantum Computing"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="auth-input"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>
                  Parent Category (Optional)
                </label>
                <select
                  value={parentCatId}
                  onChange={(e) => setParentCatId(e.target.value)}
                  className="auth-input"
                  style={{ backgroundColor: '#141417' }}
                >
                  <option value="">None (Top-Level Root Topic)</option>
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.parent_name ? `↳ Child of ${c.parent_name}: ${c.name}` : `📁 ${c.name}`}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={creatingCat}
                className="auth-btn"
                style={{ width: 'auto', padding: '0.6rem 1.25rem', height: 42 }}
              >
                {creatingCat ? 'Adding...' : '+ Add Category'}
              </button>
            </form>

            <div style={{ borderTop: '1px solid #1f1f23', paddingTop: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '0.75rem' }}>
                Registered Taxonomy Topics ({categories.length})
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {categories.map((c) => (
                  <span
                    key={c.category_id}
                    style={{
                      fontSize: '0.8rem',
                      backgroundColor: '#141417',
                      border: '1px solid #27272a',
                      color: c.parent_id ? '#c084fc' : '#fff',
                      padding: '0.3rem 0.75rem',
                      borderRadius: 6
                    }}
                  >
                    {c.parent_id ? `↳ ${c.name}` : `📁 ${c.name}`}
                    <span style={{ fontSize: '0.7rem', color: '#71717a', marginLeft: '0.4rem' }}>
                      ({c.article_count || 0})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 5. SITE OWNER CONTROLS (BIDIRECTIONAL GLOBAL ADMIN) */}
        {isOwner && (
          <section style={{ backgroundColor: '#0d0d0f', border: '1px solid #a855f750', padding: '1.5rem', borderRadius: 8, marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0', color: '#a855f7' }}>👑 Site Owner Controls</h2>
            <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 1rem 0' }}>
              Promote a registered user to Global Admin or demote them back to standard Contributor.
            </p>

            {ownerMsg.text && <div className={`auth-alert ${ownerMsg.type}`} style={{ marginBottom: '1rem' }}>{ownerMsg.text}</div>}

            <form onSubmit={handleAssignGlobalRole} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="email"
                required
                placeholder="contributor@example.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="auth-input"
                style={{ maxWidth: 320 }}
              />

              <select
                value={targetGlobalRole}
                onChange={(e) => setTargetGlobalRole(e.target.value)}
                className="auth-input"
                style={{ width: 'auto', backgroundColor: '#141417' }}
              >
                <option value="admin">Promote to Global Admin</option>
                <option value="contributor">Demote to Contributor</option>
              </select>

              <button
                type="submit"
                className="auth-btn"
                style={{
                  width: 'auto',
                  backgroundColor: targetGlobalRole === 'admin' ? '#a855f7' : '#ef4444',
                  borderColor: targetGlobalRole === 'admin' ? '#a855f7' : '#ef4444'
                }}
              >
                {targetGlobalRole === 'admin' ? 'Apply Admin Role' : 'Remove Admin Role'}
              </button>
            </form>
          </section>
        )}

        {/* 6. YOUR MANAGED WIKIS */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Your Managed Wikis</h2>
          {wikis.length === 0 ? (
            <p style={{ color: '#71717a' }}>You are not an author or co-author of any wiki spaces yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {wikis.map((w) => {
                const roleBadge = getRoleConfig(null, w.user_role);
                return (
                  <div key={w.wiki_id} style={{
                    backgroundColor: '#0d0d0f',
                    border: '1px solid #1f1f23',
                    borderRadius: 8,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{
                        height: 95,
                        width: '100%',
                        backgroundColor: '#141417',
                        backgroundImage: w.cover_image_url ? `url(${w.cover_image_url})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderBottom: '1px solid #1f1f23',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {!w.cover_image_url && <span style={{ color: '#3f3f46', fontSize: '1.5rem' }}>📚</span>}
                      </div>

                      <div style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                            <Link to={`/wiki/${w.slug}`} style={{ color: '#fff', textDecoration: 'none' }}>
                              {w.title}
                            </Link>
                          </h3>
                          <span style={{
                            fontSize: '0.7rem',
                            color: roleBadge?.color || '#a1a1aa',
                            backgroundColor: roleBadge?.bg || '#1f1f23',
                            border: `1px solid ${roleBadge?.color || '#3f3f46'}40`,
                            padding: '0.2rem 0.5rem',
                            borderRadius: 9999
                          }}>
                            {roleBadge?.icon && <span style={{ color: roleBadge.color, marginRight: '0.25rem' }}>{roleBadge.icon}</span>}
                            {roleBadge?.label || w.user_role}
                          </span>
                        </div>
                        <p style={{
                          color: '#71717a',
                          fontSize: '0.825rem',
                          margin: '0 0 0.75rem 0',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {w.description || 'No description provided'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#a1a1aa', borderTop: '1px solid #1f1f23', padding: '0.75rem 1rem' }}>
                      <span>Articles: {w.article_count}</span>
                      <span>Views: {w.total_views}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 7. MANAGE WIKI CO-AUTHORS (BIDIRECTIONAL) */}
        {wikis.length > 0 && (
          <section style={{ backgroundColor: '#0d0d0f', border: '1px solid #1f1f23', padding: '1.5rem', borderRadius: 8 }}>
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0' }}>Manage Wiki Members & Co-Authors</h2>
            <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 1.25rem 0' }}>
              Select a wiki to inspect active contributors, grant co-author privileges, or revoke access.
            </p>

            {coAuthorMsg.text && (
              <div className={`auth-alert ${coAuthorMsg.type}`} style={{ marginBottom: '1rem' }}>
                {coAuthorMsg.text}
              </div>
            )}

            <div style={{ marginBottom: '1.5rem', maxWidth: 500 }}>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>
                Select Wiki Space
              </label>
              <select
                value={selectedWikiId}
                onChange={(e) => setSelectedWikiId(e.target.value)}
                className="auth-input"
                style={{ backgroundColor: '#141417' }}
              >
                <option value="">-- Choose a wiki space to manage --</option>
                {wikis.map((w) => (
                  <option key={w.wiki_id} value={w.wiki_id}>
                    {w.title} ({w.user_role})
                  </option>
                ))}
              </select>
            </div>

            {selectedWikiId && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {/* ACTIVE MEMBERS LIST */}
                <div style={{ backgroundColor: '#141417', border: '1px solid #27272a', borderRadius: 6, padding: '1rem' }}>
                  <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem 0', color: '#d4d4d8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Active Members ({wikiMembers.length})
                  </h3>

                  {loadingMembers ? (
                    <p style={{ color: '#71717a', fontSize: '0.85rem' }}>Loading members...</p>
                  ) : wikiMembers.length === 0 ? (
                    <p style={{ color: '#71717a', fontSize: '0.85rem' }}>No members registered for this wiki.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {wikiMembers.map((member) => {
                        const isCoAuthor = member.role === 'co_author';
                        return (
                          <div
                            key={member.user_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: '#09090b',
                              padding: '0.5rem 0.75rem',
                              borderRadius: 4,
                              border: '1px solid #1f1f23'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#f4f4f5' }}>
                                {member.username}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#71717a' }}>
                                {member.email} • <span style={{ color: member.role === 'author' ? '#3b82f6' : '#10b981' }}>{member.role}</span>
                              </div>
                            </div>

                            {isCoAuthor && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCoAuthor(member.user_id, member.username)}
                                style={{
                                  backgroundColor: 'transparent',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: 4,
                                  fontSize: '0.75rem',
                                  cursor: 'pointer'
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ADD CO-AUTHOR FORM */}
                <div style={{ backgroundColor: '#141417', border: '1px solid #27272a', borderRadius: 6, padding: '1rem' }}>
                  <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem 0', color: '#d4d4d8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Add New Co-Author
                  </h3>
                  <form onSubmit={handleAddCoAuthor} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.35rem' }}>
                        Contributor Email
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="contributor@example.com"
                        value={coAuthorEmail}
                        onChange={(e) => setCoAuthorEmail(e.target.value)}
                        className="auth-input"
                      />
                    </div>
                    <button
                      type="submit"
                      className="auth-btn"
                      style={{ width: 'auto', alignSelf: 'flex-start', padding: '0.5rem 1rem', fontSize: '0.825rem' }}
                    >
                      + Add as Co-Author
                    </button>
                  </form>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}