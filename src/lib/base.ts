export function withBase(path: string, base = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.replace(/^\//, '');
  const combined = `${normalizedBase}${normalizedPath}`;
  return combined.replace(/([^:]\/)\/+/g, '$1');
}
