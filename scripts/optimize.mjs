// Otimizações aplicadas pelo build sobre a cópia em dist/. Os arquivos de site/ continuam
// iguais ao backup; cada ajuste aqui é explícito e conferido pelo check.
import {readFile, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {bundle, filesUnder} from './project.mjs';

// Versão dos arquivos JS. Muda quando o build altera o JS, para o cache longo do .htaccess
// não manter a versão anterior no navegador dos visitantes.
export const jsVersion = ['drv-seo-v15-20261106', 'drv-seo-v16-20261116'];
export const builtBundle = bundle.replace(...jsVersion);

const fontsHref = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&amp;family=Inter:wght@400;500;600;700&amp;display=swap';
const heroImage = '/assets/drv/world-map-network.webp';

// Fontes de reserva com métricas próximas de Poppins e Inter: o texto aparece na hora
// e quase não se move quando a fonte do Google chega.
const extraCss = `
@font-face{font-family:"Poppins Fallback";src:local("Arial"),local("Helvetica"),local("Roboto");size-adjust:112.1%;ascent-override:93.62%;descent-override:31.21%;line-gap-override:8.92%}
@font-face{font-family:"Inter Fallback";src:local("Arial"),local("Helvetica"),local("Roboto");size-adjust:107.12%;ascent-override:90.44%;descent-override:22.52%;line-gap-override:0%}
footer>div.border-t{padding-inline:clamp(1rem,4.5vw,1.5rem);color:#94a3b8}
.drv-testimonial-pages{gap:0}
.drv-testimonial-pages button,.drv-testimonial-pages button.is-current{position:relative;width:24px;height:24px;padding:0;background:transparent}
.drv-testimonial-pages button:before{content:"";position:absolute;left:50%;top:50%;width:.42rem;height:.42rem;border-radius:999px;background:#cbd5e1;transform:translate(-50%,-50%);transition:width .18s,background-color .18s}
.drv-testimonial-pages button.is-current:before{width:1.1rem;background:#e12713}
@media (max-width:1023px){
footer a{min-height:24px}
footer a.inline-block{display:inline-flex;align-items:center}
footer a:is(.flex,.inline-flex),main a.inline-flex{min-height:24px;align-items:center}
}`.trim();

// Campos dos formulários: nome, preenchimento automático no celular e teclado de telefone.
const fieldProps = {
  name: '"name":"nome",autoComplete:"name",',
  company: '"name":"empresa",autoComplete:"organization",',
  phone: '"name":"telefone",type:"tel",inputMode:"tel",autoComplete:"tel",',
  email: '"name":"email",autoComplete:"email",',
  message: '"name":"mensagem",',
  service: '"name":"servico",',
  interest: '"name":"interesse",',
};
export const expectedFormFields = 10;

export function patchForms(js) {
  let count = 0;
  const out = js.replace(/(jsxs?)\("(input|textarea|select)",\{([\s\S]{0,400}?className:)/g, (match, fn, tag, props) => {
    const field = props.match(/^(?:required:!0,)?(?:type:"\w+",)?value:\w+\.(\w+)/)?.[1];
    if (!fieldProps[field] || props.includes('"name":')) return match;
    const placeholder = props.match(/placeholder:"([^"]+)"/)?.[1];
    const label = placeholder && field !== 'email' && !props.includes('"aria-label"') ? '"aria-label":"' + placeholder + '",' : '';
    count += 1;
    return fn + '("' + tag + '",{' + fieldProps[field] + label + props;
  });
  return {js: out, count};
}

export function patchCss(css) {
  return css
    .replace('font-family:Inter,sans-serif', 'font-family:Inter,"Inter Fallback",sans-serif')
    .replace('font-family:Poppins,sans-serif', 'font-family:Poppins,"Poppins Fallback",sans-serif');
}

// Rotas do React e o arquivo JS de cada página, lidos do próprio bundle.
export function routeChunks(mainJs) {
  const lazy = new Map(Array.from(mainJs.matchAll(/(\w+)=T\.lazy\(\(\)=>\w+\(\(\)=>import\("\.\/([^"]+)"\)/g), m => [m[1], m[2]]));
  return Array.from(mainJs.matchAll(/path:"([^"]+)",component:(\w+)/g), m => [m[1], lazy.get(m[2])])
    .filter(([, chunk]) => chunk);
}
function chunkFor(pathname, routes) {
  for (const [route, chunk] of routes) {
    const pattern = new RegExp('^' + route.replace(/:\w+/g, '[^/]+') + '$');
    if (pattern.test(pathname)) return chunk;
  }
  return null;
}

export async function optimizeAssets(dir) {
  const assets = join(dir, 'assets');
  for (const path of await filesUnder(assets)) {
    if (path.endsWith('.css') && path.includes('index-')) await writeFile(path, patchCss(await readFile(path, 'utf8')));
  }
  const jsFiles = (await filesUnder(assets)).filter(path => path.endsWith('.js') && path.includes(jsVersion[0]));
  let fields = 0;
  for (const path of jsFiles) {
    let js = (await readFile(path, 'utf8')).replaceAll(...jsVersion);
    if (path.endsWith(bundle.split('/').pop())) {
      const patched = patchForms(js);
      js = patched.js;
      fields = patched.count;
    }
    await writeFile(path, js);
    await rename(path, path.replace(...jsVersion));
  }
  if (fields !== expectedFormFields) throw new Error('Campos de formulário ajustados: ' + fields + ' (esperado ' + expectedFormFields + ')');
  return assetContext(dir);
}

// Dados que optimizeHtml usa, lidos de dist/ já otimizado (também usado pelo check).
export async function assetContext(dir) {
  const assets = join(dir, 'assets');
  const mainJs = await readFile(join(dir, builtBundle), 'utf8');
  const deps = new Map();
  for (const path of await filesUnder(assets)) {
    if (!path.endsWith('.js')) continue;
    const imports = Array.from((await readFile(path, 'utf8')).matchAll(/from\s*"\.\/([^"]+)"/g), m => m[1]);
    deps.set(path.split('/').pop(), [...new Set(imports)].filter(name => !builtBundle.endsWith(name)));
  }
  return {routes: routeChunks(mainJs), deps, css: {
    'drv-mobile-webp-20261105.css': await readFile(join(assets, 'drv-mobile-webp-20261105.css'), 'utf8'),
    'drv-banner-alinhado-v15.css': await readFile(join(assets, 'drv-banner-alinhado-v15.css'), 'utf8'),
  }};
}

// Mesmos ajustes nos formulários do HTML pré-renderizado (antes de o React assumir a página).
const htmlFields = [
  [/placeholder="(Nome|Seu nome)"/, 'name="nome" autocomplete="name"', true],
  [/placeholder="Empresa"/, 'name="empresa" autocomplete="organization"', true],
  [/placeholder="WhatsApp"/, 'name="telefone" type="tel" inputmode="tel" autocomplete="tel"', true],
  [/type="email"/, 'name="email" autocomplete="email"', false],
  [/aria-label="Serviço de interesse"/, 'name="servico"', false],
  [/aria-label="Qual o seu interesse\?"/, 'name="interesse"', false],
  [/placeholder="Mensagem"/, 'name="mensagem"', true],
];
export function patchHtmlForms(html) {
  return html.replace(/<(input|select|textarea)\b([^>]*)>/g, (tag, name, attrs) => {
    if (/\sname=/.test(attrs)) return tag;
    const rule = htmlFields.find(([pattern]) => pattern.test(attrs));
    if (!rule) return tag;
    const label = rule[2] && !/aria-label=/.test(attrs) ? ' aria-label="' + attrs.match(/placeholder="([^"]+)"/)[1] + '"' : '';
    return '<' + name + ' ' + rule[1] + label + attrs + '>';
  });
}

// pathname: URL da página (ex.: /sobre-nos). ctx: resultado de optimizeAssets.
export function pagePath(file) {
  const rel = file.split(/[\\/]/).slice(1).join('/');
  if (rel === '404.html') return '/404';
  return '/' + rel.replace(/\/?index\.html$/, '');
}

export function optimizeHtml(html, pathname, ctx) {
  let out = patchHtmlForms(html.replaceAll(...jsVersion));
  // Google Fonts sem bloquear a renderização.
  out = out.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet" \/?>/, () =>
    '<link rel="preload" as="style" href="' + fontsHref + '" onload="this.onload=null;this.rel=\'stylesheet\'">' +
    '<noscript><link rel="stylesheet" href="' + fontsHref + '"></noscript>');
  // CSS pequenos embutidos na página: duas requisições bloqueantes a menos.
  for (const [name, css] of Object.entries(ctx.css)) {
    out = out.replace(new RegExp('<link rel="stylesheet" href="/assets/' + name.replace(/\./g, '\\.') + '">'), () =>
      '<style>' + css.trim() + '</style>');
  }
  out = out.replace('</head>', () => '<style id="drv-otimizacoes">' + extraCss + '</style>\n</head>');
  // A logo não disputa prioridade com a imagem principal (LCP).
  out = out.replace(/(<link rel="preload" as="image" href="\/assets\/drv\/logo-drv-seo-otimizada\.webp" type="image\/webp") fetchpriority="high"/, '$1');
  const moduleTag = out.match(/<script type="module"[^>]*><\/script>/)?.[0];
  if (moduleTag) {
    const hints = [];
    if (/class="[^"]*\btqg-hero\b/.test(out) && !out.includes('rel="preload" as="image" href="' + heroImage + '"')) {
      hints.push('<link rel="preload" as="image" href="' + heroImage + '" type="image/webp" fetchpriority="high">');
    }
    const chunk = chunkFor(pathname, ctx.routes);
    if (chunk) {
      for (const name of [chunk, ...(ctx.deps.get(chunk) ?? [])]) {
        hints.push('<link rel="modulepreload" crossorigin href="/assets/' + name + '">');
      }
    }
    if (hints.length) out = out.replace(moduleTag, () => moduleTag + '\n    ' + hints.join('\n    '));
  }
  return out;
}
