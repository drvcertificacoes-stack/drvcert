# DRV Certificações

Projeto para versionar no GitHub. O aplicativo React, os estilos do site, as páginas pré-renderizadas e as tags de SEO e rastreamento vêm do backup fornecido. O site usa português do Brasil. O build inclui uma tag viewport somente nas páginas em que ela está ausente.

## Desenvolvimento

Com Node.js 22 ou superior, na pasta que contém este README:

```bash
npm run dev
npm run build
npm run check
```

A prévia abre em http://127.0.0.1:4173 e reproduz os redirecionamentos do `.htaccess`. O build gera `dist/` e o check valida as páginas, a marcação original, as URLs canônicas, o sitemap, os redirecionamentos 301 e todos os recursos citados no HTML, JS e CSS.

O repositório guarda só os arquivos que o site usa. Os originais em alta resolução (PNG/JPG) e as imagens sem uso ficam fora do GitHub, em um arquivo separado. Se algum PNG/JPG com versão WebP, ou uma cópia idêntica de outro arquivo, voltar para `site/` sem ser usado, o build o deixa fora de `dist/` e lista em `build-removidos.txt`. O GitHub Actions executa build e check em cada push ou pull request. O projeto usa o React fornecido pelo próprio backup e o build dispensa instalação de dependências npm.

- `site/` contém HTML pré-renderizado, conteúdo em português, estilos e o aplicativo React compilado do backup.
- `scripts/` contém o build, a prévia e a verificação.
- `server/` contém a implementação original do formulário e o PHPMailer com sua licença.

O ZIP de origem trouxe o aplicativo React já compilado. A edição do site completo em componentes exige o projeto React original ou uma reconstrução.

## Desempenho e mobile

O build aplica em `dist/` as otimizações de `scripts/optimize.mjs`, sem alterar os arquivos de `site/`:

- Google Fonts carregado sem bloquear a renderização, com fontes de reserva de métricas parecidas para o texto não pular.
- CSS pequenos embutidos na página e pré-carregamento da imagem do topo e do JS de cada página.
- Campos dos formulários com `name`, `autocomplete` e teclado de telefone no celular.
- Área de toque mínima de 24 px nos pontos dos depoimentos e nos links do rodapé.
- Arquivos JS renomeados para a versão `v16` sempre que o build os altera, para o cache do navegador não manter a versão anterior.

O `check` confere que cada página só difere do backup por essas transformações.

## SEO

As páginas pré-renderizadas, URLs canônicas, metadados, dados estruturados, robots.txt e sitemap mantêm o SEO em português do Brasil.

## GitHub

Crie um repositório vazio e envie o conteúdo desta pasta, incluindo `.github/` e `.gitignore`. Ajuste a URL do remoto no exemplo.

```bash
git init
git add .
git commit -m "Importa o projeto DRV Certificações"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

## Hospedagem e contatos

Publique o conteúdo de `dist/` na raiz de um domínio, incluindo o arquivo oculto `.htaccess`. Ele força HTTPS sem www, serve as páginas sem barra final (igual às canônicas e ao sitemap), responde 301 para atalhos e endereços antigos, define o 404, cache e compressão, e bloqueia o acesso direto a `drv-mailer/` e a arquivos ocultos. Se o servidor já tiver um `.htaccess` com regras do cPanel (por exemplo, a versão do PHP), mescle as regras em vez de substituir o arquivo. O projeto usa URLs absolutas a partir da raiz e preserva as canônicas para drvcertificacoes.com.br. Para GitHub Pages, use um domínio na raiz e publique o artefato de build.

Os links de contato usam `comercial@drvcertificacoes.com.br` e WhatsApp `+55 21 99974-9929`. Em hospedagem estática, esses links abrem o aplicativo de e-mail ou WhatsApp. O formulário original envia para `/lead.php` e exige hospedagem com PHP e SMTP. Para habilitar o formulário, copie `server/lead.php` e `server/drv-mailer/` para a raiz pública, junto ao build, e crie `drv-smtp-config.php` no diretório acima da raiz pública. Use o modelo de `server/` e preencha a senha somente na hospedagem. Em caso de falha no SMTP, o visitante vê uma mensagem genérica com o protocolo; o diagnóstico detalhado fica no log de erros do PHP, procurando por `[DRV SMTP <protocolo>]`. O servidor precisa de OpenSSL, acesso ao SMTP Titan e permissão de gravação para criar o diretório de controle de frequência fora da raiz pública.
