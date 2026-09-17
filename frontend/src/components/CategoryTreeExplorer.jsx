import React, { useState } from 'react';

function TreeNode({ node, onSelectCategory, selectedId }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.subcategories && node.subcategories.length > 0;
  const isSelected = String(selectedId) === String(node.category_id);

  return (
    <div style={{ marginLeft: node.depth * 12, marginBottom: '0.25rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.25rem 0.5rem',
        borderRadius: 4,
        backgroundColor: isSelected ? '#27272a' : 'transparent',
        cursor: 'pointer'
      }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              padding: '0 0.2rem',
              fontSize: '0.75rem'
            }}
          >
            {expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: 14, display: 'inline-block' }} />
        )}

        <span
          onClick={() => onSelectCategory(node.category_id)}
          style={{
            fontSize: '0.825rem',
            color: isSelected ? '#fff' : '#d4d4d8',
            flex: 1,
            fontWeight: isSelected ? 600 : 400
          }}
        >
          {node.name}
        </span>

        {node.article_count > 0 && (
          <span style={{ fontSize: '0.7rem', color: '#71717a' }}>
            {node.article_count}
          </span>
        )}
      </div>

      {hasChildren && expanded && (
        <div style={{ borderLeft: '1px solid #1f1f23', marginLeft: '0.6rem', paddingLeft: '0.4rem' }}>
          {node.subcategories.map(child => (
            <TreeNode
              key={child.category_id}
              node={child}
              onSelectCategory={onSelectCategory}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTreeExplorer({ tree, onSelectCategory, selectedId }) {
  return (
    <div style={{
      backgroundColor: '#0d0d0f',
      border: '1px solid #1f1f23',
      borderRadius: 6,
      padding: '1rem',
      maxHeight: 500,
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#a1a1aa', textTransform: 'uppercase' }}>
          Categories Tree
        </h4>
        {selectedId && (
          <button
            type="button"
            onClick={() => onSelectCategory('')}
            style={{ background: 'none', border: 'none', color: '#a855f7', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            Clear Filter
          </button>
        )}
      </div>

      {tree.length === 0 ? (
        <p style={{ color: '#71717a', fontSize: '0.8rem', margin: 0 }}>No categories found</p>
      ) : (
        tree.map(rootNode => (
          <TreeNode
            key={rootNode.category_id}
            node={rootNode}
            onSelectCategory={onSelectCategory}
            selectedId={selectedId}
          />
        ))
      )}
    </div>
  );
}