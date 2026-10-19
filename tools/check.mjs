#!/usr/bin/env node
/* ============================================================
   Verificador estático do portfólio — Node puro, sem dependências.

   Uso:   node tools/check.mjs [pasta]     (padrão: a raiz do projeto)

   Cada regra é uma função (ctx) => void registrada em RULES. Ela relata
   com ctx.error(arquivo, linha, mensagem) ou ctx.warn(...): erro faz o
   processo sair com código 1; aviso só aparece na saída.

   O parser de HTML é um scanner por regex feito para as páginas deste
   site (tags fechadas explicitamente, atributos entre aspas). Não é um
   parser geral: serve para achar elementos, atributos, texto e linha.

   Componentes: o components.js roda numa sandbox (node:vm) com um DOM
   mínimo, e o HTML que cada elemento dele (<site-header>, <site-footer>) gera entra na
   árvore da página dentro do elemento, como no navegador. Assim as regras
   de ids, âncoras, arquivos e classes enxergam esse HTML; o que estiver
   errado nele aponta para a linha do elemento na página.
   ============================================================ */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const started = performance.now();

/* ---------- Arquivos e linhas ---------- */

class Source {
    constructor(rel, text) {
        this.rel = rel;
        this.text = text;
        this.newlines = null;
    }

    /* linha (1-based) da posição `pos` no texto */
    lineAt(pos) {
        if (!this.newlines) {
            this.newlines = [];
            for (let i = this.text.indexOf("\n"); i !== -1; i = this.text.indexOf("\n", i + 1)) {
                this.newlines.push(i);
            }
        }
        let lo = 0;
        let hi = this.newlines.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.newlines[mid] < pos) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo + 1;
    }

    lineOf(needle, from = 0) {
        const i = this.text.indexOf(needle, from);
        return i === -1 ? 1 : this.lineAt(i);
    }
}

/* ---------- Scanner de HTML ---------- */

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TAGS = new Set(["script", "style", "title", "textarea"]);
const TOKEN_RE = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const decode = (s) =>
    s.includes("&")
        ? s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
            if (e[0] === "#") {
                return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
            }
            return ENTITIES[e.toLowerCase()] ?? all;
        })
        : s;

function parseAttrs(str) {
    const attrs = {};
    for (const m of str.matchAll(ATTR_RE)) {
        const name = m[1].toLowerCase();
        if (!Object.hasOwn(attrs, name)) {
            attrs[name] = decode(m[2] ?? m[3] ?? m[4] ?? "");
        }
    }
    return attrs;
}

/* Árvore simples: elemento = { tag, attrs, children, parent, line }; texto = { text, line }.
   script/style/title/textarea guardam o conteúdo cru em `raw`.
   `expand(el)`, se vier, devolve o HTML que um componente gera (ou null): ele é lido
   como os primeiros filhos do elemento, com `generated` = tag do componente e a linha
   do elemento. Como no navegador, o connectedCallback roda antes de o parser chegar
   aos filhos escritos na página, que entram depois dos gerados. */
function parseHtml(src, expand = null) {
    const text = src.text;
    const doc = { tag: "#document", attrs: {}, children: [], parent: null, line: 1 };
    const elements = [];
    const re = new RegExp(TOKEN_RE.source, "g");
    let current = doc;
    let last = 0;
    let m;

    const pushText = (from, to) => {
        if (to > from) {
            current.children.push({ text: decode(text.slice(from, to)), line: src.lineAt(from) });
        }
    };

    while ((m = re.exec(text))) {
        pushText(last, m.index);
        last = re.lastIndex;

        if (m[1]) {
            /* fechamento: sobe até a tag correspondente (tolerante a tag sem par) */
            const tag = m[1].toLowerCase();
            let node = current;
            while (node !== doc && node.tag !== tag) {
                node = node.parent;
            }
            if (node !== doc) {
                current = node.parent;
            }
            continue;
        }
        if (!m[2]) {
            continue; /* comentário ou doctype */
        }

        const tag = m[2].toLowerCase();
        const el = { tag, attrs: parseAttrs(m[3]), children: [], parent: current, line: src.lineAt(m.index) };
        current.children.push(el);
        elements.push(el);

        if (RAW_TAGS.has(tag)) {
            const close = new RegExp(`</${tag}\\s*>`, "gi");
            close.lastIndex = re.lastIndex;
            const c = close.exec(text);
            el.raw = text.slice(re.lastIndex, c ? c.index : text.length);
            el.rawPos = re.lastIndex;
            if (tag === "title" || tag === "textarea") {
                el.children.push({ text: decode(el.raw), line: el.line });
            }
            re.lastIndex = last = c ? close.lastIndex : text.length;
            continue;
        }
        const html = expand ? expand(el) : null;
        if (html) {
            const frag = parseHtml(new Source(src.rel, html));
            const mark = (node) => {
                node.line = el.line;
                node.generated = tag;
                (node.children || []).forEach(mark);
            };
            frag.doc.children.forEach((node) => {
                mark(node);
                if (node.tag) {
                    node.parent = el;
                }
                el.children.push(node);
            });
            elements.push(...frag.elements);
        }
        if (!VOID_TAGS.has(tag) && !m[4]) {
            current = el;
        }
    }
    pushText(last, text.length);
    return { doc, elements };
}

/* ---------- Componentes (components.js) ---------- */

/* Roda o components.js numa sandbox com o mínimo de DOM que ele usa: HTMLElement com
   getAttribute/hasAttribute, firstElementChild (sempre null: o elemento acabou de
   entrar) e innerHTML; customElements.define; document e localStorage do script de tema
   (themeSandbox). render(el) monta como o navegador faz (construtor e connectedCallback)
   e devolve o innerHTML gerado, ou null. */
function loadComponents(ctx) {
    const rel = "components.js";
    const out = { rel, tags: new Set(), error: null, render: () => null };
    const src = ctx.source(rel);
    if (!src) {
        out.error = { line: 1, msg: `${rel} não existe` };
        return out;
    }

    let pending = {};
    class HTMLElement {
        constructor() {
            this.__attrs = pending;
            this.__html = null;
        }

        getAttribute(name) {
            return Object.hasOwn(this.__attrs, name) ? this.__attrs[name] : null;
        }

        hasAttribute(name) {
            return Object.hasOwn(this.__attrs, name);
        }

        get firstElementChild() {
            return null;
        }

        get innerHTML() {
            return this.__html ?? "";
        }

        set innerHTML(html) {
            this.__html = String(html);
        }
    }

    const classes = new Map();
    const sandbox = {
        HTMLElement,
        customElements: {
            define: (name, cls) => classes.set(name, cls),
            get: (name) => classes.get(name)
        },
        ...themeSandbox()
    };
    sandbox.window = sandbox;
    try {
        vm.runInNewContext(src.text, sandbox, { filename: rel, timeout: 2000 });
    } catch (e) {
        const at = /components\.js:(\d+)/.exec(e.stack || "");
        out.error = { line: at ? Number(at[1]) : 1, msg: `${rel} quebrou na sandbox do check: ${e.message}` };
        return out;
    }

    out.tags = new Set(classes.keys());
    out.render = (el) => {
        pending = el.attrs;
        const node = new (classes.get(el.tag))();
        if (typeof node.connectedCallback === "function") {
            node.connectedCallback();
        }
        return node.__html || null;
    };
    return out;
}

