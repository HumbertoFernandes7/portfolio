/* Smoke no navegador: as 2 páginas × 5 viewports × 2 temas.
   Todo teste falha se houver pageerror ou console.error (fixture automática). */
import { test as base, expect } from "@playwright/test";

const PAGES = [
    { name: "index", path: "/index.html" },
    { name: "certificados", path: "/certificados.html" }
];

const VIEWPORTS = [
    { width: 360, height: 740, touch: true },
    { width: 390, height: 844, touch: true },
    { width: 768, height: 1024 },
    { width: 1100, height: 800 },
    { width: 1440, height: 900 }
];

const THEMES = ["dark", "light"];

/* script de tema do head e script.js (o tools/check.mjs garante que as 5 fontes batem) */
const THEME_KEY = "portfolio-theme";
const THEME_COLOR = { dark: "#060b16", light: "#edf2f8" };

/* style.css: até 860px a site-nav some e entra o botão Menu */
const MENU_MAX = 860;
/* style.css e scene.js: a partir de 1100px o texto ocupa uma coluna e alterna de lado */
const SPLIT_MIN = 1100;

const test = base.extend({
    /* coleta pageerror e console.error durante o teste inteiro e falha no fim */
    pageErrors: [
        async ({ page }, use) => {
            const errors = [];
            page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
            page.on("console", (msg) => {
                if (msg.type() === "error") {
                    const { url, lineNumber } = msg.location();
                    errors.push(`console.error: ${msg.text()}${url ? ` (${url}:${lineNumber})` : ""}`);
                }
            });
            await use(errors);
            expect(errors, "sem pageerror nem console.error").toEqual([]);
        },
        { auto: true }
    ]
});

/* abre a página e espera o estado "pronto": load, fontes e (certificados) os cards */
async function open(page, path) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    if (path.includes("certificados")) {
        await expect(page.locator("#cert-grid > li").first()).toBeAttached();
    }
}

/* toque nos viewports de celular, clique nos outros */
const press = (locator, touch) => (touch ? locator.tap() : locator.click());

/* Elementos que passam da borda direita/esquerda (sem os position:fixed e os recortados
   por um ancestral com overflow). Lista os de fora (o bloco que vaza) e os de dentro
   (as folhas que vazam); o culpado costuma ser um dos dois. */
async function horizontalOverflow(page) {
    await page.addStyleTag({ content: "body { overflow-x: visible !important; }" });
    return page.evaluate(() => {
        const root = document.documentElement;
        const limit = root.clientWidth;
        if (root.scrollWidth <= limit) {
            return null;
        }
        const out = (r) => r.width > 0 && (r.right > limit + 0.5 || r.left < -0.5);
        const ignored = (el) => {
            for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
                const cs = getComputedStyle(n);
                if (cs.position === "fixed") {
                    return true;
                }
                if (n !== el && cs.overflowX !== "visible" && !out(n.getBoundingClientRect())) {
                    return true;
                }
            }
            return false;
        };
        const label = (el) =>
            el.localName + (el.id ? `#${el.id}` : "") + [...el.classList].map((c) => `.${c}`).join("");
        const offenders = [...document.body.querySelectorAll("*")].filter(
            (el) => out(el.getBoundingClientRect()) && !ignored(el)
        );
        const set = new Set(offenders);
        const outer = offenders.filter((el) => !set.has(el.parentElement));
        const leaves = offenders.filter((el) => ![...el.querySelectorAll("*")].some((c) => set.has(c)));
        const listed = [...new Set([...outer.slice(0, 6), ...leaves.slice(0, 9)])];
        return {
            scrollWidth: root.scrollWidth,
            clientWidth: limit,
            elements: listed.map((el) => {
                const r = el.getBoundingClientRect();
                const path = [];
                for (let n = el; n && n !== document.body; n = n.parentElement) {
                    path.unshift(label(n));
                    if (n.id) {
                        break;
                    }
                }
                return `${path.join(" > ")}  [${Math.round(r.left)}..${Math.round(r.right)}px]`;
            })
        };
    });
}

