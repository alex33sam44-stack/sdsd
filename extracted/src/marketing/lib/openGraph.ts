export type ShareOgMeta = {
  title: string;
  description: string;
  url?: string;
  image?: string;
};

function ensureMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    document.head.appendChild(el);
  }
  return el;
}

export function buildOgImageUrl(kind: 't' | 'g' | 'c', tokenOrSlug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/api/og/image/${kind}/${encodeURIComponent(tokenOrSlug)}.svg`;
}

export function setShareMeta(meta: ShareOgMeta) {
  if (typeof document === 'undefined') return;
  const url = meta.url ?? window.location.href;
  const image = meta.image ?? `${window.location.origin}/placeholder.svg`;

  document.title = meta.title;
  ensureMeta('meta[name="description"]', { name: 'description' }).content = meta.description;
  ensureMeta('meta[property="og:site_name"]', { property: 'og:site_name' }).content = 'مواصلات';
  ensureMeta('meta[property="og:type"]', { property: 'og:type' }).content = 'website';
  ensureMeta('meta[property="og:locale"]', { property: 'og:locale' }).content = 'ar_EG';
  ensureMeta('meta[property="og:title"]', { property: 'og:title' }).content = meta.title;
  ensureMeta('meta[property="og:description"]', { property: 'og:description' }).content = meta.description;
  ensureMeta('meta[property="og:url"]', { property: 'og:url' }).content = url;
  ensureMeta('meta[property="og:image"]', { property: 'og:image' }).content = image;
  ensureMeta('meta[property="og:image:secure_url"]', { property: 'og:image:secure_url' }).content = image;
  ensureMeta('meta[property="og:image:width"]', { property: 'og:image:width' }).content = '1200';
  ensureMeta('meta[property="og:image:height"]', { property: 'og:image:height' }).content = '630';
  ensureMeta('meta[name="twitter:card"]', { name: 'twitter:card' }).content = 'summary_large_image';
  ensureMeta('meta[name="twitter:title"]', { name: 'twitter:title' }).content = meta.title;
  ensureMeta('meta[name="twitter:description"]', { name: 'twitter:description' }).content = meta.description;
  ensureMeta('meta[name="twitter:image"]', { name: 'twitter:image' }).content = image;
}