/* document e localStorage mínimos para o script de tema do topo do components.js: <html>
   com classList, get/setAttribute e dataset; nenhuma meta (querySelector dá null); nada
   salvo no localStorage, então o tema é o escuro, o padrão das páginas. */
function themeSandbox() {
    const attrs = new Map();
    const dataset = {};
    const documentElement = {
        classList: { add() {}, remove() {}, contains: () => false },
        dataset,
        getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
        setAttribute(name, value) {
            attrs.set(name, String(value));
            if (name.startsWith("data-")) {
                dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
            }
        }
    };
    return {
        document: { documentElement, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() {} }
    };
}

/* const SECTIONS = [ … ] do components.js (fica dentro do escopo do arquivo, fora do
   alcance da sandbox): o literal do array é avaliado numa sandbox própria (node:vm).
   Devolve { items: [{ id, label, line }], line, end } ou { error, line }. */
function componentSections(ctx) {
    const rel = ctx.components.rel;
    const src = ctx.source(rel);
    if (!src) {
        return { error: `${rel} não existe`, line: 1 };
    }
    const m = /\bconst\s+SECTIONS\s*=\s*(\[[\s\S]*?\])\s*;/.exec(src.text);
    if (!m) {
        return { error: `não achei const SECTIONS = [ … ]; no ${rel}`, line: 1 };
    }
    const at = m.index + m[0].indexOf(m[1]);
    const line = src.lineAt(m.index);
    let list;
    try {
        list = vm.runInNewContext(`(${m[1]})`, Object.create(null), { timeout: 1000 });
    } catch (e) {
        return { error: `SECTIONS do ${rel} não é um array literal que dê para avaliar: ${e.message}`, line };
    }
    const valid = (item) => item && typeof item.id === "string" && item.id !== "" && typeof item.label === "string" && item.label !== "";
    if (!Array.isArray(list) || !list.every(valid)) {
        return { error: "SECTIONS tem que ser uma lista de { id, label } com textos não vazios", line };
    }
    let cursor = at;
    const items = list.map((item) => {
        const i = src.text.indexOf(item.id, cursor);
        cursor = i === -1 ? cursor : i;
        return { id: item.id, label: item.label, line: src.lineAt(cursor) };
    });
    return { items, line, end: src.lineAt(at + m[1].length) };
}

/* ---------- Consultas na árvore ---------- */

const attr = (el, name) => (Object.hasOwn(el.attrs, name) ? el.attrs[name] : null);
const hasAttr = (el, name) => Object.hasOwn(el.attrs, name);
const classes = (el) => (attr(el, "class") || "").split(/\s+/).filter(Boolean);
const hasClass = (el, name) => classes(el).includes(name);
const relHas = (el, value) => (attr(el, "rel") || "").toLowerCase().split(/\s+/).includes(value);
const childElements = (el) => el.children.filter((c) => c.tag);
const is = (tag, cls) => (el) => el.tag === tag && (!cls || hasClass(el, cls));
const squash = (s) => s.replace(/\s+/g, " ").trim();
const pad2 = (n) => String(n).padStart(2, "0");

function* descendants(el) {
    for (const c of el.children) {
        if (c.tag) {
            yield c;
            yield* descendants(c);
        }
    }
}

const findAll = (el, pred) => [...descendants(el)].filter(pred);
const findFirst = (el, pred) => {
    for (const n of descendants(el)) {
        if (pred(n)) {
            return n;
        }
    }
    return null;
};
const textOf = (node) => (node.tag ? node.children.map(textOf).join("") : node.text);
const describe = (el) => {
    const id = attr(el, "id");
    const cls = attr(el, "class");
    return `<${el.tag}${id ? ` id="${id}"` : ""}${cls ? ` class="${cls}"` : ""}>`;
};

/* "<span>NN</span>Rótulo" -> { num: "NN", label: "Rótulo" } (num null sem <span>) */
function numberedLabel(el) {
    const span = el.children.find((c) => c.tag === "span") || null;
    return {
        num: span ? squash(textOf(span)) : null,
        label: squash(el.children.filter((c) => c !== span).map(textOf).join(""))
    };
}

/* ---------- Contexto ---------- */

function createContext(root) {
    const sources = new Map();
    const problems = [];

    const ctx = {
        root,
        rule: "",
        problems,

        /* lê um arquivo relativo à raiz (null se não existir) */
        source(rel) {
            if (!sources.has(rel)) {
                let src = null;
                try {
                    src = new Source(rel, readFileSync(join(root, rel), "utf8"));
                } catch {
                    src = null;
                }
                sources.set(rel, src);
            }
            return sources.get(rel);
        },

        isFile(rel) {
            try {
                return statSync(join(root, rel)).isFile();
            } catch {
                return false;
            }
        },

        list(dir, ext) {
            try {
                return readdirSync(join(root, dir))
                    .filter((name) => name.endsWith(ext))
                    .sort()
                    .map((name) => (dir === "." ? name : `${dir}/${name}`));
            } catch {
                return [];
            }
        },

        error(file, line, msg) {
            problems.push({ level: "erro", file, line, rule: ctx.rule, msg });
        },

        warn(file, line, msg) {
            problems.push({ level: "aviso", file, line, rule: ctx.rule, msg });
        },

        page(rel) {
            return ctx.pages.find((p) => p.rel === rel) || null;
        }
    };

    /* index.html primeiro: é a referência nas comparações entre páginas */
    const htmlFiles = ctx.list(".", ".html").sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : 0));
    /* cada elemento do components.js nas páginas é montado durante o parse; o resultado
       (ou o erro) fica no próprio elemento, para a regra de componentes */
    ctx.components = loadComponents(ctx);
    const expand = (el) => {
        if (!ctx.components.tags.has(el.tag)) {
            return null;
        }
        try {
            el.rendered = ctx.components.render(el);
        } catch (e) {
            el.rendered = null;
            el.renderError = e.message;
        }
        return el.rendered;
    };

    ctx.pages = htmlFiles.map((rel) => {
        const src = ctx.source(rel);
        const { doc, elements } = parseHtml(src, expand);
        const ids = new Map();
        elements.forEach((el) => {
            const id = attr(el, "id");
            if (id !== null) {
                if (!ids.has(id)) {
                    ids.set(id, []);
                }
                ids.get(id).push(el);
            }
        });
        return { rel, src, doc, elements, ids };
    });

    /* endereço público do site, tirado do og:url do index (para achar o arquivo local
       de og:image, JSON-LD etc.) */
    const index = ctx.page("index.html");
    const ogUrl = index && index.elements.find((el) => el.tag === "meta" && attr(el, "property") === "og:url");
    ctx.siteBase = ogUrl ? attr(ogUrl, "content").replace(/[^/]*$/, "") : null;

    return ctx;
}