for (const { name: pageName, path } of PAGES) {
    for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
            test.describe(`${pageName} ${vp.width}×${vp.height} ${theme}`, () => {
                test.use({
                    viewport: { width: vp.width, height: vp.height },
                    hasTouch: Boolean(vp.touch),
                    isMobile: Boolean(vp.touch)
                });

                test.beforeEach(async ({ page }) => {
                    await page.addInitScript(
                        ([key, value]) => {
                            try {
                                localStorage.setItem(key, value);
                            } catch (e) {
                                /* about:blank */
                            }
                            /* custom elements ainda não definidos quando o HTML termina de montar */
                            document.addEventListener(
                                "DOMContentLoaded",
                                () => {
                                    window.__undefinedAtDCL = [...document.querySelectorAll(":not(:defined)")].map(
                                        (el) => el.localName
                                    );
                                },
                                { once: true }
                            );
                        },
                        [THEME_KEY, theme]
                    );
                    await open(page, path);
                });

                test("carrega limpo: sem rolagem horizontal, 3D ligado, DOM montado", async ({ page }) => {
                    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

                    const overflow = await horizontalOverflow(page);
                    expect(
                        overflow,
                        overflow &&
                            `rolagem horizontal: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}\n` +
                                overflow.elements.join("\n")
                    ).toBeNull();

                    await expect
                        .poll(
                            () =>
                                page.evaluate(() => {
                                    if (document.body.classList.contains("no-webgl")) {
                                        return "no-webgl";
                                    }
                                    const canvas = document.getElementById("scene-canvas");
                                    return canvas && canvas.classList.contains("is-on") ? "is-on" : "esperando";
                                }),
                            { message: "o canvas ganha is-on ou o body ganha no-webgl", timeout: 20_000 }
                        )
                        .not.toBe("esperando");

                    const dom = await page.evaluate(() => {
                        const counts = new Map();
                        document.querySelectorAll("[id]").forEach((el) => counts.set(el.id, (counts.get(el.id) || 0) + 1));
                        const anchors = [...document.querySelectorAll('a[href^="#"]')]
                            .map((a) => a.getAttribute("href"))
                            /* "#" e "#top" levam ao topo (o #lb-link nasce com href="#") */
                            .filter((href) => href !== "#" && href !== "#top")
                            .filter((href) => !document.getElementById(decodeURIComponent(href.slice(1))));
                        return {
                            undefinedAtDCL: window.__undefinedAtDCL,
                            duplicateIds: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
                            anchorsWithoutTarget: anchors
                        };
                    });
                    expect(dom.undefinedAtDCL, "elementos :not(:defined) no DOMContentLoaded").toEqual([]);
                    expect(dom.duplicateIds, "ids repetidos").toEqual([]);
                    expect(dom.anchorsWithoutTarget, 'a[href^="#"] sem alvo').toEqual([]);
                });

                test("tema: alterna data-theme, aria-pressed, localStorage e theme-color", async ({ page }) => {
                    const other = theme === "dark" ? "light" : "dark";
                    const html = page.locator("html");
                    const toggle = page.locator("#theme-toggle");
                    const meta = page.locator('meta[name="theme-color"]');

                    await expect(html).toHaveAttribute("data-theme", theme);
                    await expect(toggle).toHaveAttribute("aria-pressed", theme === "dark" ? "true" : "false");
                    await expect(meta).toHaveAttribute("content", THEME_COLOR[theme]);

                    await press(toggle, vp.touch);

                    await expect(html).toHaveAttribute("data-theme", other);
                    await expect(toggle).toHaveAttribute("aria-pressed", other === "dark" ? "true" : "false");
                    await expect(meta).toHaveAttribute("content", THEME_COLOR[other]);
                    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe(other);
                });

                if (vp.width <= MENU_MAX) {
                    test("menu do celular: abre, Esc fecha e devolve o foco, link fecha", async ({ page }) => {
                        const toggle = page.locator("#menu-toggle");
                        const body = page.locator("body");

                        await press(toggle, vp.touch);
                        await expect(toggle).toHaveAttribute("aria-expanded", "true");
                        await expect(body).toHaveClass(/(^|\s)menu-open(\s|$)/);

                        await page.keyboard.press("Escape");
                        await expect(toggle).toHaveAttribute("aria-expanded", "false");
                        await expect(body).not.toHaveClass(/(^|\s)menu-open(\s|$)/);
                        await expect(toggle).toBeFocused();

                        await press(toggle, vp.touch);
                        await expect(toggle).toHaveAttribute("aria-expanded", "true");
                        /* link para outra página: cancela a navegação (o handler do menu roda igual) */
                        await page.evaluate(() => {
                            document.addEventListener(
                                "click",
                                (event) => {
                                    const link = event.target.closest(".menu-nav a");
                                    if (link && !link.getAttribute("href").startsWith("#")) {
                                        event.preventDefault();
                                    }
                                },
                                true
                            );
                        });
                        await press(page.locator(".menu-nav a").nth(1), vp.touch);
                        await expect(toggle).toHaveAttribute("aria-expanded", "false");
                        await expect(body).not.toHaveClass(/(^|\s)menu-open(\s|$)/);
                    });
                }

                if (pageName === "index" && vp.width > MENU_MAX) {
                    test("scrollspy: rolar até #projetos marca o link com aria-current", async ({ page }) => {
                        await page.locator("#projetos").evaluate((el) => el.scrollIntoView({ block: "start" }));
                        const link = page.locator('.site-nav a[href="#projetos"]');
                        await expect(link).toHaveAttribute("aria-current", "location");
                        await expect(page.locator('.site-nav a[aria-current="location"]')).toHaveCount(1);
                    });
                }

                if (pageName === "index" && vp.width >= SPLIT_MIN) {
                    test("colunas: o texto alterna de lado (pares à esquerda, ímpares à direita)", async ({ page }) => {
                        const sides = await page.evaluate(() =>
                            [...document.querySelectorAll("main > [data-section]")].map((section) => {
                                const col = section.firstElementChild.getBoundingClientRect();
                                const box = section.getBoundingClientRect();
                                const cs = getComputedStyle(section);
                                const left = box.left + parseFloat(cs.paddingLeft);
                                const right = box.right - parseFloat(cs.paddingRight);
                                const offset = (col.left + col.right) / 2 - (left + right) / 2;
                                return { id: section.id, offset: Math.round(offset) };
                            })
                        );
                        expect(sides.length).toBeGreaterThan(1);
                        sides.forEach(({ id, offset }, i) => {
                            const side = offset < -8 ? "esquerda" : offset > 8 ? "direita" : `centro (${offset}px)`;
                            expect.soft(side, `#${id} (posição ${i})`).toBe(i % 2 === 0 ? "esquerda" : "direita");
                        });
                    });
                }

                if (pageName === "certificados") {
                    test("certificados: cards, filtro por chip e lightbox", async ({ page }) => {
                        const data = await (await page.request.get("/data/certificados.json")).json();
                        const cards = page.locator("#cert-grid > li");
                        const count = page.locator("#cert-count");

                        await expect(cards).toHaveCount(data.length);
                        await expect(count).toHaveText(`${data.length} de ${data.length}`);

                        /* o 1º chip é "Todos"; o 2º filtra pela primeira área */
                        const chip = page.locator("#cert-chips button").nth(1);
                        await press(chip, vp.touch);
                        await expect(chip).toHaveAttribute("aria-pressed", "true");
                        await expect(count).not.toHaveText(`${data.length} de ${data.length}`);
                        const filtered = Number((await count.textContent()).split(" ")[0]);
                        expect(filtered).toBeGreaterThan(0);
                        expect(filtered).toBeLessThan(data.length);
                        await expect(cards).toHaveCount(filtered);

                        const thumb = page.locator("#cert-grid .cert-thumb").first();
                        const dialog = page.locator("#lightbox");
                        await press(thumb, vp.touch);
                        await expect(dialog).toHaveAttribute("open", "");
                        await expect(page.locator("#lb-title")).not.toBeEmpty();
                        await page.keyboard.press("Escape");
                        await expect(dialog).not.toHaveAttribute("open");
                        await expect(thumb).toBeFocused();
                    });
                }

                if (pageName === "index") {
                    test("navegação: index → certificados → voltar", async ({ page }) => {
                        if (vp.width <= MENU_MAX) {
                            await press(page.locator("#menu-toggle"), vp.touch);
                            await press(page.locator(".menu-nav a.menu-page"), vp.touch);
                        } else {
                            await page.locator('.site-nav a[href="certificados.html"]').click();
                        }
                        await expect(page).toHaveURL(/\/certificados\.html$/);
                        await expect(page.locator("#cert-grid > li").first()).toBeVisible();

                        await page.goBack();
                        await expect(page).toHaveURL(/\/index\.html$/);
                        await expect(page.locator("#hero-title")).toBeVisible();
                    });
                }
            });
        }
    }
}
