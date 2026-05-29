/**
 * mwasalat-og — Cloudflare Worker
 * --------------------------------------------------------------
 * Detects social-media bots requesting share URLs (/t/* /g/* /c/*)
 * and answers with a server-rendered OG HTML produced by the
 * origin's NestJS controller (/api/og/preview/{kind}/{token}).
 *
 * For human browsers the worker is a transparent passthrough — they
 * still see the SPA. This split means:
 *   - WhatsApp/Facebook/Twitter/Telegram/Slack get an unfurled link.
 *   - Real users get the live SPA.
 *
 * Performance: previews are cached at the edge for EDGE_CACHE_TTL
 * seconds (default 300). Cache key includes the token + the user's
 * Accept-Language so preview text is localized correctly.
 */

const BOT_UA = /(WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Applebot|Pinterest|SkypeUriPreview|Google-InspectionTool|bingbot|Embedly|Bot|Crawler|Spider|MetaInspector)/i;

/** @type {ExportedHandler<{ ORIGIN_BASE: string; APP_ORIGIN: string; DEFAULT_LOCALE?: string; EDGE_CACHE_TTL_SECONDS?: string; OG_CACHE?: KVNamespace }>} */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isShareRoot = /^\/(t|g|c)\/[^/]+\/?$/.test(url.pathname);
    const ua = request.headers.get('user-agent') ?? '';
    const isBot = BOT_UA.test(ua);
    const ttl = clamp(Number(env.EDGE_CACHE_TTL_SECONDS ?? 300) || 300, 30, 86400);

    // ---- humans + non-share paths: passthrough to origin ----
    if (!isShareRoot || !isBot) return passthrough(request, env);

    // ---- bot on share root: serve preview HTML ----
    const [, kind, tokenRaw] = url.pathname.split('/');
    const token = sanitizeToken(decodeURIComponent(tokenRaw ?? ''));
    if (!token) return passthrough(request, env);

    const locale = pickLocale(request, env);
    const cacheKey = `og:${kind}:${token}:${locale}`;

    if (env.OG_CACHE) {
      const cached = await env.OG_CACHE.get(cacheKey);
      if (cached) {
        return htmlResponse(cached, ttl, true);
      }
    }

    const previewUrl = `${trim(env.ORIGIN_BASE)}/api/og/preview/${kind}/${encodeURIComponent(token)}`;
    let previewHtml;
    try {
      const upstream = await fetch(previewUrl, {
        headers: {
          'accept': 'text/html',
          'accept-language': locale,
          'x-locale': locale,
          'user-agent': `mwasalat-og-edge/${request.cf?.colo ?? 'edge'}`,
        },
        cf: {
          cacheTtl: ttl,
          cacheEverything: true,
        },
      });
      if (!upstream.ok) {
        // Fall back to passthrough so the bot still sees something.
        return passthrough(request, env);
      }
      previewHtml = await upstream.text();
    } catch (err) {
      return passthrough(request, env);
    }

    if (env.OG_CACHE && previewHtml) {
      ctx.waitUntil(env.OG_CACHE.put(cacheKey, previewHtml, { expirationTtl: ttl }));
    }
    return htmlResponse(previewHtml, ttl, false);
  },
};

function passthrough(request, env) {
  const url = new URL(request.url);
  const target = `${trim(env.APP_ORIGIN)}${url.pathname}${url.search}`;
  const init = {
    method: request.method,
    headers: forwardHeaders(request.headers),
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = request.body;
  }
  return fetch(target, init);
}

function forwardHeaders(src) {
  const out = new Headers();
  for (const [k, v] of src) {
    // Strip CF-internal headers; let the origin set its own.
    if (/^cf-/i.test(k)) continue;
    out.set(k, v);
  }
  return out;
}

function htmlResponse(body, ttl, fromCache) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${ttl}, stale-while-revalidate=${ttl * 4}`,
      'x-og-source': fromCache ? 'edge-kv' : 'origin',
      'vary': 'accept-language, user-agent',
    },
  });
}

function pickLocale(request, env) {
  const fallback = env.DEFAULT_LOCALE ?? 'ar';
  const header = request.headers.get('accept-language') ?? '';
  const match = header.match(/(ar|en|fr|pt)\b/i);
  return match ? match[1].toLowerCase() : fallback;
}

function sanitizeToken(value) {
  return (value ?? '').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '').slice(0, 120);
}

function trim(url) {
  return (url ?? '').replace(/\/+$/, '');
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
