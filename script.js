const THEME_KEY = "portfolio-theme";
const THEME_META = { dark: "#060b16", light: "#edf2f8" };

/* ---------- Transição entre páginas ----------
   Voltar ao portfólio (certificados → index) marca a transição como
   "back": o CSS inverte o movimento (afunda em vez de subir). Precisa
   estar no topo e antes da primeira pintura (o <script> é blocking="render"). */
if ("onpagereveal" in window) {
    window.addEventListener("pagereveal", (event) => {
        const transition = event.viewTransition;
        if (!transition || !transition.types) {
            return;
        }
        const activation = window.navigation && window.navigation.activation;
        const fromUrl = activation && activation.from ? activation.from.url : document.referrer;
        const isCertPage = (url) => /\/certificados\.html(?:[?#]|$)/.test(url || "");
        if (isCertPage(fromUrl) && !isCertPage(window.location.href)) {
            transition.types.add("back");
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const root = document.documentElement;
    const body = document.body;

    /* Reveal: mede o que já está na tela ANTES do js-ready. Medir depois
       forçaria um estilo com opacity 0 e a transição dispararia (piscada).
       Esses blocos ganham is-visible junto com o js-ready, sem transição. */
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealElements = document.querySelectorAll("[data-reveal]");
    const fold = window.innerHeight * 0.94;
    const revealedOnLoad = new Set(
        Array.from(revealElements).filter((element) => element.getBoundingClientRect().top < fold)
    );
    revealedOnLoad.forEach((element) => element.classList.add("is-visible"));

    body.classList.add("js-ready");

    /* ---------- Tema ---------- */

    const themeToggle = document.getElementById("theme-toggle");
    const themeMeta = document.querySelector('meta[name="theme-color"]');

    const getTheme = () => (root.getAttribute("data-theme") === "light" ? "light" : "dark");

    const syncThemeUI = (theme) => {
        if (themeMeta) {
            themeMeta.setAttribute("content", THEME_META[theme]);
        }
        if (themeToggle) {
            themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
            themeToggle.setAttribute(
                "aria-label",
                theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
            );
        }
    };

    const applyTheme = (theme) => {
        root.setAttribute("data-theme", theme);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {
            /* ignore */
        }
        syncThemeUI(theme);
        window.dispatchEvent(new CustomEvent("hf:theme", { detail: { theme } }));
    };

    syncThemeUI(getTheme());

    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            applyTheme(getTheme() === "dark" ? "light" : "dark");
        });
    }

    /* ---------- Header ---------- */

    const header = document.querySelector("[data-header]");

    const updateHeader = () => {
        if (header) {
            header.classList.toggle("is-scrolled", window.scrollY > 16);
        }
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });

    /* ---------- Menu overlay (mobile) ---------- */

    const menuToggle = document.getElementById("menu-toggle");
    const menuOverlay = document.getElementById("menu-overlay");

    const setMenu = (open) => {
        if (!menuToggle || !menuOverlay) {
            return;
        }
        menuOverlay.classList.toggle("is-open", open);
        menuOverlay.setAttribute("aria-hidden", open ? "false" : "true");
        menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
        menuToggle.textContent = open ? "Fechar" : "Menu";
        body.classList.toggle("menu-open", open);
    };

    if (menuToggle && menuOverlay) {
        menuToggle.addEventListener("click", () => {
            setMenu(!menuOverlay.classList.contains("is-open"));
        });

        menuOverlay.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => setMenu(false));
        });

        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && menuOverlay.classList.contains("is-open")) {
                setMenu(false);
                menuToggle.focus();
            }
        });
    }

    /* ---------- Reveal no scroll ---------- */

    if (!reduceMotion && "IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        );

        /* o que já estava na tela ao carregar não passa pelo observer */
        revealElements.forEach((element) => {
            if (!revealedOnLoad.has(element)) {
                revealObserver.observe(element);
            }
        });
    } else {
        revealElements.forEach((element) => element.classList.add("is-visible"));
    }

    /* Ao navegar por âncora, revela já os blocos da seção de destino
       (a seção nunca chega vazia enquanto o scroll suave termina). */
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener("click", () => {
            const id = link.getAttribute("href").slice(1);
            const targetSection = id ? document.getElementById(id) : null;
            if (!targetSection) {
                return;
            }
            targetSection.querySelectorAll("[data-reveal]").forEach((element) => {
                element.classList.add("is-visible");
            });
            if (targetSection.hasAttribute("data-reveal")) {
                targetSection.classList.add("is-visible");
            }
        });
    });

    /* ---------- Link ativo na navegação ---------- */

    const navLinks = document.querySelectorAll("[data-nav]");
    const sections = document.querySelectorAll("[data-section]");

    const setActiveLink = (id) => {
        navLinks.forEach((link) => {
            const isActive = link.getAttribute("href") === `#${id}`;
            link.classList.toggle("active", isActive);
            if (isActive) {
                link.setAttribute("aria-current", "location");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    };

    if ("IntersectionObserver" in window) {
        /* ativa = a seção que cruza uma linha fina a 40% da altura da tela.
           A fração visível não serve: numa seção alta (projetos) ela nunca
           passa do limite e o link ficava preso na seção anterior */
        const crossing = new Set();
        const sectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        crossing.add(entry.target);
                    } else {
                        crossing.delete(entry.target);
                    }
                });
                const current = Array.from(sections).find((section) => crossing.has(section));
                if (current) {
                    setActiveLink(current.id);
                }
            },
            { threshold: 0, rootMargin: "-40% 0px -59% 0px" }
        );

        sections.forEach((section) => sectionObserver.observe(section));
    }
});
