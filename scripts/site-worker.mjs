import { assets } from './assets.js';
import { SECURITY_HEADERS } from './security-policy.js';

// Serve the verified build directly. All routes, including cached worker responses,
// pass through the same policy instead of relying on a host's _headers support.
const decoded = new Map();
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const asset = Object.hasOwn(assets, path) ? assets[path] : undefined;
    const headers = new Headers(SECURITY_HEADERS);
    if (!['GET', 'HEAD'].includes(request.method)) {
      headers.set('Allow', 'GET, HEAD');
      return new Response(null, { status: 405, headers });
    }
    if (!asset) return new Response('Not found', { status: 404, headers });
    headers.set('Content-Type', asset.type);
    headers.set('ETag', '"' + asset.hash + '"');
    headers.set(
      'Cache-Control',
      path.startsWith('assets/') || url.searchParams.get('sha256') === asset.hash
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    );
    if (
      request.headers
        .get('If-None-Match')
        ?.split(',')
        .map((value) => value.trim())
        .includes(headers.get('ETag'))
    )
      return new Response(null, { status: 304, headers });
    if (request.method === 'HEAD') return new Response(null, { headers });
    if (!decoded.has(path))
      decoded.set(
        path,
        Uint8Array.from(atob(asset.body), (char) => char.charCodeAt(0)),
      );
    return new Response(decoded.get(path), { headers });
  },
};
