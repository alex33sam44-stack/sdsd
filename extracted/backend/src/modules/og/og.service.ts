import { Injectable } from '@nestjs/common';
import type { OgKind, OgPreview } from './og.types';

type SharedTripRow = {
  from_location?: string | null;
  to_location?: string | null;
  transport?: string | null;
  status?: string | null;
  owner_name?: string | null;
};

type GroupTripRow = {
  title?: string | null;
  from_location?: string | null;
  to_location?: string | null;
  transport?: string | null;
  depart_at?: string | null;
  joins_count?: number | null;
  creator_name?: string | null;
};

type ChannelRow = {
  name?: string | null;
  description?: string | null;
  members_count?: number | null;
};

const DEFAULT_APP_NAME = 'مواصلات';
const DEFAULT_DESCRIPTION = 'قبل ما تنزل، اعرف تركب إيه، هتدفع كام، والزحمة فين.';

function clean(value: string | null | undefined, fallback = ''): string {
  return (value ?? '').trim() || fallback;
}

function safeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '').slice(0, 120);
}

function deterministicMetric(seed: string, min: number, max: number): number {
  const sum = Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return min + (sum % (max - min + 1));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getPublicAppUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL || process.env.BILLING_APP_URL || process.env.APP_REDIRECT_URI;
  if (explicit) return explicit.replace(/\/$/, '');
  const domain = process.env.APP_DOMAIN;
  return domain ? `https://${domain}` : 'https://mwasalat.app';
}

@Injectable()
export class OgService {
  async buildPreview(kind: OgKind, rawTokenOrSlug: string): Promise<OgPreview> {
    const tokenOrSlug = safeToken(rawTokenOrSlug);
    const appUrl = getPublicAppUrl();
    const url = `${appUrl}/${kind}/${encodeURIComponent(tokenOrSlug)}`;

    if (kind === 't') return this.tripPreview(tokenOrSlug, url);
    if (kind === 'g') return this.groupPreview(tokenOrSlug, url);
    return this.channelPreview(tokenOrSlug, url);
  }

  renderHtml(preview: OgPreview): string {
    const title = escapeHtml(preview.title);
    const description = escapeHtml(preview.description);
    const url = escapeHtml(preview.url);
    const image = escapeHtml(preview.imageUrl);
    const app = escapeHtml(DEFAULT_APP_NAME);

    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:site_name" content="${app}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ar_EG" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:image:type" content="image/svg+xml" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  <meta http-equiv="refresh" content="0; url=${url}" />
</head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;background:#081a33;color:#fff;display:grid;min-height:100vh;place-items:center;text-align:center">
  <main style="max-width:680px;padding:32px">
    <h1 style="font-size:36px;margin:0 0 12px">${title}</h1>
    <p style="font-size:18px;opacity:.86;margin:0 0 24px">${description}</p>
    <a href="${url}" style="display:inline-block;background:#facc15;color:#06142a;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 24px">افتح على مواصلات</a>
  </main>
</body>
</html>`;
  }

  renderSvg(preview: OgPreview): string {
    const title = escapeHtml(preview.title);
    const description = escapeHtml(preview.description);
    const eyebrow = escapeHtml(preview.eyebrow);
    const hero = escapeHtml(preview.hero);
    const routeLabel = escapeHtml(preview.routeLabel);
    const badge = escapeHtml(preview.badge);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#06142a"/>
      <stop offset="0.55" stop-color="#0b3a78"/>
      <stop offset="1" stop-color="#071527"/>
    </linearGradient>
    <radialGradient id="glow" cx="75%" cy="25%" r="60%">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g opacity="0.18" stroke="#93c5fd" stroke-width="2" fill="none">
    <path d="M62 84 C170 118 232 60 340 110 S520 142 650 84 S880 12 1120 74"/>
    <path d="M70 538 C230 448 330 570 488 492 S770 380 1120 498"/>
    <circle cx="180" cy="122" r="8" fill="#facc15" stroke="none"/>
    <circle cx="785" cy="68" r="8" fill="#facc15" stroke="none"/>
    <circle cx="995" cy="514" r="8" fill="#facc15" stroke="none"/>
  </g>
  <rect x="72" y="64" width="1056" height="502" rx="46" fill="#0b2a55" opacity="0.84" stroke="#60a5fa" stroke-opacity="0.45"/>
  <text x="1040" y="122" text-anchor="end" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="54" font-weight="900" fill="#fff">مواصلات</text>
  <circle cx="976" cy="102" r="17" fill="#facc15"/>
  <text x="1040" y="168" text-anchor="end" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="24" font-weight="700" fill="#cbd5e1">كل مشوار... أسهل وأوفر</text>
  <rect x="704" y="198" width="360" height="54" rx="27" fill="#facc15" filter="url(#shadow)"/>
  <text x="884" y="235" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="28" font-weight="900" fill="#071527">${eyebrow}</text>
  <text x="1042" y="326" text-anchor="end" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="76" font-weight="900" fill="#fff">${hero}</text>
  <text x="1042" y="390" text-anchor="end" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="42" font-weight="800" fill="#facc15">${routeLabel}</text>
  <text x="1042" y="438" text-anchor="end" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="27" font-weight="700" fill="#dbeafe">${description}</text>
  <rect x="692" y="468" width="372" height="58" rx="29" fill="#facc15"/>
  <text x="878" y="506" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="30" font-weight="900" fill="#071527">جرّب طريقك</text>
  <rect x="116" y="378" width="420" height="148" rx="32" fill="#ffffff" opacity="0.95"/>
  <text x="326" y="430" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="30" font-weight="900" fill="#071527">${badge}</text>
  <text x="326" y="476" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="24" font-weight="700" fill="#334155">${routeLabel}</text>
  <text x="326" y="516" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="22" font-weight="700" fill="#0ea5e9">mwasalat.app</text>
  <g transform="translate(140 148)" opacity="0.95">
    <rect x="0" y="74" width="260" height="110" rx="28" fill="#0f172a" stroke="#38bdf8" stroke-opacity="0.45"/>
    <circle cx="62" cy="132" r="34" fill="#facc15"/>
    <rect x="102" y="104" width="118" height="50" rx="14" fill="#1d4ed8"/>
    <text x="160" y="138" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="Tahoma, Arial, sans-serif" font-size="20" font-weight="900" fill="#fff">مواصلات</text>
  </g>
</svg>`;
  }

