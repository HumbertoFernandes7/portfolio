const THEME_STORAGE_KEY = "portfolio-theme";
const THEME_META_COLORS = {
    light: "#f5f5f7",
    dark: "#0e1015"
};

document.addEventListener("DOMContentLoaded", () => {
    const root = document.documentElement;
    const themeToggle = document.getElementById("theme-toggle");
    const themeMeta = document.querySelector('meta[name="theme-color"]');

    const getTheme = () => (root.getAttribute("data-theme") === "dark" ? "dark" : "light");

    const syncThemeMeta = (theme) => {
        if (!themeMeta) {
            return;
        }

        themeMeta.setAttribute("content", THEME_META_COLORS[theme] || THEME_META_COLORS.light);
    };

    const syncThemeToggle = (theme) => {
        if (!themeToggle) {
            return;
        }

        const isDark = theme === "dark";
        themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
        themeToggle.setAttribute(
            "aria-label",
            isDark ? "Ativar tema claro" : "Ativar tema escuro"
        );
    };

    const applyTheme = (theme) => {
        const next = theme === "dark" ? "dark" : "light";
        root.setAttribute("data-theme", next);

        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch (e) {
            /* ignore */
        }

        syncThemeMeta(next);
        syncThemeToggle(next);
    };

    syncThemeMeta(getTheme());
    syncThemeToggle(getTheme());

    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            applyTheme(getTheme() === "dark" ? "light" : "dark");
        });
    }

    const body = document.body;
    const header = document.querySelector("[data-header]");
    const hero = document.querySelector(".hero");
    const revealElements = document.querySelectorAll("[data-reveal]");
    const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');
    const sections = document.querySelectorAll("[data-section]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    body.classList.add("js-ready");

    revealElements.forEach((element) => {
        const delay = Number(element.dataset.delay || 0);
        element.style.setProperty("--reveal-delay", `${delay}ms`);
    });

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

    const updateHeaderState = () => {
        if (!header) {
            return;
        }

        header.classList.toggle("is-scrolled", window.scrollY > 24);
    };

    updateHeaderState();
    window.addEventListener("scroll", updateHeaderState, { passive: true });

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
            {
                threshold: 0.14,
                rootMargin: "0px 0px -8% 0px"
            }
        );

        revealElements.forEach((element) => revealObserver.observe(element));
    } else {
        revealElements.forEach((element) => element.classList.add("is-visible"));
    }

    if (sections[0]) {
        setActiveLink(sections[0].id);
    }

    if ("IntersectionObserver" in window) {
        const sectionObserver = new IntersectionObserver(
            (entries) => {
                const visibleEntries = entries.filter((entry) => entry.isIntersecting);

                if (visibleEntries.length === 0) {
                    return;
                }

                visibleEntries
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
                    .slice(0, 1)
                    .forEach((entry) => setActiveLink(entry.target.id));
            },
            {
                threshold: [0.2, 0.4, 0.6],
                rootMargin: "-30% 0px -45% 0px"
            }
        );

        sections.forEach((section) => sectionObserver.observe(section));
    }

    if (!reduceMotion && hero) {
        let frameId = null;
        let pointerX = 0;
        let pointerY = 0;

        const renderParallax = () => {
            hero.style.setProperty("--hero-shift-x", `${pointerX * 10}px`);
            hero.style.setProperty("--hero-shift-y", `${pointerY * 14}px`);
            hero.style.setProperty("--hero-orb-shift-x", `${pointerX * 22}px`);
            hero.style.setProperty("--hero-orb-shift-y", `${pointerY * 18}px`);
            frameId = null;
        };

        const requestParallaxFrame = () => {
            if (frameId !== null) {
                return;
            }

            frameId = window.requestAnimationFrame(renderParallax);
        };

        hero.addEventListener("pointermove", (event) => {
            const rect = hero.getBoundingClientRect();
            const xRatio = (event.clientX - rect.left) / rect.width - 0.5;
            const yRatio = (event.clientY - rect.top) / rect.height - 0.5;

            pointerX = xRatio;
            pointerY = yRatio;
            requestParallaxFrame();
        });

        hero.addEventListener("pointerleave", () => {
            pointerX = 0;
            pointerY = 0;
            requestParallaxFrame();
        });

        const updateHeroScroll = () => {
            const rect = hero.getBoundingClientRect();
            const progress = Math.max(0, Math.min(1, -rect.top / (window.innerHeight * 0.9)));
            const shift = progress * 18;
            hero.style.setProperty("--hero-scroll-shift", `${shift}px`);
        };

        updateHeroScroll();
        window.addEventListener("scroll", updateHeroScroll, { passive: true });
        window.addEventListener("resize", updateHeroScroll);
    }
});
