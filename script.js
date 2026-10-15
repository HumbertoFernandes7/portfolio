const THEME_KEY = "portfolio-theme";
const THEME_META = { dark: "#060b16", light: "#f3f2ed" };

document.addEventListener("DOMContentLoaded", () => {
    const root = document.documentElement;
    const body = document.body;

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

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealElements = document.querySelectorAll("[data-reveal]");

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

        revealElements.forEach((element) => revealObserver.observe(element));
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
        const sectionObserver = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

                if (visible) {
                    setActiveLink(visible.target.id);
                }
            },
            { threshold: [0.15, 0.35, 0.6], rootMargin: "-25% 0px -45% 0px" }
        );

        sections.forEach((section) => sectionObserver.observe(section));
    }
});
