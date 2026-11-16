import {copyFile, cp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {aliases, enhance, filesUnder, readTexts, routes, site, unusedOriginals} from './project.mjs';
import {optimizeAssets, optimizeHtml, pagePath} from './optimize.mjs';

await rm('dist', {recursive: true, force: true});
await cp('site', 'dist', {recursive: true});
await writeFile('dist/.nojekyll', '');
// Navegadores pedem /favicon.ico em qualquer página; sem ele, cada visita gera um 404.
await copyFile('site/favicon-drv.ico', 'dist/favicon.ico');

for (const path of await filesUnder('dist')) {
  if (!path.endsWith('.html')) continue;
  const original = await readFile(path, 'utf8');
  await writeFile(path, enhance(original));
}

async function page(slug, html) {
  const path = 'dist/' + slug + '/index.html';
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, html);
}

const escape = text => text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const home = await readFile('site/index.html', 'utf8');
const headStart = home.indexOf('<script type="module"');
const moduleTag = home.slice(headStart, home.indexOf('</script>', headStart) + 9);
const headLinks = Array.from(home.matchAll(/<link\b[^>]+>/g), match => match[0])
  .filter(tag => !tag.includes('rel="canonical"') && !tag.includes('rel="preload"')).join('\n');
const headScripts = home.slice(home.indexOf('<script>'), headStart).match(/<script>[\s\S]*?<\/script>/g).join('\n');
for (const [slug, title] of Object.entries(routes)) {
  const canonical = site + '/' + slug;
  const description = escape(title + ' na DRV Certificações, certificadora ISO com atendimento em todo o Brasil.');
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">\n' +
    '<title>' + escape(title) + ' | DRV Certificações</title>\n' +
    '<meta name="description" content="' + description + '">\n' +
    '<meta name="robots" content="index, follow">\n' +
    '<link rel="canonical" href="' + canonical + '">\n' +
    '<meta property="og:title" content="' + escape(title) + ' | DRV Certificações">\n' +
    '<meta property="og:description" content="' + description + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n' +
    '<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR">\n' +
    '<meta property="og:image" content="' + site + '/assets/fundo-hero-otimizada.webp">\n' +
    headLinks + '\n' + headScripts + '\n' +
    moduleTag + '</head><body><div id="root"><main><h1>' + escape(title) + '</h1>' +
    '<p><a href="/">DRV Certificações</a> · <a href="mailto:comercial@drvcertificacoes.com.br">E-mail</a> · ' +
    '<a href="https://wa.me/5521999749929">WhatsApp</a></p></main></div>' +
    '<script src="/tracking-config.js"></script></body></html>';
  await page(slug, enhance(html));
}
// Páginas de redirecionamento para hospedagens sem .htaccess (o Apache responde 301 antes).
for (const [slug, target] of Object.entries(aliases)) {
  await page(slug, '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>DRV Certificações</title><meta name="robots" content="noindex">' +
    '<link rel="canonical" href="' + site + target + '">' +
    '<meta http-equiv="refresh" content="0;url=' + target + '"></head>' +
    '<body><a href="' + target + '">Acessar a página</a></body></html>');
}

const removed = await unusedOriginals('dist', await readTexts('dist'));
let bytes = 0;
for (const path of removed) {
  bytes += (await stat(path)).size;
  await rm(path);
}
// Desempenho e mobile: JS/CSS ajustados e páginas com fontes assíncronas, CSS crítico embutido
// e pré-carregamento da imagem principal e do JS de cada página.
const context = await optimizeAssets('dist');
for (const path of await filesUnder('dist')) {
  if (path.endsWith('.html')) await writeFile(path, optimizeHtml(await readFile(path, 'utf8'), pagePath(path), context));
}
await writeFile('build-removidos.txt', removed.map(path => path.slice(5)).join('\n') + '\n');
console.log('Build concluído em dist/. ' + removed.length + ' originais sem uso deixados de fora (' +
  (bytes / 1048576).toFixed(1) + ' MB).');
