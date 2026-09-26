import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

const previewCache = new Map();

export default function WikiHoverCard({ target, currentWiki, children, fallbackHref }) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const hoverTimer = useRef(null);
  const closeTimer = useRef(null);

  const cacheKey = `${currentWiki || 'global'}:${target}`;

  const fetchPreview = async () => {
    if (previewCache.has(cacheKey)) {
      setData(previewCache.get(cacheKey));
      return;
    }

    setLoading(true);
    setError(false);

    try {
      const res = await api.get(
        `/articles/resolve-link?target=${encodeURIComponent(target)}&currentWiki=${encodeURIComponent(currentWiki || '')}`
      );
      if (res.success && res.article) {
        previewCache.set(cacheKey, res.article);
        setData(res.article);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    hoverTimer.current = setTimeout(() => {
      setIsOpen(true);
      if (!data && !previewCache.has(cacheKey)) {
        fetchPreview();
      } else if (previewCache.has(cacheKey)) {
        setData(previewCache.get(cacheKey));
      }
    }, 280);
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    closeTimer.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const destination = data
    ? `/wiki/${data.wiki_slug}/${data.slug}`
    : fallbackHref || `/wiki/${currentWiki || 'explore'}/${target.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')}`;

  return (
    <span
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <Link
        to={destination}
        style={{
          color: '#c084fc',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          fontWeight: 500,
          cursor: 'pointer'
        }}
      >
        {children}
      </Link>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 300,
            backgroundColor: '#0d0d0f',
            border: '1px solid #27272a',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
            zIndex: 100,
            overflow: 'hidden',
            pointerEvents: 'auto',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {loading && (
            <div style={{ padding: '1rem', color: '#71717a', fontSize: '0.8rem', textAlign: 'center' }}>
              Loading preview...
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', color: '#a1a1aa' }}>
              <span style={{ color: '#f59e0b', display: 'block', fontWeight: 600, marginBottom: '0.2rem' }}>
                Unlinked Documentation
              </span>
              This reference points to an uncommitted or private draft.
            </div>
          )}

          {data && !loading && (
            <div>
              {data.thumbnail_url && (
                <div style={{
                  height: 110,
                  width: '100%',
                  backgroundImage: `url(${data.thumbnail_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: '#141417',
                  borderBottom: '1px solid #1f1f23'
                }} />
              )}

              <div style={{ padding: '0.85rem 1rem' }}>
                <span style={{ fontSize: '0.7rem', color: '#a855f7', fontWeight: 600, textTransform: 'uppercase' }}>
                  {data.wiki_title} • {data.category_name || 'General'}
                </span>
                <h4 style={{ margin: '0.25rem 0 0.4rem 0', fontSize: '0.95rem', color: '#fff', lineHeight: 1.3 }}>
                  {data.title}
                </h4>
                <p style={{
                  margin: '0 0 0.65rem 0',
                  color: '#a1a1aa',
                  fontSize: '0.78rem',
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {data.description || 'No description provided for this article.'}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1f1f23', paddingTop: '0.5rem', fontSize: '0.72rem', color: '#71717a' }}>
                  <span>{data.read_count} reads</span>
                  <span style={{ color: '#c084fc', fontWeight: 500 }}>Read Article →</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}