/* Comparação visual A/B. Quem roda é o tools/ab.mjs (AB=1): primeiro com SITE_DIR=.ab/base
   gravando os snapshots, depois com SITE_DIR=. comparando. Tudo fica em .ab/.

   Estabilidade:
   - prefers-reduced-motion: sem reveal animado, sem scroll snap, 3D sem loop;
   - partículas do 3D (aleatórias) escondidas: um <style> injetado deixa o canvas com
     visibility:hidden (no lugar da máscara). O `mask` do Playwright não serve: o .webgl é fixo
     e ocupa a tela toda, e a máscara dele cobre o hero inteiro na página inteira. A opção
     `style` do toHaveScreenshot também não serviu: as partículas continuaram na captura;
   - raster por software (--disable-gpu, no playwright.config.mjs): com GPU, duas capturas
     seguidas da mesma página já saem diferentes;
   - document.fonts.ready e imagens lazy trocadas por eager (e decodificadas) antes da captura;
   - página inteira em fatias de até 8000 px: acima de 16384 px o Chromium repete o topo
     no fim da imagem (certificados passa de 19000 px em 768);
   - nenhum pixel pode mudar de forma perceptível (maxDiffPixels 0, threshold 0.01 no
     playwright.config.mjs: só absorve o arredondamento de 1 nível do raster por software). */
import { test, expect } from "@playwright/test";

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
const THEME_KEY = "portfolio-theme";
const HIDE_3D = ".webgl canvas { visibility: hidden !important; }";
const SLICE = 8000;
/* famílias do <link> do Google Fonts no head das duas páginas */
const FONT_FAMILIES = ["Fraunces", "Inter", "JetBrains Mono"];
const TABS = 25;

const viewport = (width) => VIEWPORTS.find((vp) => vp.width === width);
const useViewport = (vp) =>
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: Boolean(vp.touch), isMobile: Boolean(vp.touch) });

test.use({ reducedMotion: "reduce" });

/* abre a página no tema pedido e espera tudo assentar */
async function open(page, path, theme) {
    /* falhas de rede da rodada, para a mensagem de erro do settle */
    const network = [];
    page.on("requestfailed", (req) => network.push(`${req.failure()?.errorText ?? "falhou"} ${req.url()}`));
    page.on("response", (res) => {
        if (res.status() >= 400) {
            network.push(`HTTP ${res.status()} ${res.url()}`);
        }
    });
    await page.addInitScript(
        ([key, value]) => {
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                /* about:blank */
            }
        },
        [THEME_KEY, theme]
    );
    await page.goto(path);
    if (path.includes("certificados")) {
        await expect(page.locator("#cert-grid > li").first()).toBeAttached();
    }
    await page.waitForFunction(() => {
        const canvas = document.getElementById("scene-canvas");
        return document.body.classList.contains("no-webgl") || (canvas && canvas.classList.contains("is-on"));
    });
    await settle(page, network);
}

/* Imagens lazy -> eager, carregadas e decodificadas; fontes do Google carregadas; topo da
   página. Imagem que falhou ganha até 3 novas tentativas (uma falha esporádica de rede numa
   rodada vira diferença falsa); se ainda faltar imagem ou fonte, o teste para com a lista,
   em vez de comparar pixels de uma página incompleta. */
async function settle(page, network = []) {
    const missing = await page.evaluate(async (families) => {
        const images = [...document.images].filter((img) => img.getAttribute("src"));
        const done = (img) =>
            img.complete
                ? Promise.resolve()
                : new Promise((resolve) => {
                    img.addEventListener("load", resolve, { once: true });
                    img.addEventListener("error", resolve, { once: true });
                });
        images.forEach((img) => {
            if (img.loading === "lazy") {
                img.loading = "eager";
            }
        });
        let broken = [];
        for (let attempt = 1; attempt <= 4; attempt++) {
            await Promise.all(images.map(done));
            broken = images.filter((img) => !img.naturalWidth);
            if (!broken.length || attempt === 4) {
                break;
            }
            broken.forEach((img) => {
                const src = img.getAttribute("src").replace(/[?&]ab-retry=\d+$/, "");
                img.src = `${src}${src.includes("?") ? "&" : "?"}ab-retry=${attempt}`;
            });
        }
        await Promise.all(images.map((img) => img.decode().catch(() => {})));
        await document.fonts.ready;
        const loaded = new Set(
            [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, ""))
        );
        window.scrollTo(0, 0);
        return {
            images: broken.map((img) => img.getAttribute("src")),
            fonts: families.filter((family) => !loaded.has(family))
        };
    }, FONT_FAMILIES);
    const context = network.length ? `\nfalhas de rede:\n  ${network.join("\n  ")}` : "";
    expect(missing.images, `imagens que não carregaram (rode de novo)${context}`).toEqual([]);
    expect(missing.fonts, `fontes que não carregaram (rode de novo)${context}`).toEqual([]);
    await page.addStyleTag({ content: HIDE_3D });
}

