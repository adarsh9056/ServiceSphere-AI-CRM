/** Strip /graphql to get API origin for /api/upload. */
export function getApiBase() {
  const g = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql'
  if (g.startsWith('/')) return ''
  return g.replace(/\/graphql\/?$/, '')
}
