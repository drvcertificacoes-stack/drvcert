import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, resolve, sep} from 'node:path';
import {gzipSync} from 'node:zlib';
import {aliases} from './project.mjs';

// Prévia local que reproduz as regras principais do .htaccess (301 de atalhos e da barra final).
const root = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const isDir = path => stat(path).then(info => info.isDirectory(), () => false);

function redirectFor(pathname) {
  const slug = pathname.replace(/^\/|\/$/g, '');
  if (aliases[slug]) return aliases[slug];
  const consult = slug.match(/^consultoria\/([a-z0-9-]+)$/);
  if (consult) return '/certificacoes/' + consult[1];
  if (/(^|\/)index\.html$/.test(pathname)) return pathname.replace(/index\.html$/, '').replace(/(.)\/$/, '$1');
  return null;
}

const port = Number(process.env.DRV_PORT || 4173);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/lead.php') {
      response.writeHead(503, {'Content-Type': types['.json']});
      response.end(JSON.stringify({ok: false, message: 'Envio SMTP disponível na hospedagem PHP. Use o e-mail ou WhatsApp.'}));
      return;
    }
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Arquivo fora da raiz');
    if (/(^|\/)\.(?!well-known\/)/.test(url.pathname)) throw new Error('Arquivo oculto');
    let location = redirectFor(url.pathname);
    if (!location && url.pathname.length > 1 && url.pathname.endsWith('/') && await isDir(path)) {
      location = url.pathname.slice(0, -1);
    }
    if (location) {
      response.writeHead(301, {Location: location + url.search});
      response.end();
      return;
    }
    if (await isDir(path)) path = join(path, 'index.html');
    let bytes = await readFile(path);
    const type = types[extname(path)] ?? 'application/octet-stream';
    const headers = {'Content-Type': type};
    // Compressão gzip como o mod_deflate do Apache, para medir desempenho de forma realista.
    if (/text|javascript|json|xml|svg/.test(type) && /gzip/.test(request.headers['accept-encoding'] ?? '')) {
      bytes = gzipSync(bytes);
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
    }
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404, {'Content-Type': types['.html']});
    response.end(await readFile(join(root, '404.html')).catch(() => 'Página não encontrada'));
  }
});
server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
