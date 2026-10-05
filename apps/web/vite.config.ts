import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
// @ts-expect-error Policy is shared with the production Worker and its Node adapter.
import { SECURITY_HEADERS, META_CSP } from '../../scripts/security-policy.mjs';

const isolationHeaders: Record<string, string> = SECURITY_HEADERS;
function setIsolationHeaders(
  _request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  for (const [name, value] of Object.entries(isolationHeaders)) response.setHeader(name, value);
  next();
}
// Vite's static middleware returns 304 before applying its configured headers.
// Install the policy first so cached workers remain valid in WebKit too.
const workerPolicy: Plugin = {
  name: 'prophylens-worker-policy',
  configureServer(server) {
    server.middlewares.use((_req, response, next) => {
      for (const [name, value] of Object.entries(isolationHeaders)) response.setHeader(name, value);
      response.setHeader(
        'Content-Security-Policy',
        META_CSP.replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-inline'"),
      );
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use(setIsolationHeaders);
  },
  transformIndexHtml: {
    order: 'pre',
    handler(html, context) {
      const policy = context.server
        ? META_CSP.replace("'wasm-unsafe-eval'", "'wasm-unsafe-eval' 'unsafe-inline'")
        : META_CSP;
      return html.replace('__CSP_META__', policy);
    },
  },
};

export default defineConfig({
  plugins: [react(), workerPolicy],
  publicDir: '../../public',
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
});
