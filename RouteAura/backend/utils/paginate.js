export function paginate(query, defaults = { limit: 20, max: 100 }) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(defaults.max, Math.max(1, parseInt(query.limit, 10) || defaults.limit));
  return { page, limit, skip: (page - 1) * limit };
}

export const pageMeta = (total, { page, limit }) => ({ total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });

/** Escape user input before using it in a RegExp (search boxes). */
export const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