/* página inteira em fatias de até SLICE px de altura */
async function fullPageSlices(page, name) {
    const { width, height } = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight
    }));
    for (let y = 0, i = 1; y < height; y += SLICE, i++) {
        await expect(page).toHaveScreenshot(`${name}-${i}.png`, {
            fullPage: true,
            clip: { x: 0, y, width, height: Math.min(SLICE, height - y) }
        });
    }
}

const press = (locator, touch) => (touch ? locator.tap() : locator.click());

async function openMenu(page, touch) {
    await press(page.locator("#menu-toggle"), touch);
    await expect(page.locator("#menu-toggle")).toHaveAttribute("aria-expanded", "true");
}

for (const { name: pageName, path } of PAGES) {
    /* as 2 páginas × 5 larguras × 2 temas, página inteira */
    for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
            test.describe(`${pageName} ${vp.width} ${theme}`, () => {
                useViewport(vp);
                test("página inteira", async ({ page }) => {
                    await open(page, path, theme);
                    await fullPageSlices(page, `pagina-${pageName}-${vp.width}-${theme}`);
                });
            });
        }
    }

    for (const theme of THEMES) {
        test.describe(`${pageName} 390 ${theme}`, () => {
            useViewport(viewport(390));
            test("menu aberto", async ({ page }) => {
                await open(page, path, theme);
                await openMenu(page, true);
                await expect(page).toHaveScreenshot(`menu-${pageName}-390-${theme}.png`);
            });
        });

        test.describe(`${pageName} 1440 ${theme}`, () => {
            useViewport(viewport(1440));
            test("cabeçalho com is-scrolled", async ({ page }) => {
                await open(page, path, theme);
                await page.evaluate(() => window.scrollTo(0, 600));
                const header = page.locator(".site-header");
                await expect(header).toHaveClass(/(^|\s)is-scrolled(\s|$)/);
                await expect(header).toHaveScreenshot(`cabecalho-rolado-${pageName}-1440-${theme}.png`);
            });
        });
    }

    /* árvore de acessibilidade e foco: independem do tema */
    test.describe(`${pageName} 1440 acessibilidade`, () => {
        useViewport(viewport(1440));
        test("aria do cabeçalho e do rodapé", async ({ page }) => {
            await open(page, path, "dark");
            await expect(page.locator(".site-header")).toMatchAriaSnapshot({ name: `aria-${pageName}-1440-cabecalho.aria.yml` });
            await expect(page.locator(".site-footer")).toMatchAriaSnapshot({ name: `aria-${pageName}-1440-rodape.aria.yml` });
        });
    });

    test.describe(`${pageName} 390 acessibilidade`, () => {
        useViewport(viewport(390));
        test("aria do cabeçalho e do menu aberto", async ({ page }) => {
            await open(page, path, "dark");
            await expect(page.locator(".site-header")).toMatchAriaSnapshot({ name: `aria-${pageName}-390-cabecalho.aria.yml` });
            await openMenu(page, true);
            await expect(page.locator("#menu-overlay")).toMatchAriaSnapshot({ name: `aria-${pageName}-390-menu.aria.yml` });
        });
    });

    for (const width of [1440, 390]) {
        test.describe(`${pageName} ${width} foco`, () => {
            useViewport(viewport(width));
            test(`sequência das primeiras ${TABS} teclas Tab`, async ({ page }) => {
                await open(page, path, "dark");
                const lines = [];
                for (let i = 1; i <= TABS; i++) {
                    await page.keyboard.press("Tab");
                    const focused = await page.evaluate(() => {
                        const el = document.activeElement;
                        if (!el || el === document.body) {
                            return "(body)";
                        }
                        const id = el.id ? `#${el.id}` : "";
                        const cls = [...el.classList].map((c) => `.${c}`).join("");
                        const name = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70);
                        const href = el.getAttribute("href");
                        return `${el.localName}${id}${cls} "${name}"${href ? ` → ${href}` : ""}`;
                    });
                    lines.push(`${String(i).padStart(2, "0")}  ${focused}`);
                }
                expect(`${lines.join("\n")}\n`).toMatchSnapshot(`foco-${pageName}-${width}.txt`);
            });
        });
    }
}
