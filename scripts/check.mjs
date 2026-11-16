import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {join, relative} from 'node:path';
import {aliases, bundle, enhance, filesUnder, readTexts, routes, site, unusedOriginals, urlPath} from './project.mjs';
import {assetContext, builtBundle, expectedFormFields, jsVersion, optimizeHtml, pagePath, patchForms} from './optimize.mjs';
const context = await assetContext('dist');

const exists = path => access(path).then(() => true, () => false);
async function assertLocal(url, from) {
  const clean = decodeURIComponent(url.replace(/[?#].*$/, ''));
  const target = join('dist', clean);
  const ok = /\.[a-z\d]+$/i.test(clean) ? await exists(target) :
    await exists(join(target, 'index.html')) || clean === '/';
  assert.ok(ok, 'Recurso ausente: ' + url + ' (em ' + from + ')');
}
const canonicals = new Map();
let pages = 0;

// Páginas do backup: marcação original preservada, título, viewport, canônica e recursos.
for (const source of await filesUnder('site')) {
  if (!source.endsWith('.html')) continue;
  const original = await readFile(source, 'utf8');
  const path = relative('site', source);
  const result = await readFile(join('dist', path), 'utf8');
  // Marcação original preservada: só as transformações explícitas do build.
  assert.equal(result, optimizeHtml(enhance(original), pagePath(join('dist', path)), context), path);
  assert.ok(!/<link [^>]*fonts\.googleapis\.com\/css2[^>]*rel="stylesheet"/.test(result.replace(/<noscript>.*?<\/noscript>/gs, '')), 'Fonte bloqueante: ' + path);
  assert.match(result, /<meta\s+name=["']viewport["']/i, path);
  assert.match(result, /<title>[^<]+<\/title>/i, path);
  const canonical = result.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const robots = result.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? '';
  if (!robots.includes('noindex')) {
    assert.ok(canonical, 'Sem canônica: ' + path);
    const expected = site + urlPath(path).replace(/\/?index\.html$/, '') || site + '/';
    assert.equal(canonical, expected === site ? site + '/' : expected, 'Canônica diferente da URL do arquivo: ' + path);
    canonicals.set(canonical, path);
  }
  for (const [, url] of result.matchAll(/(?:href|src)=["'](\/[^ "'#?]*)[^"']*["']/g)) {
    if (!url.startsWith('//')) await assertLocal(url, path);
  }
  for (const [, url] of result.matchAll(new RegExp('"' + site.replace(/\./g, '\\.') + '(/[^"#?]*\\.[a-z\\d]+)"', 'gi'))) {
    await assertLocal(url, path);
  }
  pages += 1;
}

// Imagens, PDFs e chunks citados no JavaScript e no CSS.
for (const [path, text] of await readTexts('dist/assets')) {
  for (const [, url] of text.matchAll(/["'(`](\/assets\/[^"'()`$\s]+\.(?:png|jpe?g|webp|svg|ico|pdf|css|js))["')`]/gi)) {
    await assertLocal(url, path);
  }
  for (const [, chunk] of text.matchAll(/["'`]\.\/([\w.-]+\.(?:js|css))["'`]/g)) {
    await assertLocal('/assets/' + chunk, path);
  }
}

for (const route of Object.keys(routes)) {
  const html = await readFile(join('dist', route, 'index.html'), 'utf8');
  assert.match(html, new RegExp('<link rel="canonical" href="' + site + '/' + route + '">'), route);
}
const htaccess = await readFile('dist/.htaccess', 'utf8');
for (const [route, target] of Object.entries(aliases)) {
  const html = await readFile(join('dist', route, 'index.html'), 'utf8');
  assert.ok(html.includes('url=' + target + '"'), route);
  await assertLocal(target, route);
  assert.ok(htaccess.split('\n').some(line => line.includes('RewriteRule') && line.includes(route) &&
    line.includes(' ' + target + ' [R=301')), 'Sem 301 no .htaccess para /' + route);
}

const sitemap = await readFile('dist/sitemap.xml', 'utf8');
const listed = new Set();
for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  assert.ok(canonicals.has(url), 'Sitemap com URL que não é canônica: ' + url);
  listed.add(url);
}
for (const url of canonicals.keys()) assert.ok(listed.has(url), 'Página indexável fora do sitemap: ' + url);
assert.match(await readFile('dist/robots.txt', 'utf8'), new RegExp('Sitemap: ' + site + '/sitemap.xml'));
await access('dist/favicon.ico');
await access('dist/404.html');

const generated = await readFile(join('dist', builtBundle), 'utf8');
const patched = patchForms((await readFile(join('site', bundle), 'utf8')).replaceAll(...jsVersion));
assert.equal(patched.count, expectedFormFields);
assert.equal(generated, patched.js);
for (const path of await filesUnder('dist/assets')) assert.ok(!path.includes(jsVersion[0]), 'JS com versão antiga: ' + path);
assert.deepEqual(await unusedOriginals('dist', await readTexts('dist')), [], 'Originais sem uso no build');
console.log(pages + ' páginas verificadas. Marcação, canônicas, sitemap, redirecionamentos e recursos conferidos.');
