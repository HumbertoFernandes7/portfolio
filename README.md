# Portfólio | Humberto Fernandes

Portfólio pessoal como desenvolvedor back-end Java. Site estático feito à mão — HTML, CSS e JavaScript puros — com uma cena 3D em Three.js que se transforma conforme o scroll passa pelas seções.

## Deploy

**[humbertofernandes7.github.io/portfolio](https://humbertofernandes7.github.io/portfolio/)**

Publicado via GitHub Pages direto da raiz do repositório — sem build step. O site continua sem build e sem dependências: o npm é só para os testes e as ferramentas de desenvolvimento (veja [Desenvolvimento](#desenvolvimento)), nada que o site carrega depende dele.

## Formações 3D

A cena (`scene.js`) é um campo de partículas único que morfa de uma formação para outra conforme a seção ativa. O `data-scene` de cada seção do `index.html` é o índice da formação dela:

| `data-scene` | Seção | Formação |
| --- | --- | --- |
| 0 | Início | `</>` (código) |
| 1 | Sobre | xícara de café fumegante (símbolo do Java) |
| 2 | Projetos | janela de terminal |
| 3 | Trajetória | logo do Python |
| 4 | Recomendações | balão de fala |
| 5 | Contato | rede neural (IA) |

Em `certificados.html` a cena tem uma formação só, o capelo de formatura, ao lado da introdução da página. Com movimento reduzido, a formação é desenhada no lugar, sem morph nem balanço.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html` | Página principal: hero, sobre, projetos, trajetória, recomendações e contato |
| `certificados.html` | Página de certificados e diplomas |
| `components.js` | Tema (aplicado antes da primeira pintura) e os Web Components `<site-header>` e `<site-footer>`, que geram o cabeçalho, os menus e o rodapé das duas páginas; a lista `SECTIONS` (as seções do index, na ordem) alimenta os menus |
| `style.css` | Design system das duas páginas: tokens, tema escuro/claro, tipografia editorial, layout dividido no desktop largo, responsivo. Tem um índice das seções no topo |
| `certificados.css` | Estilos só da página de certificados (diplomas, filtros, grid de cards, lightbox); complementa o `style.css` |
| `script.js` | Interações de UI das duas páginas: tema, menu do celular, reveals, navegação ativa e transição entre páginas |
| `certificados.js` | Monta a página de certificados a partir de `data/`: cards, diplomas, filtros, busca e lightbox |
| `scene.js` | Cena Three.js: partículas que morfam entre as formações da tabela acima (uma por seção) e o capelo em certificados |
| `data/` | `certificados.json` (cursos e trilhas) e `diplomas.json` (graduação e pós): a fonte dos cards |
| `assets/` | Ícones, imagem de compartilhamento (`og-image.jpg`), foto de perfil, fotos das recomendações (`recs/`) e as imagens dos certificados em WebP (`certificados/`: `full/`, `thumb/` e `diplomas/`) |
| `tools/` | Ferramentas de desenvolvimento: `check.mjs` (verificador estático), `numbering.mjs` (o `--fix` dele) e `ab.mjs` (comparação visual A/B) |
| `tests/` | Testes no navegador (Playwright): `smoke.spec.mjs` e `ab.spec.mjs` (usado pelo `ab.mjs`) |
| `playwright.config.mjs`, `package.json` | Configuração dos testes e os scripts npm (só desenvolvimento) |
| `.github/workflows/check.yml` | CI: em todo pull request (e no push para a `main`) roda o verificador estático e o smoke no navegador |

Three.js é carregado via import map (CDN, versão pinada). Sem WebGL ou sem rede para o CDN, o site degrada graciosamente para o fundo em CSS.

## Rodando localmente

Por usar ES modules, precisa de um servidor HTTP simples (não funciona via `file://`):

```bash
# qualquer um destes, na raiz do projeto:
npx serve .
python -m http.server 8000
```

## Desenvolvimento

O site não precisa de nada disto para rodar: o `package.json` só tem o Playwright (dependência de desenvolvimento), usado pelos testes.

```bash
npm ci          # instala o Playwright (só para npm test e npm run ab)
npm run check   # verificador estático
npm run fix     # acerta a numeração e o SECTIONS pela ordem das seções
npm test        # smoke no navegador
npm run ab      # comparação visual contra o main
```

| Comando | O que faz |
| --- | --- |
| `npm ci` | Instala as dependências de desenvolvimento (versão fixa no `package-lock.json`). Só o `npm test` e o `npm run ab` precisam; o `check` e o `fix` rodam só com o Node |
| `npm run check` | Verificador estático (`tools/check.mjs`, Node puro, em milissegundos): ids e âncoras, arquivos referenciados, numeração das seções e das setas, `data-scene`, menus, `SECTIONS`, `<head>` (um só `?v=`, mesma versão do Three.js, metas), componentes, cores do tema e lado do layout dividido; avisa de CSS sem uso e da contagem de certificados no texto. Sai com erro se algo não bate |
| `npm run fix` | O mesmo `check`, depois de acertar o que depende da ordem das seções (`tools/numbering.mjs`): o número (NN) dos kickers, os destinos e rótulos das setas entre seções, a seta do hero e a ordem das linhas do `SECTIONS`, com a linha da seção nova. Não cria nem apaga HTML, não apaga linha do `SECTIONS` nem mexe em `data-scene`; o que não resolve, ele avisa. Rodar de novo não muda nada |
| `npm test` | Smoke no navegador (Playwright): as 2 páginas em 5 larguras e 2 temas, sem erro de console, com 3D ligado, tema, menu do celular, scrollspy, colunas alternadas, filtros e lightbox dos certificados, navegação entre as páginas. Local, usa o Edge instalado (nenhum navegador é baixado); no CI, o Chromium do Playwright |
| `npm run ab` | Comparação visual A/B (`tools/ab.mjs`): serve a ref base (padrão `origin/main`, num worktree em `.ab/`) e a árvore atual e compara prints da página inteira, do menu aberto, do cabeçalho rolado, a árvore de acessibilidade e a ordem do foco. Diferença que aparece é confirmada em até 3 capturas novas de cada lado antes de ser dada como real. `npm run ab -- origin/main --no-fetch` pula o `git fetch`. Só local: o CI não roda |

O CI (`.github/workflows/check.yml`) roda o `check` e o smoke (`npm test`) em todo pull request; o A/B não roda lá.

### Como acrescentar uma seção

1. Copie uma seção inteira do `index.html` (de `<section id="sobre" …>` até `</section>`) e cole na posição desejada entre as filhas do `<main>`. Para só mudar a ordem, recorte e cole a seção no lugar novo.
2. Na cópia, ajuste o `id` (e os ids internos que o usam, como `sobre-title` no `aria-labelledby`), os textos e o rótulo do kicker (`<p class="kicker"><span>NN</span>Rótulo</p>`; o NN o `fix` acerta).
3. `data-scene`: o id da formação 3D da seção, e não a posição. Seção nova leva o próximo número (o conjunto tem que ser exatamente 0 a N-1, sem repetir; o hero leva 0) e precisa de uma formação nova no `scene.js`: um item a mais em `builders` e outro, na mesma posição, em `configs`. Quem só muda de lugar leva o `data-scene` que já tem; o lado do texto e da formação sai da posição da seção.
4. Rode `npm run fix`: ele renumera os kickers, refaz os destinos e rótulos das setas (das seções vizinhas também) e deixa o `SECTIONS` do `components.js` na ordem do `<main>`, com a linha da seção nova. Não precisa editar o `SECTIONS`.
5. `npm run check` confirma (0 erros). Se uma seção saiu do index, apague a linha dela no `SECTIONS` (o `fix` não apaga) e rode o `fix` de novo.

### Como acrescentar uma recomendação

As recomendações do LinkedIn ficam no `index.html`, na seção `#recomendacoes`, dentro de `<div class="recs-grid">`, com o texto exato do LinkedIn:

1. Salve a foto da pessoa em `assets/recs/` (96×96).
2. Copie um `<figure class="rec-card">` inteiro e cole depois do último.
3. Troque as iniciais, a foto, o nome, o link do perfil, o cargo, a relação, a data (o `datetime` e o texto) e o texto da recomendação: os primeiros parágrafos ficam à vista e o resto vai dentro do `<details class="rec-more">` ("ler completa"). O `aria-label` do link "Ver recomendação" também leva o nome da pessoa.
4. O link "Ver recomendação" e o `cite` são os mesmos para todas: o LinkedIn não tem endereço próprio por recomendação, e essa página lista as recebidas.
5. `npm run check` (confere se a foto existe).
