/* ============================================================
   Componentes compartilhados pelas páginas (Web Components em DOM normal,
   sem shadow DOM: o style.css e o script.js alcançam as classes e ids).
   <site-header page="home|certificados"> e <site-footer page="…">.

   Carregamento: <script src="components.js?v=…"> comum e síncrono no
   <head>, logo depois do script de tema e antes de qualquer stylesheet
   (script síncrono depois de stylesheet espera o CSS baixar). Assim o
   customElements.define roda antes do <body> e cada elemento é montado
   no connectedCallback, na hora em que o parser o insere: sem piscar e
   com tudo no lugar quando o script.js roda (DOMContentLoaded). Com
   defer, async ou module a definição chegaria depois do parse: o
   elemento ficaria vazio na primeira pintura e o script.js não acharia
   os links dele.

   Os componentes só geram HTML, sem listeners; o comportamento continua
   no script.js. O tools/check.mjs roda este arquivo para conferir o HTML
   gerado (ids, âncoras, arquivos): monte sempre com this.innerHTML.
   ============================================================ */

(() => {
    if (!window.customElements) {
        return;
    }

    /* ---------- Dados compartilhados ---------- */

    const PERSON = {
        name: "Humberto Fernandes",
        fullName: "Humberto Fernandes de Oliveira Pinto",
        email: "humbertofernandes08@hotmail.com",
        city: "São Paulo, Brasil"
    };

    /* Seções do index, na ordem da página: id da <section> e rótulo nos menus.
       Seção nova: acrescente uma linha aqui; o npm run check confere se a lista
       bate com as seções do index (ids, ordem e rótulos dos kickers). A primeira
       é o topo (o hero): a marca e o item 00 do menu levam a ela. */
    const SECTIONS = [
        { id: "inicio", label: "Início" },
        { id: "sobre", label: "Sobre" },
        { id: "projetos", label: "Projetos" },
        { id: "trajetoria", label: "Trajetória" },
        { id: "recomendacoes", label: "Recomendações" },
        { id: "contato", label: "Contato" }
    ];

    /* valores aceitos no atributo page; top = o alvo do "voltar ao topo";
       com label, a página entra nos menus, depois das seções */
    const PAGES = {
        home: { href: "index.html", top: `#${SECTIONS[0].id}` },
        certificados: { href: "certificados.html", label: "Certificados" }
    };

    /* ---------- Utilitários ---------- */

    const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
    const pad2 = (n) => String(n).padStart(2, "0");

    /* chave de PAGES no atributo page; null se faltar ou não existir */
    const pageOf = (el) => {
        const page = el.getAttribute("page");
        return Object.prototype.hasOwnProperty.call(PAGES, page) ? page : null;
    };

    /* ---------- <site-header> ---------- */

    /* destino de uma seção: na home, a âncora; nas outras páginas, o index com a
       âncora (o topo vai para o index sem âncora) */
    const sectionHref = (section, page) => {
        if (page === "home") {
            return `#${section.id}`;
        }
        return section === SECTIONS[0] ? PAGES.home.href : `${PAGES.home.href}#${section.id}`;
    };

    /* páginas que entram nos menus: [chave, dados] */
    const MENU_PAGES = Object.entries(PAGES).filter(([, p]) => p.label);

    /* site-nav: as seções menos o topo (a marca leva a ele) e as páginas. Na home,
       data-nav liga o scrollspy do script.js; a página atual leva active e
       aria-current="page" */
    const siteNavLinks = (page) => [
        ...SECTIONS.slice(1).map((s) =>
            `<a href="${esc(sectionHref(s, page))}"${page === "home" ? " data-nav" : ""}>${esc(s.label)}</a>`),
        ...MENU_PAGES.map(([key, p]) =>
            `<a href="${esc(p.href)}"${key === page ? ' class="active" aria-current="page"' : ""}>${esc(p.label)}</a>`)
    ];

    /* menu do celular: número = posição da seção. Outra página fica fora da
       numeração das seções, com a seta no lugar do número (.menu-page). --i é a
       posição do item, para o atraso da animação de entrada (style.css) */
    const menuNavLinks = (page) => [
        ...SECTIONS.map((s, i) =>
            `<a href="${esc(sectionHref(s, page))}" style="--i:${i}"><span>${pad2(i)}</span>${esc(s.label)}</a>`),
        ...MENU_PAGES.map(([key, p], j) =>
            `<a class="menu-page" href="${esc(p.href)}"${key === page ? ' aria-current="page"' : ""} style="--i:${SECTIONS.length + j}"><span aria-hidden="true">→</span>${esc(p.label)}</a>`)
    ];

    class SiteHeader extends HTMLElement {
        connectedCallback() {
            if (this.firstElementChild) {
                return;
            }
            const page = pageOf(this);
            if (!page) {
                return; /* o tools/check.mjs acusa page ausente ou inválido */
            }
            /* sem espaço antes do <header> nem depois do overlay: nenhum texto solto fora deles */
            this.innerHTML = `<header class="site-header" data-header>
                <div class="header-shell">
                    <a class="brand" href="${esc(sectionHref(SECTIONS[0], page))}" aria-label="Ir para o início">
                        <span class="brand-mark">HF</span>
                        <span class="brand-name">${esc(PERSON.name)}</span>
                    </a>

                    <nav class="site-nav" aria-label="Navegação principal">
                        ${siteNavLinks(page).join("\n")}
                    </nav>

                    <div class="header-tools">
                        <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Ativar tema claro" aria-pressed="true" title="Alternar tema">
                            <svg class="icon-moon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M21 14.5A8.5 8.5 0 019.5 3a8.5 8.5 0 0011.5 11.5z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <svg class="icon-sun" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/>
                                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="menu-overlay">Menu</button>
                    </div>
                </div>
            </header>

            <div class="menu-overlay" id="menu-overlay" aria-hidden="true">
                <nav class="menu-nav" aria-label="Menu">
                    ${menuNavLinks(page).join("\n")}
                </nav>
                <div class="menu-meta">
                    <a href="mailto:${esc(PERSON.email)}">${esc(PERSON.email)}</a>
                    <span>${esc(PERSON.city)}</span>
                </div>
            </div>`;
        }
    }

    /* ---------- <site-footer> ---------- */

    /* home termina em "voltar ao topo"; as outras páginas, em "voltar ao portfólio".
       O "feito com" ainda difere entre as duas (fica para um PR de textos). */
    const footerParts = (page) =>
        page === "home"
            ? {
                made: "HTML, CSS, JavaScript e Three.js — sem frameworks.",
                link: `<a href="${esc(PAGES.home.top)}" class="footer-top">voltar ao topo<span aria-hidden="true">↑</span></a>`
            }
            : {
                made: "HTML, CSS e JavaScript — sem frameworks.",
                link: `<a href="${esc(PAGES.home.href)}" class="footer-top footer-back"><span aria-hidden="true">←</span>voltar ao portfólio</a>`
            };

    class SiteFooter extends HTMLElement {
        connectedCallback() {
            if (this.firstElementChild) {
                return;
            }
            const page = pageOf(this);
            if (!page) {
                return; /* o tools/check.mjs acusa page ausente ou inválido */
            }
            const { made, link } = footerParts(page);
            /* sem espaço antes nem depois do <footer>: nenhum texto solto fora dele */
            this.innerHTML = `<footer class="site-footer">
                <p>© 2026 ${esc(PERSON.fullName)}</p>
                <p class="footer-made">${esc(made)}</p>
                ${link}
            </footer>`;
        }
    }

    customElements.define("site-header", SiteHeader);
    customElements.define("site-footer", SiteFooter);
})();