/* Valor mais frequente de `key` entre as entradas; empate fica com o primeiro (index.html). */
function agree(ctx, entries, key, message) {
    if (entries.length < 2) {
        return;
    }
    const counts = new Map();
    entries.forEach((e) => counts.set(key(e), (counts.get(key(e)) || 0) + 1));
    let ref = key(entries[0]);
    counts.forEach((n, value) => {
        if (n > counts.get(ref)) {
            ref = value;
        }
    });
    entries.filter((e) => key(e) !== ref).forEach((e) => ctx.error(e.file, e.line, message(e, ref)));
}

/* Seções do index (filhos <section> do <main>), com posição, kicker e rótulo. */
function indexSections(ctx) {
    if (ctx.sectionsCache) {
        return ctx.sectionsCache;
    }
    const page = ctx.page("index.html");
    const main = page && findFirst(page.doc, is("main"));
    const menu = page && findFirst(page.doc, is("nav", "menu-nav"));
    const menuLabels = new Map();
    if (menu) {
        findAll(menu, is("a")).forEach((a) => {
            const href = attr(a, "href") || "";
            if (href.startsWith("#")) {
                menuLabels.set(href.slice(1), numberedLabel(a).label);
            }
        });
    }
    ctx.sectionsCache = (main ? childElements(main).filter((el) => el.tag === "section") : []).map((el, pos) => {
        const kicker = findFirst(el, is("p", "kicker"));
        const k = kicker ? numberedLabel(kicker) : null;
        const id = attr(el, "id");
        /* sem kicker (o hero), o rótulo vem do item do menu-nav que aponta para a seção */
        return { el, id, pos, kicker, kickerNum: k ? k.num : null, label: (k && k.label) || menuLabels.get(id) || null };
    });
    return ctx.sectionsCache;
}

