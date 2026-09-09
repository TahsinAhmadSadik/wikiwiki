export const getRoleConfig = (globalRole, wikiRole = null) => {
  if (globalRole === 'owner') {
    return { label: 'Site Owner', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: '♛' };
  }
  if (globalRole === 'admin') {
    return { label: 'Global Admin', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: '⬟' };
  }
  if (wikiRole === 'author') {
    return { label: 'Wiki Author', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: '✎' };
  }
  if (wikiRole === 'co_author') {
    return { label: 'Co-Author', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: '↔' };
  }
  return { label: 'Contributor', color: '#71717a', bg: 'rgba(113, 113, 122, 0.15)', icon: '▤' };
};