/**
 * proxy.js
 * Lightweight CORS proxy for the Tripo 3D API.
 *
 * Run:   node proxy.js
 * Then open index.html and the app will route API calls through
 * http://localhost:3001/v2/openapi/* → https://api.tripo3d.ai/v2/openapi/*
 *
 * This is needed because Tripo's API does not include CORS headers,
 * so browsers block direct fetch() calls from the frontend.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const PORT        = 3001;
const TRIPO_HOST  = 'api.tripo3d.ai';
const API_PREFIX  = '/v2/openapi';

const server = http.createServer((req, res) => {
  // ── CORS headers (allow everything from any origin) ──────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only proxy paths that start with the API prefix
  if (!req.url.startsWith(API_PREFIX)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Proxy only handles /v2/openapi/* paths.');
    return;
  }

  // ── Forward to Tripo ─────────────────────────────────────────────────────
  const target = new URL(`https://${TRIPO_HOST}${req.url}`);

  const proxyHeaders = { ...req.headers, host: TRIPO_HOST };
  delete proxyHeaders['origin'];
  delete proxyHeaders['referer'];

  const proxyReq = https.request(
    {
      hostname: target.hostname,
      port: 443,
      path: target.pathname + target.search,
      method: req.method,
      headers: proxyHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    },
  );

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + err.message);
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, () => {
  console.log(`CORS proxy listening on http://localhost:${PORT}`);
  console.log(`Forwarding ${API_PREFIX}/* → https://${TRIPO_HOST}${API_PREFIX}/*`);
  console.log('');
  console.log('Add this to your page (before main.js) or run in the console:');
  console.log(`  window.TRIPO_PROXY_URL = "http://localhost:${PORT}${API_PREFIX}";`);
});
