export const formatDateShort = (ds) => {
  if (!ds) return '—';
  const parts = String(ds).split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  }
  return new Date(ds).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

export const formatDateLong = raw => {
  try {
    return new Date(raw + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return raw || '___________';
  }
};