/* Caminho local de uma URL usada numa página; null se for externa, âncora ou esquema especial. */
function localPath(ctx, url, pageRel) {
    let u = url.trim();
    if (!u || u.startsWith("#")) {
        return null;
    }
    if (ctx.siteBase && u.startsWith(ctx.siteBase)) {
        u = u.slice(ctx.siteBase.length);
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//")) {
        return null;
    }
    u = u.replace(/[?#].*$/, "");
    try {
        u = decodeURI(u);
    } catch {
        /* mantém como está */
    }
    if (u === "" || u.endsWith("/")) {
        u += "index.html";
    }
    if (u.startsWith("/")) {
        return null; /* absoluto no domínio: no GitHub Pages do projeto, aponta para fora do site */
    }
    return posix.normalize(posix.join(posix.dirname(pageRel), u));
}

/* ============================================================
   Regras
   ============================================================ */

/* IDs únicos e toda referência a id (href="#x", aria-*, for, outra.html#x) com alvo. */
function ruleIds(ctx) {
    const ID_REF_ATTRS = ["aria-controls", "aria-labelledby", "aria-describedby", "for"];

    ctx.pages.forEach((page) => {
        page.ids.forEach((els, id) => {
            els.slice(1).forEach((el) => {
                ctx.error(page.rel, el.line, `id "${id}" repetido (o primeiro está na linha ${els[0].line})`);
            });
        });

        page.elements.forEach((el) => {
            const href = attr(el, "href");
            if (href !== null) {
                const m = /^([^#?]*)(?:\?[^#]*)?#(.+)$/.exec(href.trim());
                /* "#" e "#top" levam ao topo pela especificação; não precisam de id */
                if (m && m[2] !== "top") {
                    const file = m[1] === "" ? page.rel : posix.normalize(posix.join(posix.dirname(page.rel), m[1]));
                    const target = ctx.page(file);
                    const id = decodeURIComponent(m[2]);
                    if (target && !target.ids.has(id)) {
                        const where = target === page ? "" : ` em ${file}`;
                        ctx.error(page.rel, el.line, `href="${href}" aponta para o id "${id}", que não existe${where}`);
                    }
                }
            }

            ID_REF_ATTRS.forEach((name) => {
                const value = attr(el, name);
                if (value === null) {
                    return;
                }
                value.split(/\s+/).filter(Boolean).forEach((id) => {
                    if (!page.ids.has(id)) {
                        ctx.error(page.rel, el.line, `${name}="${value}" aponta para o id "${id}", que não existe na página`);
                    }
                });
            });
        });
    });
}

/* Todo arquivo local referenciado nos HTML existe (src, href, srcset, poster, metas e JSON-LD do próprio site). */
function ruleFiles(ctx) {
    ctx.pages.forEach((page) => {
        const check = (url, line, what) => {
            const path = localPath(ctx, url, page.rel);
            if (path !== null && !ctx.isFile(path)) {
                ctx.error(page.rel, line, `${what} "${url}": arquivo ${path} não existe`);
            }
        };

        page.elements.forEach((el) => {
            ["src", "href", "poster"].forEach((name) => {
                const value = attr(el, name);
                if (value !== null) {
                    check(value, el.line, name);
                }
            });
            const srcset = attr(el, "srcset");
            if (srcset !== null) {
                srcset.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean)
                    .forEach((url) => check(url, el.line, "srcset"));
            }
            /* og:image, og:url, twitter:image…: só as que apontam para o próprio site */
            const content = attr(el, "content");
            if (el.tag === "meta" && content !== null && ctx.siteBase && content.startsWith(ctx.siteBase)) {
                check(content, el.line, `meta ${attr(el, "property") || attr(el, "name")}`);
            }
            if (el.tag === "script" && attr(el, "type") === "application/ld+json" && ctx.siteBase) {
                for (const m of el.raw.matchAll(/"(https?:\/\/[^"]+)"/g)) {
                    if (m[1].startsWith(ctx.siteBase)) {
                        check(m[1], page.src.lineAt(el.rawPos + m.index), "JSON-LD");
                    }
                }
            }
        });
    });
}

/* thumb e image de cada item de data/*.json existem. */
function ruleDataFiles(ctx) {
    ctx.list("data", ".json").forEach((rel) => {
        const src = ctx.source(rel);
        let data;
        try {
            data = JSON.parse(src.text);
        } catch (e) {
            ctx.error(rel, 1, `JSON inválido: ${e.message}`);
            return;
        }
        if (!Array.isArray(data)) {
            return;
        }
        let cursor = 0;
        data.forEach((item, i) => {
            ["thumb", "image"].forEach((key) => {
                const value = item && item[key];
                if (typeof value !== "string" || value === "") {
                    return;
                }
                const at = src.text.indexOf(JSON.stringify(value), cursor);
                const line = at === -1 ? src.lineOf(JSON.stringify(value)) : src.lineAt(at);
                if (at !== -1) {
                    cursor = at;
                }
                const path = posix.normalize(value.replace(/[?#].*$/, ""));
                if (!ctx.isFile(path)) {
                    ctx.error(rel, line, `item ${i} ("${item.title ?? "?"}"): ${key} "${value}" não existe`);
                }
            });
        });
    });
}

/* Todo filho de <main> no index é <section data-section data-scene>, com data-scene 0..N-1 em ordem. */
function ruleSections(ctx) {
    const page = ctx.page("index.html");
    if (!page) {
        ctx.error("index.html", 1, "index.html não encontrado");
        return;
    }
    const main = findFirst(page.doc, is("main"));
    if (!main) {
        ctx.error(page.rel, 1, "index.html sem <main>");
        return;
    }
    childElements(main).forEach((el) => {
        if (!(el.tag === "section" && hasAttr(el, "data-section") && hasAttr(el, "data-scene"))) {
            ctx.error(page.rel, el.line, `filho de <main> deveria ser <section … data-section data-scene>, mas é ${describe(el)}`);
        }
    });

    const seen = new Map();
    indexSections(ctx).forEach(({ el, id, pos }) => {
        if (!id) {
            ctx.error(page.rel, el.line, `a seção na posição ${pos} está sem id`);
        }
        const raw = attr(el, "data-scene");
        if (raw === null) {
            return;
        }
        if (seen.has(raw)) {
            ctx.error(page.rel, el.line, `data-scene="${raw}" repetido em #${id} (já usado em #${seen.get(raw)})`);
        } else {
            seen.set(raw, id);
        }
        if (raw !== String(pos)) {
            ctx.error(page.rel, el.line, `#${id} está na posição ${pos} com data-scene="${raw}"; esperado data-scene="${pos}"`);
        }
    });
}

/* Numeração do index: kicker NN = posição; setas entre seções apontam para a vizinha certa
   com aria-label/title "Ir para NN · Rótulo"; a seta do hero leva à segunda seção. */
function ruleNumbering(ctx) {
    const page = ctx.page("index.html");
    if (!page) {
        return;
    }
    const sections = indexSections(ctx);
    const last = sections.length - 1;

    const checkStep = (s, cls, target, { required, forbidden }) => {
        const steps = findAll(s.el, is("p", cls));
        if (forbidden) {
            steps.forEach((p) => ctx.error(page.rel, p.line, `#${s.id}: ${forbidden}`));
            return;
        }
        if (!steps.length) {
            if (required) {
                ctx.error(page.rel, s.el.line, `#${s.id} sem a seta .${cls}`);
            }
            return;
        }
        steps.slice(1).forEach((p) => ctx.error(page.rel, p.line, `#${s.id} tem mais de uma seta .${cls}`));
        const a = findFirst(steps[0], is("a"));
        if (!a) {
            ctx.error(page.rel, steps[0].line, `.${cls} de #${s.id} sem link`);
            return;
        }
        const href = attr(a, "href");
        if (target.id && href !== `#${target.id}`) {
            ctx.error(page.rel, a.line, `.${cls} de #${s.id} aponta para "${href}"; esperado "#${target.id}"`);
        }
        const expected = `Ir para ${pad2(target.pos)} · ${target.label ?? "?"}`;
        ["aria-label", "title"].forEach((name) => {
            const value = attr(a, name);
            if (value !== expected) {
                ctx.error(page.rel, a.line, `.${cls} de #${s.id}: ${name}=${JSON.stringify(value)}; esperado "${expected}"`);
            }
        });
    };

    sections.forEach((s, i) => {
        if (s.kicker) {
            if (s.kickerNum !== pad2(i)) {
                ctx.error(page.rel, s.kicker.line, `kicker "${s.kickerNum}" em #${s.id}, que é a seção ${pad2(i)}; esperado "${pad2(i)}"`);
            }
        } else if (i > 0) {
            ctx.error(page.rel, s.el.line, `#${s.id} sem kicker (<p class="kicker"><span>${pad2(i)}</span>Rótulo</p>)`);
        }
        if (!s.label) {
            ctx.error(page.rel, s.el.line, `#${s.id} sem rótulo (nem kicker nem item no menu-nav)`);
        }

        checkStep(s, "step-prev", sections[i - 1],
            i === 0 ? { forbidden: "a primeira seção não deve ter .step-prev" } : { required: true });
        checkStep(s, "step-next", sections[i + 1],
            i === last ? { forbidden: "a última seção não deve ter .step-next" } : { required: i > 0 });
    });

    /* a seta do hero ("role para explorar") é o a.scroll-cue da primeira seção */
    if (sections.length > 1) {
        const hero = sections[0];
        const cue = findFirst(hero.el, is("a", "scroll-cue"));
        if (!cue) {
            ctx.error(page.rel, hero.el.line, `#${hero.id} sem a seta para a próxima seção (a.scroll-cue)`);
        } else if (attr(cue, "href") !== `#${sections[1].id}`) {
            ctx.error(page.rel, cue.line, `a seta do hero (a.scroll-cue) aponta para "${attr(cue, "href")}"; esperado "#${sections[1].id}"`);
        }
    }
}

/* site-nav e menu-nav iguais nas páginas (rótulo, ordem e destino); números do menu-nav
   são a posição; .menu-page por último. Os menus saem do <site-header> (components.js) e a
   regra lê o HTML gerado em cada página: pega erro num ramo só do componente (home × outras
   páginas). A lista de seções em si é conferida na regra "lista-secoes". */
function ruleMenus(ctx) {
    const sections = indexSections(ctx);
    const firstId = sections.length ? sections[0].id : null;

    /* "#x" no index vira "index.html#x"; "index.html#<primeira seção>" é o topo: "index.html" */
    const canonical = (href, pageRel) => {
        let h = (href || "").trim().replace(/^\.\//, "");
        if (h.startsWith("#")) {
            h = pageRel + h;
        }
        const [file, frag] = h.split("#");
        if (!frag || (file === "index.html" && frag === firstId)) {
            return file;
        }
        return `${file}#${frag}`;
    };

    const items = (page, cls) => {
        const nav = findFirst(page.doc, is("nav", cls));
        if (!nav) {
            return null;
        }
        return findAll(nav, is("a")).map((a) => {
            const { num, label } = numberedLabel(a);
            return { line: a.line, num, label, href: canonical(attr(a, "href"), page.rel), isPage: hasClass(a, "menu-page") };
        });
    };
    const show = (it) => `"${it.label}" → ${it.href}${it.isPage ? " (.menu-page)" : ""}`;

    ["site-nav", "menu-nav"].forEach((cls) => {
        const lists = ctx.pages.map((page) => ({ page, list: items(page, cls) }));
        lists.filter(({ list }) => !list).forEach(({ page }) => ctx.error(page.rel, 1, `sem <nav class="${cls}">`));
        const [ref, ...others] = lists.filter(({ list }) => list);
        if (!ref) {
            return;
        }
        others.forEach(({ page, list }) => {
            const n = Math.max(ref.list.length, list.length);
            for (let i = 0; i < n; i++) {
                const a = ref.list[i];
                const b = list[i];
                if (!b) {
                    ctx.error(page.rel, list.length ? list[list.length - 1].line : 1, `${cls}: falta o item ${i + 1} ${show(a)}, que existe em ${ref.page.rel}`);
                } else if (!a) {
                    ctx.error(page.rel, b.line, `${cls}: item ${i + 1} ${show(b)} não existe em ${ref.page.rel}`);
                } else if (a.label !== b.label || a.href !== b.href || a.isPage !== b.isPage) {
                    ctx.error(page.rel, b.line, `${cls}: item ${i + 1} é ${show(b)}; em ${ref.page.rel} é ${show(a)}`);
                }
            }
        });
    });

    ctx.pages.forEach((page) => {
        const list = items(page, "menu-nav");
        if (!list) {
            return;
        }
        let pageSeen = null;
        let k = 0;
        list.forEach((it) => {
            if (it.isPage) {
                pageSeen = pageSeen || it;
                return;
            }
            if (pageSeen) {
                ctx.error(page.rel, it.line, `menu-nav: .menu-page ("${pageSeen.label}") tem que ser o último item; "${it.label}" vem depois dele`);
            }
            if (it.num !== pad2(k)) {
                ctx.error(page.rel, it.line, `menu-nav: "${it.label}" com número ${JSON.stringify(it.num)}; esperado "${pad2(k)}" (posição ${k})`);
            }
            const [file, frag] = it.href.split("#");
            const target = file === "index.html" ? (frag ? sections.find((s) => s.id === frag) : sections[0]) : null;
            if (target && target.pos !== k) {
                ctx.error(page.rel, it.line, `menu-nav: item ${pad2(k)} "${it.label}" leva a #${target.id}, que é a seção ${pad2(target.pos)}`);
            }
            k++;
        });
    });
}

/* SECTIONS do components.js (de onde saem os menus) = as seções do index: os mesmos ids na
   mesma ordem, e o rótulo de cada uma é o do kicker. O hero não tem kicker: o rótulo dele é
   "Início" (o indexSections tira esse rótulo do menu-nav, que agora sai do próprio SECTIONS;
   comparar com ele não conferiria nada). */
function ruleSectionList(ctx) {
    const HERO_LABEL = "Início";
    const rel = ctx.components.rel;
    if (!ctx.source(rel)) {
        return; /* a regra "componentes" já acusa */
    }
    const list = componentSections(ctx);
    if (list.error) {
        ctx.error(rel, list.line, list.error);
        return;
    }
    const sections = indexSections(ctx);
    const n = Math.max(list.items.length, sections.length);
    for (let i = 0; i < n; i++) {
        const item = list.items[i];
        const s = sections[i];
        if (!item) {
            ctx.error(rel, list.end, `SECTIONS: falta a seção ${pad2(i)}, #${s.id} (index.html:${s.el.line})`);
            continue;
        }
        if (!s) {
            ctx.error(rel, item.line, `SECTIONS: "${item.id}" a mais; o index.html tem ${sections.length} seções`);
            continue;
        }
        if (item.id !== s.id) {
            ctx.error(rel, item.line, `SECTIONS: o item ${pad2(i)} é "${item.id}"; no index.html a seção ${pad2(i)} é #${s.id} (linha ${s.el.line})`);
            continue;
        }
        const expected = s.kicker ? numberedLabel(s.kicker).label : i === 0 ? HERO_LABEL : null;
        if (expected !== null && item.label !== expected) {
            const from = s.kicker ? `o do kicker de #${s.id}, index.html:${s.kicker.line}` : "o hero não tem kicker";
            ctx.error(rel, item.line, `SECTIONS: "${item.id}" com rótulo "${item.label}"; esperado "${expected}" (${from})`);
        }
    }
}

/* Head: three igual no modulepreload e no importmap; mesma URL de fontes; um só ?v=;
   metas og/twitter com as mesmas chaves nas páginas. */
function ruleHead(ctx) {
    const version = (url) => (/three@([^/]+)/.exec(url) || [])[1] || "?";
    const threes = [];
    const fonts = [];
    const stamps = [];

    ctx.pages.forEach((page) => {
        const map = page.elements.find((el) => el.tag === "script" && attr(el, "type") === "importmap");
        let mapUrl = null;
        if (map) {
            try {
                mapUrl = (JSON.parse(map.raw).imports || {}).three || null;
            } catch (e) {
                ctx.error(page.rel, map.line, `importmap não é JSON válido: ${e.message}`);
            }
        }
        if (mapUrl) {
            threes.push({ file: page.rel, line: map.line, url: mapUrl, where: "importmap" });
        } else {
            ctx.error(page.rel, map ? map.line : 1, 'sem importmap com "three"');
        }
        const preloads = page.elements.filter((el) => el.tag === "link" && relHas(el, "modulepreload") && /\/three@/.test(attr(el, "href") || ""));
        if (!preloads.length) {
            ctx.error(page.rel, map ? map.line : 1, 'sem <link rel="modulepreload"> do three');
        }
        preloads.forEach((el) => threes.push({ file: page.rel, line: el.line, url: attr(el, "href"), where: "modulepreload" }));

        const fontLinks = page.elements.filter((el) => el.tag === "link" && relHas(el, "stylesheet") && (attr(el, "href") || "").startsWith("https://fonts.googleapis.com/"));
        if (fontLinks.length !== 1) {
            ctx.error(page.rel, fontLinks.length ? fontLinks[1].line : 1, `esperado 1 <link> de fontes do Google; há ${fontLinks.length}`);
        }
        fontLinks.forEach((el) => fonts.push({ file: page.rel, line: el.line, url: attr(el, "href") }));

        for (const m of page.src.text.matchAll(/[?&]v=([^&"'\s#<>]+)/g)) {
            stamps.push({ file: page.rel, line: page.src.lineAt(m.index), value: m[1] });
        }
    });

    agree(ctx, threes, (t) => t.url, (t, ref) => `three: ${t.where} usa ${version(t.url)} (${t.url}); o resto usa ${version(ref)} (${ref})`);
    agree(ctx, fonts, (f) => f.url, (f, ref) => `URL de fontes diferente das outras páginas:\n      ${f.url}\n    esperado:\n      ${ref}`);
    agree(ctx, stamps, (s) => s.value, (s, ref) => `?v=${s.value} difere do valor usado no resto do site (?v=${ref})`);

    const metaKeys = (page) => {
        const keys = new Map();
        page.elements.forEach((el) => {
            const key = el.tag === "meta" && (attr(el, "property") || attr(el, "name"));
            if (key && /^(og|twitter):/.test(key) && !keys.has(key)) {
                keys.set(key, el.line);
            }
        });
        return keys;
    };
    const [ref, ...others] = ctx.pages;
    if (ref) {
        const refKeys = metaKeys(ref);
        others.forEach((page) => {
            const keys = metaKeys(page);
            const headLine = (findFirst(page.doc, is("head")) || { line: 1 }).line;
            refKeys.forEach((_, key) => {
                if (!keys.has(key)) {
                    ctx.error(page.rel, headLine, `falta a meta ${key}, que ${ref.rel} tem`);
                }
            });
            keys.forEach((line, key) => {
                if (!refKeys.has(key)) {
                    ctx.error(page.rel, line, `meta ${key} não existe em ${ref.rel}`);
                }
            });
        });
    }
}

/* components.js no <head> de cada página do jeito que funciona: um só, comum e síncrono
   (sem defer, async, module nem blocking), o primeiro script do <head> (o script de tema
   mora no topo dele: nenhuma cópia inline) e antes do primeiro stylesheet (script
   síncrono depois de stylesheet espera o CSS baixar). Cada elemento dele na página:
   vazio, com page válido (o componente monta algo com ele) e sem repetir o page que
   outra página usa; um <site-header> e um <site-footer> por página. */
function ruleComponents(ctx) {
    const ONE_PER_PAGE = ["site-header", "site-footer"];
    const comps = ctx.components;
    const name = comps.rel;
    if (comps.error) {
        ctx.error(name, comps.error.line, comps.error.msg);
    }

    const owner = new Map(); /* "tag page" -> página que usa */
    ctx.pages.forEach((page) => {
        const head = findFirst(page.doc, is("head"));
        const headLine = head ? head.line : 1;

        const scripts = page.elements.filter((el) => el.tag === "script" && localPath(ctx, attr(el, "src") || "", page.rel) === name);
        if (scripts.length !== 1) {
            ctx.error(page.rel, scripts.length ? scripts[1].line : headLine, `esperado 1 <script src="${name}"> no <head>; há ${scripts.length}`);
        }
        const script = scripts[0];
        if (script) {
            const bad = ["defer", "async", "blocking"].filter((a) => hasAttr(script, a));
            const type = attr(script, "type");
            if (type !== null && !/^(text\/javascript)?$/i.test(type.trim())) {
                bad.push(`type="${type}"`);
            }
            if (bad.length) {
                ctx.error(page.rel, script.line, `<script src="${name}"> tem que ser comum e síncrono; tire ${bad.join(", ")} (com defer, async ou module os elementos só são definidos depois do parse e ficam vazios na primeira pintura)`);
            }
            if (!head || script.parent !== head) {
                ctx.error(page.rel, script.line, `<script src="${name}"> tem que ficar direto no <head>`);
            } else {
                const kids = childElements(head);
                const at = kids.indexOf(script);
                const first = kids.find((el) => el.tag === "script");
                const sheet = kids.findIndex((el) => el.tag === "link" && relHas(el, "stylesheet"));
                if (first !== script) {
                    ctx.error(page.rel, script.line, `<script src="${name}"> tem que ser o primeiro script do <head> (o tema dele entra antes da primeira pintura); antes dele vem o <script> da linha ${first.line}`);
                }
                if (sheet !== -1 && at > sheet) {
                    ctx.error(page.rel, script.line, `<script src="${name}"> vem depois do stylesheet da linha ${kids[sheet].line}: script síncrono depois de stylesheet espera o CSS baixar; tem que vir antes`);
                }
            }
        }

        /* o tema fica no topo do components.js: nenhuma cópia inline no <head> */
        const inlineTheme = (el) =>
            el.tag === "script" && !hasAttr(el, "src") && /^(text\/javascript)?$/i.test((attr(el, "type") || "").trim()) &&
            /data-theme|theme-color|portfolio-theme/.test(el.raw);
        (head ? findAll(head, inlineTheme) : []).forEach((el) => {
            ctx.error(page.rel, el.line, `script de tema inline no <head>: o tema fica no topo do ${name}; apague este`);
        });

        const counts = new Map();
        page.elements.filter((el) => comps.tags.has(el.tag) && !el.generated).forEach((el) => {
            counts.set(el.tag, (counts.get(el.tag) || 0) + 1);
            const value = attr(el, "page");
            const label = `<${el.tag}${value === null ? "" : ` page="${value}"`}>`;
            if (el.renderError) {
                ctx.error(page.rel, el.line, `${label} quebrou ao montar: ${el.renderError}`);
            } else if (value === null) {
                ctx.error(page.rel, el.line, `<${el.tag}> sem o atributo page`);
            } else if (!el.rendered) {
                ctx.error(page.rel, el.line, `${label}: page inválido (o ${name} não monta nada com ele)`);
            }
            if (value !== null) {
                const key = `${el.tag} ${value}`;
                if (owner.has(key) && owner.get(key) !== page.rel) {
                    ctx.error(page.rel, el.line, `${label} também está em ${owner.get(key)}; cada página usa o seu page`);
                } else {
                    owner.set(key, page.rel);
                }
            }
            if (el.children.some((c) => !c.generated && (c.tag || c.text.trim()))) {
                ctx.error(page.rel, el.line, `${label} tem conteúdo escrito na página; deixe vazio (quem monta é o ${name})`);
            }
        });
        ONE_PER_PAGE.filter((tag) => comps.tags.has(tag)).forEach((tag) => {
            const n = counts.get(tag) || 0;
            if (n !== 1) {
                const where = n ? page.elements.filter((el) => el.tag === tag && !el.generated)[1].line : (findFirst(page.doc, is("body")) || { line: 1 }).line;
                ctx.error(page.rel, where, `esperado 1 <${tag}> na página; há ${n}`);
            }
        });
    });
}

/* Cores do tema iguais em: script.js (THEME_META), script de tema do components.js, meta
   theme-color, --bg do style.css e névoa (fog) do scene.js. */
function ruleThemeColors(ctx) {
    const HEX = "#[0-9a-fA-F]{3,8}";
    const norm = (c) => {
        const v = c.toLowerCase();
        return /^#[0-9a-f]{3}$/.test(v) ? `#${[...v.slice(1)].map((ch) => ch + ch).join("")}` : v;
    };
    const entries = [];
    const add = (theme, file, line, value, what) => entries.push({ theme, file, line, value: norm(value), what });
    const missing = (file, line, what) => ctx.error(file, line, `não achei ${what} (a regra de cores do tema precisa ser atualizada se isso mudou de lugar)`);

    /* script.js: const THEME_META = { dark: "#…", light: "#…" } */
    const script = ctx.source("script.js");
    const meta = script && /THEME_META\s*=\s*\{([^}]*)\}/.exec(script.text);
    if (meta) {
        ["dark", "light"].forEach((theme) => {
            const m = new RegExp(`${theme}\\s*:\\s*["'](${HEX})["']`).exec(meta[1]);
            if (m) {
                add(theme, "script.js", script.lineAt(meta.index + meta[0].indexOf(m[0])), m[1], "THEME_META do script.js");
            } else {
                missing("script.js", script.lineAt(meta.index), `a cor "${theme}" em THEME_META`);
            }
        });
    } else {
        missing("script.js", 1, "THEME_META no script.js");
    }

    /* script de tema no topo do components.js: … === "light" ? "#claro" : "#escuro" */
    const comps = ctx.source(ctx.components.rel);
    const themeScript = comps && new RegExp(`["']light["']\\s*\\?\\s*["'](${HEX})["']\\s*:\\s*["'](${HEX})["']`).exec(comps.text);
    if (themeScript) {
        const line = comps.lineAt(themeScript.index);
        add("light", comps.rel, line, themeScript[1], `script de tema do ${comps.rel}`);
        add("dark", comps.rel, line, themeScript[2], `script de tema do ${comps.rel}`);
    } else {
        missing(ctx.components.rel, 1, `as cores no script de tema do ${ctx.components.rel}`);
    }

    ctx.pages.forEach((page) => {
        const head = findFirst(page.doc, is("head"));

        /* meta theme-color: vale para o tema inicial do <html data-theme> (padrão escuro) */
        const html = findFirst(page.doc, is("html"));
        const initial = (html && attr(html, "data-theme")) === "light" ? "light" : "dark";
        const tc = page.elements.find((el) => el.tag === "meta" && attr(el, "name") === "theme-color");
        if (tc && new RegExp(`^${HEX}$`).test(attr(tc, "content") || "")) {
            add(initial, page.rel, tc.line, attr(tc, "content"), `meta theme-color (tema inicial: ${initial === "light" ? "claro" : "escuro"})`);
        } else {
            missing(page.rel, head ? head.line : 1, '<meta name="theme-color"> com cor hexadecimal');
        }
    });

    /* style.css: --bg no bloco :root (escuro) e no bloco [data-theme="light"] puro (claro) */
    const css = ctx.source("style.css");
    const cssText = css ? blankComments(css.text) : "";
    [["dark", /(^|\})\s*:root\s*\{([^}]*)\}/m], ["light", /(^|\})\s*\[data-theme=["']light["']\]\s*\{([^}]*)\}/m]].forEach(([theme, re]) => {
        const block = css && re.exec(cssText);
        const m = block && new RegExp(`--bg\\s*:\\s*(${HEX})`).exec(block[2]);
        if (m) {
            add(theme, "style.css", css.lineAt(block.index + block[0].indexOf(block[2]) + m.index), m[1], `--bg do style.css`);
        } else {
            missing("style.css", 1, `--bg do tema ${theme} no style.css`);
        }
    });

    /* scene.js: THEMES = { dark: { … fog: new THREE.Color("#…") … }, light: { … } } */
    const scene = ctx.source("scene.js");
    const themesAt = scene ? scene.text.search(/THEMES\s*=\s*\{/) : -1;
    if (themesAt === -1) {
        missing("scene.js", 1, "o objeto THEMES no scene.js");
    } else {
        const darkAt = scene.text.indexOf("dark:", themesAt);
        const lightAt = scene.text.indexOf("light:", darkAt === -1 ? themesAt : darkAt);
        [["dark", darkAt, lightAt], ["light", lightAt, -1]].forEach(([theme, from, until]) => {
            const re = new RegExp(`fog\\s*:\\s*new\\s+THREE\\.Color\\(\\s*["'](${HEX})["']`, "g");
            re.lastIndex = Math.max(from, 0);
            const m = from === -1 ? null : re.exec(scene.text);
            if (m && (until === -1 || m.index < until)) {
                add(theme, "scene.js", scene.lineAt(m.index), m[1], "névoa (fog) do scene.js");
            } else {
                missing("scene.js", scene.lineAt(themesAt), `a névoa do tema ${theme} em THEMES no scene.js`);
            }
        });
    }

    ["dark", "light"].forEach((theme) => {
        const name = theme === "dark" ? "escuro" : "claro";
        agree(ctx, entries.filter((e) => e.theme === theme), (e) => e.value,
            (e, ref) => `cor do tema ${name} em ${e.what} é ${e.value}; nas outras fontes é ${ref}`);
    });
}

/* Fim do bloco que abre em text[open] ("{"), contando chaves e pulando strings. */
function matchBrace(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            const end = text.indexOf(ch, i + 1);
            i = end === -1 ? text.length : end;
        } else if (ch === "{") {
            depth++;
        } else if (ch === "}" && --depth === 0) {
            return i;
        }
    }
    return text.length;
}

/* Regras de um CSS com comentários em branco: { prelude, at, body } para as comuns e
   { prelude, at, rules } para as at-rules com bloco (@media…), recursivo. */
function cssRules(text, from = 0, to = text.length) {
    const out = [];
    let start = from;
    for (let i = from; i < to; i++) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            const end = text.indexOf(ch, i + 1);
            i = end === -1 ? to : end;
        } else if (ch === ";" || ch === "}") {
            start = i + 1;
        } else if (ch === "{") {
            const close = matchBrace(text, i);
            const raw = text.slice(start, i);
            const prelude = raw.trim();
            const rule = { prelude, at: start + raw.indexOf(prelude) };
            if (prelude.startsWith("@")) {
                rule.rules = cssRules(text, i + 1, close);
            } else {
                rule.body = text.slice(i + 1, close);
            }
            out.push(rule);
            i = close;
            start = close + 1;
        }
    }
    return out;
}

/* Lado do texto no layout dividido (@media (min-width: 1100px)): o style.css alterna pela
   posição da seção numa regra só, `<seletor de lado> > * { margin-left: auto }`, sem
   `#id > *` mexendo na margem horizontal; o scene.js (TEXT_RIGHT) usa o mesmo seletor para
   pôr a formação 3D do outro lado. */
function ruleSplitSide(ctx) {
    const SPLIT = "(min-width:1100px)";
    const HORIZONTAL = /(^|;)\s*(margin|margin-left|margin-right|margin-inline(-start|-end)?)\s*:/;
    const css = ctx.source("style.css");
    const scene = ctx.source("scene.js");
    if (!css || !scene) {
        ctx.error(css ? "scene.js" : "style.css", 1, "arquivo não encontrado (regra do lado do layout dividido)");
        return;
    }
    const query = (rule) => rule.prelude.replace(/^@media\b/i, "").replace(/\s+/g, "");
    const medias = cssRules(blankComments(css.text)).filter((r) => r.rules && /^@media\b/i.test(r.prelude));

    /* nenhum #id > * mexe na margem horizontal em media query do layout dividido */
    medias.filter((m) => query(m).includes(SPLIT)).forEach((m) => {
        m.rules.filter((r) => r.body !== undefined && HORIZONTAL.test(r.body)).forEach((r) => {
            r.prelude.split(",").map((s) => s.trim()).filter((s) => /#[\w-]+\s*>\s*\*$/.test(s)).forEach((s) => {
                ctx.error("style.css", css.lineAt(r.at + r.prelude.indexOf(s)), `"${s}" controla o lado por id no layout dividido; o lado sai da posição da seção (seletor de lado do scene.js, TEXT_RIGHT)`);
            });
        });
    });

    /* o seletor de lado: a regra com margin-left: auto em @media (min-width: 1100px) */
    const sides = medias.filter((m) => query(m) === SPLIT)
        .flatMap((m) => m.rules.filter((r) => r.body !== undefined && /(^|;)\s*margin-left\s*:\s*auto\s*(;|$)/.test(r.body)));
    if (sides.length !== 1) {
        ctx.error("style.css", sides.length ? css.lineAt(sides[1].at) : 1,
            `esperada 1 regra de lado (margin-left: auto) em @media (min-width: 1100px); há ${sides.length}`);
        return;
    }
    const side = sides[0];
    const sideLine = css.lineAt(side.at);
    const selector = side.prelude.replace(/\s+/g, " ");
    const m = /^(.+?)\s*>\s*\*$/.exec(selector);
    if (selector.includes(",") || !m) {
        ctx.error("style.css", sideLine, `a regra de lado deveria ser um seletor só, "<seletor de lado> > *"; é "${selector}"`);
        return;
    }
    const cssSide = m[1];

    const js = /\bconst\s+TEXT_RIGHT\s*=\s*(["'])([^"'\n]*)\1/.exec(blankComments(scene.text));
    if (!js) {
        ctx.error("scene.js", 1, `sem const TEXT_RIGHT = "…" (o seletor de lado do style.css: "${cssSide}")`);
        return;
    }
    if (js[2].replace(/\s+/g, " ").trim() !== cssSide) {
        ctx.error("scene.js", scene.lineAt(js.index), `TEXT_RIGHT = "${js[2]}"; no style.css (linha ${sideLine}) o seletor de lado é "${cssSide}"`);
    }
}

/* ---------- Avisos ---------- */

/* Strings literais de um JS (para achar classes usadas em classList, className, innerHTML…). */
function jsStrings(code) {
    const out = [];
    const regexAllowedAfter = /[(,=:[!&|?{};+\-*%<>~^]$|^$|\breturn$|\btypeof$/;
    let i = 0;
    let prev = "";
    while (i < code.length) {
        const ch = code[i];
        const next = code[i + 1];
        if (ch === "/" && next === "/") {
            const end = code.indexOf("\n", i);
            i = end === -1 ? code.length : end;
        } else if (ch === "/" && next === "*") {
            const end = code.indexOf("*/", i + 2);
            i = end === -1 ? code.length : end + 2;
        } else if (ch === '"' || ch === "'" || ch === "`") {
            let j = i + 1;
            while (j < code.length && code[j] !== ch) {
                j += code[j] === "\\" ? 2 : 1;
            }
            out.push(code.slice(i + 1, j));
            i = j + 1;
            prev = "x";
        } else if (ch === "/" && regexAllowedAfter.test(prev)) {
            /* regex literal: pula até a barra de fechamento fora de [...] */
            let j = i + 1;
            let inClass = false;
            while (j < code.length && (inClass || code[j] !== "/") && code[j] !== "\n") {
                if (code[j] === "\\") {
                    j++;
                } else if (code[j] === "[") {
                    inClass = true;
                } else if (code[j] === "]") {
                    inClass = false;
                }
                j++;
            }
            i = j + 1;
            prev = "x";
        } else {
            if (!/\s/.test(ch)) {
                prev = /[\w$]/.test(ch) ? (/[\w$]$/.test(prev) ? prev + ch : ch) : ch;
            }
            i++;
        }
    }
    return out;
}

/* Troca comentários /* … *\/ por espaços, mantendo posições e linhas. */
function blankComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

/* Classes declaradas nos seletores de um CSS, com a linha da primeira ocorrência. */
function cssClasses(src) {
    const text = blankComments(src.text);
    const found = new Map();
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            const end = text.indexOf(ch, i + 1);
            i = end === -1 ? text.length : end;
        } else if (ch === "{") {
            const prelude = text.slice(start, i).replace(/\[[^\]]*\]/g, (s) => " ".repeat(s.length));
            for (const m of prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
                if (!found.has(m[1])) {
                    found.set(m[1], src.lineAt(start + m.index));
                }
            }
            start = i + 1;
        } else if (ch === "}" || ch === ";") {
            start = i + 1;
        }
    }
    return found;
}

/* Classes do CSS que não aparecem em nenhum class="" dos HTML nem em strings dos JS. */
function warnUnusedCss(ctx) {
    const used = new Set();
    const addTokens = (s) => s.split(/[^\w-]+/).filter(Boolean).forEach((t) => used.add(t));

    ctx.pages.forEach((page) => {
        page.elements.forEach((el) => {
            classes(el).forEach((c) => used.add(c));
            if (el.tag === "script" && !hasAttr(el, "src")) {
                jsStrings(el.raw).forEach(addTokens);
            }
        });
    });
    ctx.list(".", ".js").forEach((rel) => jsStrings(ctx.source(rel).text).forEach(addTokens));

    ctx.list(".", ".css").forEach((rel) => {
        cssClasses(ctx.source(rel)).forEach((line, name) => {
            if (!used.has(name)) {
                ctx.warn(rel, line, `classe .${name} sem uso em HTML/JS`);
            }
        });
    });
}

/* "NN certificados" no index comparado com o total de data/certificados.json. */
function warnCertCount(ctx) {
    const page = ctx.page("index.html");
    const src = ctx.source("data/certificados.json");
    if (!page || !src) {
        return;
    }
    let total;
    try {
        total = JSON.parse(src.text).length;
    } catch {
        return;
    }
    for (const m of page.src.text.matchAll(/(\d+)\s+certificados\b/g)) {
        if (Number(m[1]) !== total) {
            ctx.warn(page.rel, page.src.lineAt(m.index), `o texto diz "${m[0]}", mas data/certificados.json tem ${total} itens`);
        }
    }
}

/* ============================================================
   Execução
   ============================================================ */

/* Ordem de execução. Regras novas entram aqui (ex.: ordem das seções no SECTIONS do
   components.js; --fix da numeração). */
const RULES = [
    ["ids", ruleIds],
    ["arquivos", ruleFiles],
    ["dados", ruleDataFiles],
    ["secoes", ruleSections],
    ["numeracao", ruleNumbering],
    ["menus", ruleMenus],
    ["lista-secoes", ruleSectionList],
    ["head", ruleHead],
    ["componentes", ruleComponents],
    ["cores", ruleThemeColors],
    ["lado", ruleSplitSide],
    ["css-sem-uso", warnUnusedCss],
    ["contagem", warnCertCount]
];

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const root = resolve(args[0] || join(dirname(fileURLToPath(import.meta.url)), ".."));
const ctx = createContext(root);

if (!ctx.pages.length) {
    console.error(`check: nenhum .html em ${root}`);
    process.exit(1);
}

for (const [name, rule] of RULES) {
    ctx.rule = name;
    try {
        rule(ctx);
    } catch (e) {
        ctx.error("tools/check.mjs", 1, `a regra quebrou: ${e.stack || e}`);
    }
}

const errors = ctx.problems.filter((p) => p.level === "erro");
const warnings = ctx.problems.filter((p) => p.level === "aviso");
[...errors, ...warnings].forEach((p) => {
    console.log(`${p.file}:${p.line}: ${p.level} [${p.rule}] ${p.msg}`);
});

const ms = Math.round(performance.now() - started);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
console.log(`\ncheck: ${plural(errors.length, "erro", "erros")}, ${plural(warnings.length, "aviso", "avisos")} — ${ctx.pages.map((p) => p.rel).join(", ")} (${ms} ms)`);
process.exit(errors.length ? 1 : 0);
