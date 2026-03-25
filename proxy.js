/**
 * proxy.js
 * Lightweight CORS proxy for the Tripo 3D API.
 *
 * Run:   node proxy.js
 * Then open index.html and the app will route API calls through
 * http://localhost:3001/v2/openapi/* -> https://api.tripo3d.ai/v2/openapi/*
 *
 * This is needed because Tripo's API does not include CORS headers,
 * so browsers block direct fetch() calls from the frontend.
 *
 * Compatible with Node.js >= 10 (CommonJS, no optional chaining).
 */

var http  = require('http');
var https = require('https');
var url   = require('url');

var PORT       = 3001;
var TRIPO_HOST = 'api.tripo3d.ai';
var API_PREFIX = '/v2/openapi';

var server = http.createServer(function (req, res) {
  // ── CORS headers (allow everything from any origin) ────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', '*');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only proxy paths that start with the API prefix
  if (req.url.indexOf(API_PREFIX) !== 0) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Proxy only handles /v2/openapi/* paths.');
    return;
  }

  // ── Forward to Tripo ───────────────────────────────────────────────────
  var parsed = url.parse('https://' + TRIPO_HOST + req.url);

  // Clone headers and fix host / remove browser-only headers
  var proxyHeaders = {};
  Object.keys(req.headers).forEach(function (key) {
    proxyHeaders[key] = req.headers[key];
  });
  proxyHeaders['host'] = TRIPO_HOST;
  delete proxyHeaders['origin'];
  delete proxyHeaders['referer'];

  var opts = {
    hostname: TRIPO_HOST,
    port:     443,
    path:     parsed.path,
    method:   req.method,
    headers:  proxyHeaders,
  };

  var proxyReq = https.request(opts, function (proxyRes) {
    // Copy response headers but strip any CORS headers from Tripo
    // (we already set our own above)
    var resHeaders = {};
    Object.keys(proxyRes.headers).forEach(function (key) {
      if (key.toLowerCase().indexOf('access-control') !== 0) {
        resHeaders[key] = proxyRes.headers[key];
      }
    });

    res.writeHead(proxyRes.statusCode, resHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', function (err) {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end('Proxy error: ' + err.message);
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, function () {
  console.log('');
  console.log('  CORS proxy listening on http://localhost:' + PORT);
  console.log('  Forwarding ' + API_PREFIX + '/* -> https://' + TRIPO_HOST + API_PREFIX + '/*');
  console.log('');
  console.log('  Open index.html in your browser — it is already configured');
  console.log('  to use this proxy via window.TRIPO_PROXY_URL.');
  console.log('');
});
