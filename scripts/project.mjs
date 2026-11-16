import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {basename, extname, join, relative, sep} from 'node:path';

export const site = 'https://drvcertificacoes.com.br';
export const bundle = 'assets/index-DvQDi8s_-drv-seo-v15-20261106.js';
export const viewportTag = '    <meta name="viewport" content="width=device-width, initial-scale=1" data-drv-extension>\n';

// Rotas do aplicativo React sem página pré-renderizada no backup.
export const routes = {
  'solicitar-proposta': 'Solicitar proposta',
  'trabalhe-conosco': 'Trabalhe conosco',
  'validacao-digital': 'Validação digital',
  'codigo-conduta': 'Código de conduta',
};
// Atalhos e endereços antigos. Em Apache, o .htaccess responde 301 antes destas páginas.
// As URLs canônicas do site não terminam com barra.
export const aliases = {
  sobre: '/sobre-nos', empresa: '/sobre-nos', iso: '/certificacoes',
  'certificacoes-iso': '/certificacoes', consultoria: '/certificacoes',
  clientes: '/depoimentos', contato: '/solicitar-proposta',
  'certificacoes-tecnicas-regulatorias-e-setoriais': '/certificacoes-regulatorias',
};

export async function filesUnder(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : path;
  }))).flat();
}

export function enhance(html) {
  const viewport = /<meta\s+name=["']viewport["']/i.test(html) ? '' : viewportTag;
  return html.replace('</head>', () => viewport + '</head>');
}

export const urlPath = path => '/' + path.split(sep).join('/');
const textTypes = new Set(['.html', '.js', '.mjs', '.css', '.xml', '.txt', '.json', '.php', '.webmanifest']);
const rasterTypes = new Set(['.png', '.jpg', '.jpeg']);

export async function readTexts(dir) {
  const texts = new Map();
  for (const path of await filesUnder(dir)) {
    if (textTypes.has(extname(path).toLowerCase())) texts.set(path, await readFile(path, 'utf8'));
  }
  return texts;
}

// Originais pesados que o site não usa: PNG/JPG sem nenhuma referência no HTML, JS ou CSS
// e que já têm versão WebP, além de cópias idênticas sem referência. Ficam em site/ como
// fonte, mas não vão para dist/.
export async function unusedOriginals(dir, texts) {
  const corpus = [...texts.values()].join('\n');
  const files = (await filesUnder(dir)).filter(path => relative(dir, path).startsWith('assets' + sep));
  const names = new Set(files.map(path => relative(dir, path)));
  const referenced = path => corpus.includes(basename(path)) ||
    corpus.includes(encodeURI(basename(path)));
  const result = [];
  const seen = new Set();
  const hashOf = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  // Arquivos referenciados primeiro, para que a cópia sem uso seja a descartada.
  const ordered = [...files.filter(referenced), ...files.filter(path => !referenced(path))];
  for (const path of ordered) {
    const rel = relative(dir, path);
    const ext = extname(rel).toLowerCase();
    const stem = rel.slice(0, -ext.length);
    const hash = await hashOf(path);
    if (referenced(path)) { seen.add(hash); continue; }
    if (seen.has(hash) || (rasterTypes.has(ext) &&
      (names.has(stem + '.webp') || names.has(stem + '-otimizada.webp')))) {
      result.push(path);
      continue;
    }
    seen.add(hash);
  }
  return result.sort();
}
