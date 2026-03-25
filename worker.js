/**
 * worker.js — Cloudflare Worker CORS proxy for the Tripo 3D API.
 *
 * Deploy to Cloudflare Workers (free tier — 100k requests/day):
 *   1. Go to https://dash.cloudflare.com → Workers & Pages → Create
 *   2. Name it e.g. "tripo-proxy", click Create
 *   3. Click "Edit Code", paste this entire file, click Deploy
 *   4. Your proxy URL will be: https://tripo-proxy.<your-subdomain>.workers.dev
 *   5. Set that URL in index.html:
 *        window.TRIPO_PROXY_URL = "https://tripo-proxy.<you>.workers.dev/v2/openapi";
 *
 * Only requests from ALLOWED_ORIGINS are accepted — all others get 403.
 *
 * Routes:
 *   /v2/openapi/*   → forwarded to https://api.tripo3d.ai/v2/openapi/*
 *   /proxy?url=URL  → fetches URL and returns it with CORS headers
 *                     (used to download GLB models from Tripo's CDN)
 */

const TRIPO = 'https://api.tripo3d.ai';

// Origins allowed to use this proxy.
// Exact strings are matched directly; entries ending with ':*' match any port.
const ALLOWED_ORIGINS = [
  'https://mayolov.github.io',     // GitHub Pages (production)
  'http://localhost:*',            // Local dev (any port)
  'http://127.0.0.1:*',           // Local dev (any port)
];

/**
 * Check whether `origin` matches any entry in the allow-list.
 *  - Exact match:   "https://mayolov.github.io"
 *  - Wildcard port: "http://localhost:*" matches "http://localhost:5500"
 */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  for (const pattern of ALLOWED_ORIGINS) {
    if (pattern === origin) return true;
    if (pattern.endsWith(':*')) {
      const base = pattern.slice(0, pattern.length - 1);   // "http://localhost:"
      if (origin.startsWith(base) || origin === pattern.slice(0, pattern.length - 2)) {
        return true;
      }
    }
  }
  return false;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');

    // ── Reject disallowed origins ────────────────────────────────────────
    if (!isAllowedOrigin(origin)) {
      return new Response(
        JSON.stringify({ code: 403, message: 'Origin not allowed.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Handle CORS preflight ────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const url = new URL(request.url);

    // ── /proxy?url=<encoded-url>  — pass-through for CDN downloads ───────
    if (url.pathname === '/proxy') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ error: 'Missing ?url= parameter' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
        );
      }
      return proxyRequest(targetUrl, request, origin);
    }

    // ── /v2/openapi/* — forward to Tripo API ─────────────────────────────
    const tripoUrl = TRIPO + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.set('Host', 'api.tripo3d.ai');
    headers.delete('Origin');
    headers.delete('Referer');

    return proxyRequest(tripoUrl, request, origin, headers);
  },
};

async function proxyRequest(targetUrl, request, origin, headers) {
  if (!headers) {
    headers = new Headers();
  }

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? request.body
        : undefined,
    });

    const response = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });

    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      response.headers.set(k, v);
    }

    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Expose-Headers': '*',
    'Vary': 'Origin',
  };
}
