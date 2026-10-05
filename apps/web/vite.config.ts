import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
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
    server.middlewares.use(setIsolationHeaders);
  },
  configurePreviewServer(server) {
    server.middlewares.use(setIsolationHeaders);
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