  private async tripPreview(token: string, url: string): Promise<OgPreview> {
    const row = null as SharedTripRow | null;
    const from = clean(row?.from_location, 'شبرا');
    const to = clean(row?.to_location, 'التحرير');
    const transport = clean(row?.transport, 'مترو/ميكروباص');
    const status = row?.status === 'active' ? 'رحلة لايف دلوقتي' : 'رابط طريق مشترك';
    const minutes = deterministicMetric(`${token}:${from}:${to}`, 24, 58);
    const fare = deterministicMetric(`${to}:${token}:${from}`, 10, 34);
    return this.withImage({
      kind: 't',
      title: `أسرع طريق من ${from} إلى ${to}`,
      description: `التكلفة المتوقعة: ${fare} جنيه — الوقت: ${minutes} دقيقة. ${transport} على مواصلات.`,
      eyebrow: status,
      hero: `${minutes} دقيقة • ${fare} جنيه`,
      routeLabel: `${from} - ${to}`,
      badge: row?.owner_name ? `رحلة ${row.owner_name}` : 'افتح الطريق بدون تسجيل',
      url,
      imageUrl: '',
    });
  }

  private async groupPreview(token: string, url: string): Promise<OgPreview> {
    const row = null as GroupTripRow | null;
    const from = clean(row?.from_location, 'فيصل');
    const to = clean(row?.to_location, 'مدينة نصر');
    const count = Number(row?.joins_count ?? 0);
    const when = row?.depart_at ? new Date(row.depart_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : 'دلوقتي';
    return this.withImage({
      kind: 'g',
      title: clean(row?.title, `رحلة جماعية من ${from} إلى ${to}`),
      description: `${count} راكب ماشيين سوا — ${when}. افتح اللينك وانضم للجروب.`,
      eyebrow: 'رحلة جماعية',
      hero: 'أنا كمان رايح',
      routeLabel: `${from} - ${to}`,
      badge: `${count} مشارك`,
      url,
      imageUrl: '',
    });
  }

  private async channelPreview(slug: string, url: string): Promise<OgPreview> {
    const row = null as ChannelRow | null;
    const readableSlug = slug.replaceAll('-', ' ');
    const name = clean(row?.name, `قناة ${readableSlug}`);
    const members = Number(row?.members_count ?? 0);
    return this.withImage({
      kind: 'c',
      title: `${name} — شات الطريق لايف`,
      description: clean(row?.description, `${members} عضو بيتابعوا الزحمة والمواعيد على نفس الخط.`),
      eyebrow: 'شات خط مباشر',
      hero: 'اسأل الراكبين دلوقتي',
      routeLabel: name,
      badge: members ? `${members} عضو` : 'تحديثات مباشرة',
      url,
      imageUrl: '',
    });
  }

  private withImage(preview: OgPreview): OgPreview {
    const imageUrl = `${getPublicAppUrl()}/api/og/image/${preview.kind}/${encodeURIComponent(preview.url.split('/').pop() ?? 'share')}.svg`;
    return { ...preview, imageUrl };
  }

}
