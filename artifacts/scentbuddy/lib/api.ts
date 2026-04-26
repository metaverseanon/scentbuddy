const domain = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_DOMAIN ?? '';

export const API_BASE_URL = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : '';

export function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    console.warn('[api] API_BASE_URL not configured — set EXPO_PUBLIC_API_URL');
    return '';
  }
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
