import React, { useState, useMemo } from 'react';

function TreeNode({ node, onSelectCategory, selectedId, level = 0 }) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = String(selectedId) === String(node.category_id);

  return (
    <div style={{ marginLeft: level > 0 ? '0.75rem' : 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.35rem 0.5rem',
          borderRadius: 4,
          backgroundColor: isSelected ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
          border: isSelected ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid transparent',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
        onClick={() => onSelectCategory(isSelected ? '' : String(node.category_id))}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
          {hasChildren ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              style={{
                color: '#71717a',
                fontSize: '0.7rem',
                userSelect: 'none',
                width: 14,
                display: 'inline-block',
                textAlign: 'center'
              }}
            >
              {isOpen ? '▼' : '▶'}
            </span>
          ) : (
            <span style={{ width: 14, display: 'inline-block', color: '#52525b', fontSize: '0.65rem' }}>•</span>
          )}

          <span
            style={{
              fontSize: '0.85rem',
              color: isSelected ? '#c084fc' : '#d4d4d8',
              fontWeight: isSelected ? 600 : 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {node.name}
          </span>
        </div>

        <span style={{ fontSize: '0.7rem', color: '#71717a', marginLeft: '0.5rem' }}>
          {node.article_count || 0}
        </span>
      </div>

      {hasChildren && isOpen && (
        <div style={{ borderLeft: '1px solid #27272a', marginLeft: '0.5rem', marginTop: '0.15rem' }}>
          {node.children.map((child) => (
            <TreeNode
              key={child.category_id}
              node={child}
              onSelectCategory={onSelectCategory}
              selectedId={selectedId}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTreeExplorer({ tree = [], onSelectCategory, selectedId }) {
  // Convert flat category list into a nested tree structure
  const rootNodes = useMemo(() => {
    if (!Array.isArray(tree) || tree.length === 0) return [];
    if (tree[0]?.children) return tree;

    const map = {};
    const roots = [];

    tree.forEach((cat) => {
      map[cat.category_id] = { ...cat, children: [] };
    });

    tree.forEach((cat) => {
      if (cat.parent_id && map[cat.parent_id]) {
        map[cat.parent_id].children.push(map[cat.category_id]);
      } else {
        roots.push(map[cat.category_id]);
      }
    });

    return roots;
  }, [tree]);

  return (
    <div
      style={{
        backgroundColor: '#0d0d0f',
        border: '1px solid #1f1f23',
        borderRadius: 6,
        padding: '1.25rem'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <h4
          style={{
            fontSize: '0.75rem',
            color: '#a1a1aa',
            textTransform: 'uppercase',
            margin: 0,
            letterSpacing: '0.05em',
            fontWeight: 700
          }}
        >
          Categories Tree
        </h4>

        {selectedId && (
          <button
            type="button"
            onClick={() => onSelectCategory('')}
            style={{
              background: 'none',
              border: 'none',
              color: '#a855f7',
              fontSize: '0.72rem',
              cursor: 'pointer',
              padding: 0
            }}
          >
            Clear Filter ✕
          </button>
        )}
      </div>

      {rootNodes.length === 0 ? (
        <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>No categories found</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {rootNodes.map((root) => (
            <TreeNode
              key={root.category_id}
              node={root}
              onSelectCategory={onSelectCategory}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}