import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../apps/web/out/', import.meta.url));
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (base && pathname !== base && !pathname.startsWith(base + '/')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    pathname = pathname.slice(base.length);
    let target = path.resolve(root, '.' + (pathname || '/'));
    if (target !== path.resolve(root) && !target.startsWith(path.resolve(root) + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    res.writeHead(200, {
      'Content-Type': types[path.extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada. Abra a raiz do site e navegue pelos links do Operis.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Operis estático: http://127.0.0.1:${port}${base}/`));
