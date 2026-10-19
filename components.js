/* ============================================================
   Componentes compartilhados pelas páginas (Web Components em DOM normal,
   sem shadow DOM: o style.css e o script.js alcançam as classes e ids).
   Hoje: <site-footer page="home|certificados">. O <site-header> entra
   aqui, com as mesmas constantes.

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

    /* valores aceitos no atributo page; top = o alvo do "voltar ao topo" */
    const PAGES = {
        home: { href: "index.html", top: "#inicio" },
        certificados: { href: "certificados.html" }
    };

    /* ---------- Utilitários ---------- */

    const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

    /* chave de PAGES no atributo page; null se faltar ou não existir */
    const pageOf = (el) => {
        const page = el.getAttribute("page");
        return Object.prototype.hasOwnProperty.call(PAGES, page) ? page : null;
    };

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

    customElements.define("site-footer", SiteFooter);
})();
