import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { build } from './build.mjs';

const { output, config } = await build();
const port = Number(process.env.PORT ?? 3300);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid integer');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};
createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    if (pathname === config.base.slice(0, -1) && config.base !== '/') {
      res.writeHead(308, { Location: config.base });
      res.end();
      return;
    }
    if (config.base !== '/' && !pathname.startsWith(config.base)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await readFile(resolve(output, '404.html')));
      return;
    }
    const relative = pathname.slice(config.base.length);
    let file = resolve(output, relative);
    if (
      (file !== output && !file.startsWith(`${output}${sep}`)) ||
      relative.includes('\0') ||
      relative.split('/').some((p) => p.startsWith('.'))
    ) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    let info;
    try {
      info = await stat(file);
    } catch {}
    if (info?.isDirectory()) file = resolve(file, 'index.html');
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = resolve(output, '404.html');
      body = await readFile(file);
      res.statusCode = 404;
    }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500);
    res.end('Server error');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`SignalKit site: http://localhost:${port}${config.base}`),
);
