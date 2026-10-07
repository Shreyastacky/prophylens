import { createServer } from 'node:http';
import worker from '../dist/server/index.js';
const port = Number(process.env.PORT ?? 5174);
createServer(async (incoming, outgoing) => {
  try {
    const response = await worker.fetch(
      new Request(`http://127.0.0.1:${port}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
      }),
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(
      incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()),
    );
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end('Unable to serve release');
  }
}).listen(port, '127.0.0.1', () => console.log(`Production release on http://127.0.0.1:${port}`));
