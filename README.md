# Portfólio | Humberto Fernandes

Portfólio pessoal como desenvolvedor back-end Java. Site estático feito à mão — HTML, CSS e JavaScript puros — com uma cena 3D em Three.js que se transforma conforme o scroll passa pelas seções.

## Deploy

**[humbertofernandes7.github.io/portfolio](https://humbertofernandes7.github.io/portfolio/)**

Publicado via GitHub Pages direto da raiz do repositório — sem build step.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html` | Conteúdo e estrutura |
| `style.css` | Design system: tema escuro/claro, tipografia editorial, responsivo |
| `script.js` | Interações de UI: tema, menu, reveals e navegação ativa |
| `scene.js` | Cena Three.js: partículas que morfam entre 5 formações (uma por seção) |

Three.js é carregado via import map (CDN, versão pinada). Sem WebGL ou sem rede para o CDN, o site degrada graciosamente para o fundo em CSS.

## Rodando localmente

Por usar ES modules, precisa de um servidor HTTP simples (não funciona via `file://`):

```bash
# qualquer um destes, na raiz do projeto:
npx serve .
python -m http.server 8000
```
