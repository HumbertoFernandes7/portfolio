/* Smoke no navegador: as 2 páginas × 5 viewports × 2 temas.
   Todo teste falha se houver pageerror ou console.error (fixture automática); falha de
   transporte da máquina tem tratamento próprio (veja "Falha de rede da máquina"). */
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

/* script de tema do components.js e script.js (o tools/check.mjs garante que as 5 fontes batem) */
const THEME_KEY = "portfolio-theme";
const THEME_COLOR = { dark: "#060b16", light: "#edf2f8" };
/* botão de tema (syncThemeUI do script.js; o <site-header> já nasce assim) */
const THEME_TOGGLE = {
    dark: { pressed: "true", label: "Ativar tema claro" },
    light: { pressed: "false", label: "Ativar tema escuro" }
};

/* style.css: até 860px a site-nav some e entra o botão Menu */
const MENU_MAX = 860;
/* style.css e scene.js: a partir de 1100px o texto ocupa uma coluna e alterna de lado */
const SPLIT_MIN = 1100;

/* ---------- Falha de rede da máquina ----------
   No Windows, com vários workers (ou outra suíte rodando junto), a pilha de rede solta de vez
   em quando um erro de transporte numa conexão ao servidor local, em qualquer arquivo:
   net::ERR_NO_BUFFER_SPACE ou net::ERR_ADDRESS_IN_USE (WSAENOBUFS/WSAEADDRINUSE no connect).
   É falha da máquina, não do site. Dois cuidados, sem tirar nenhuma conferência:
   - carregamento (loadClean): se um pedido falhou assim, a página veio incompleta (sem CSS,
     sem os cards…) e é recarregada uma vez; os testes conferem a página recarregada;
   - console (fixture pageErrors): o "Failed to load resource: net::ERR_…" é conferido no fim,
     pedindo o recurso de novo; só conta se continuar falhando.
   Resposta de erro do servidor (404 etc.) não é falha de transporte e reprova na hora. Cada
   caso tolerado sai no terminal ("rede: …") e fica anotado no teste. */

/* Só erros de conexão (o pedido nem teve resposta). Ficam de fora os que o site pode causar
   (CORS, ORB, certificado, conteúdo inválido…) e o ERR_ABORTED (pedido cancelado pela própria
   navegação). Um 404 aparece como "Failed to load resource: the server responded with a status
   of 404 …". */
const SOCKET_ERRORS = "NO_BUFFER_SPACE|ADDRESS_IN_USE|CONNECTION_(?:REFUSED|RESET|ABORTED|CLOSED)|EMPTY_RESPONSE";
/* texto do console */
const TRANSPORT_ERROR = new RegExp(`^Failed to load resource: net::ERR_(?:${SOCKET_ERRORS})$`);
/* request.failure().errorText */
const TRANSPORT_FAILURE = new RegExp(`^net::ERR_(?:${SOCKET_ERRORS})$`);

const noteNetwork = (testInfo, message) => {
    testInfo.annotations.push({ type: "rede", description: message });
    console.log(`rede: ${message}`);
};

/* Roda `navigate` e espera o load; se algum pedido falhou por transporte nesse meio-tempo,
   recarrega a página uma vez. */
async function loadClean(page, navigate) {
    const failed = [];
    const onFailed = (request) => {
        const error = (request.failure() || {}).errorText || "";
        if (TRANSPORT_FAILURE.test(error)) {
            failed.push(`${error} em ${request.url()}`);
        }
    };
    page.on("requestfailed", onFailed);
    try {
        await navigate();
        await page.waitForLoadState("load");
        if (failed.length) {
            noteNetwork(test.info(), `${failed.join("; ")} ao carregar ${page.url()}; página recarregada`);
            await page.reload();
        }
    } finally {
        page.off("requestfailed", onFailed);
    }
}

/* Pede o recurso de novo, fora da página, até 3 vezes; null se carregou, senão o motivo. */
async function refetch(request, url) {
    let reason = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await request.get(url, { failOnStatusCode: false, timeout: 10_000 });
            if (res.ok()) {
                return null;
            }
            return `HTTP ${res.status()}`;
        } catch (error) {
            reason = error.message.split("\n")[0];
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
    return reason;
}

const test = base.extend({
    /* Coleta pageerror e console.error durante o teste inteiro e falha no fim. O erro de
       transporte (TRANSPORT_ERROR) só conta se o recurso falhar de novo no fim do teste. */
    pageErrors: [
        async ({ page }, use, testInfo) => {
            const errors = [];
            const transport = new Map();
            page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
            page.on("console", (msg) => {
                if (msg.type() === "error") {
                    const { url, lineNumber } = msg.location();
                    const line = `console.error: ${msg.text()}${url ? ` (${url}:${lineNumber})` : ""}`;
                    if (url && TRANSPORT_ERROR.test(msg.text())) {
                        transport.set(url, line);
                    } else {
                        errors.push(line);
                    }
                }
            });
            await use(errors);
            for (const [url, line] of transport) {
                const reason = await refetch(page.request, url);
                if (reason) {
                    errors.push(`${line}; pedido de novo, falhou outra vez: ${reason}`);
                } else {
                    noteNetwork(testInfo, `${line}; carregou quando pedido de novo`);
                }
            }
            expect(errors, "sem pageerror nem console.error").toEqual([]);
        },
        { auto: true }
    ]
});

/* abre a página e espera o estado "pronto": load, fontes e (certificados) os cards */
async function open(page, path) {
    await loadClean(page, () => page.goto(path));
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
                            /* custom elements ainda não definidos quando o HTML termina de montar.
                               Este listener entra antes do script.js: o estado do tema é o que o
                               components.js deixou, antes de o script.js sincronizar */
                            document.addEventListener(
                                "DOMContentLoaded",
                                () => {
                                    const toggle = document.getElementById("theme-toggle");
                                    const meta = document.querySelector('meta[name="theme-color"]');
                                    window.__themeAtDCL = {
                                        theme: document.documentElement.getAttribute("data-theme"),
                                        color: meta && meta.getAttribute("content"),
                                        pressed: toggle && toggle.getAttribute("aria-pressed"),
                                        label: toggle && toggle.getAttribute("aria-label")
                                    };
                                    window.__undefinedAtDCL = [...document.querySelectorAll(":not(:defined)")].map(
                                        (el) => el.localName
                                    );
                                    window.__footersAtDCL = document.querySelectorAll("footer.site-footer").length;
                                    window.__headersAtDCL = document.querySelectorAll("header.site-header, #menu-overlay").length;
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
                            footersAtDCL: window.__footersAtDCL,
                            headersAtDCL: window.__headersAtDCL,
                            duplicateIds: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
                            anchorsWithoutTarget: anchors
                        };
                    });
                    expect(dom.undefinedAtDCL, "elementos :not(:defined) no DOMContentLoaded").toEqual([]);
                    /* o <site-header> e o <site-footer> (components.js) já montaram quando o script.js roda */
                    expect(dom.headersAtDCL, "header.site-header e #menu-overlay no DOMContentLoaded").toBe(2);
                    expect(dom.footersAtDCL, "footer.site-footer no DOMContentLoaded").toBe(1);
                    expect(dom.duplicateIds, "ids repetidos").toEqual([]);
                    expect(dom.anchorsWithoutTarget, 'a[href^="#"] sem alvo').toEqual([]);
                });

                test("tema: alterna data-theme, aria-pressed, localStorage e theme-color", async ({ page }) => {
                    const other = theme === "dark" ? "light" : "dark";
                    const html = page.locator("html");
                    const toggle = page.locator("#theme-toggle");
                    const meta = page.locator('meta[name="theme-color"]');

                    /* já certo no DOMContentLoaded, antes do script.js: tema, cor e botão */
                    expect(await page.evaluate(() => window.__themeAtDCL), "tema no DOMContentLoaded").toEqual({
                        theme,
                        color: THEME_COLOR[theme],
                        ...THEME_TOGGLE[theme]
                    });

                    await expect(html).toHaveAttribute("data-theme", theme);
                    await expect(toggle).toHaveAttribute("aria-pressed", THEME_TOGGLE[theme].pressed);
                    await expect(toggle).toHaveAttribute("aria-label", THEME_TOGGLE[theme].label);
                    await expect(meta).toHaveAttribute("content", THEME_COLOR[theme]);

                    await press(toggle, vp.touch);

                    await expect(html).toHaveAttribute("data-theme", other);
                    await expect(toggle).toHaveAttribute("aria-pressed", THEME_TOGGLE[other].pressed);
                    await expect(toggle).toHaveAttribute("aria-label", THEME_TOGGLE[other].label);
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
                    /* é o teste que mais carrega (3 páginas em poucos segundos, com prefetch e
                       pedidos cancelados no meio): o que mais pegava a falha de rede da máquina */
                    test("navegação: index → certificados → voltar", async ({ page }) => {
                        await loadClean(page, async () => {
                            if (vp.width <= MENU_MAX) {
                                await press(page.locator("#menu-toggle"), vp.touch);
                                await press(page.locator(".menu-nav a.menu-page"), vp.touch);
                            } else {
                                await page.locator('.site-nav a[href="certificados.html"]').click();
                            }
                            await expect(page).toHaveURL(/\/certificados\.html$/);
                        });
                        await expect(page.locator("#cert-grid > li").first()).toBeVisible();

                        await loadClean(page, () => page.goBack());
                        await expect(page).toHaveURL(/\/index\.html$/);
                        await expect(page.locator("#hero-title")).toBeVisible();
                    });
                }
            });
        }
    }
}

/* <site-header> (components.js): site-nav e menu-nav levam aos mesmos destinos, na mesma
   ordem, nas duas páginas. Só o topo se escreve diferente: "#inicio" na home e "index.html"
   nas outras (os dois abrem o index no topo), então "index.html#<hero>" conta como "index.html". */
test.describe("cabeçalho nas duas páginas", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("site-nav e menu-nav: mesmas URLs absolutas, na mesma ordem", async ({ page }) => {
        const found = [];
        for (const { name, path } of PAGES) {
            await open(page, path);
            found.push({
                name,
                ...(await page.evaluate(() => ({
                    hero: (document.querySelector("main > section[data-section]") || {}).id || null,
                    site: [...document.querySelectorAll(".site-nav a")].map((a) => a.href),
                    menu: [...document.querySelectorAll(".menu-nav a")].map((a) => a.href)
                })))
            });
        }
        const hero = found.find((f) => f.name === "index").hero;
        expect(hero, "id da primeira seção do index").toBeTruthy();
        const indexUrl = new URL("/index.html", page.url()).href;
        const top = (href) => (href === `${indexUrl}#${hero}` ? indexUrl : href);

        const [ref, ...others] = found;
        expect(ref.site.length, `links no site-nav de ${ref.name}`).toBeGreaterThan(0);
        expect(ref.menu.length, `links no menu-nav de ${ref.name}`).toBeGreaterThan(0);
        for (const other of others) {
            expect(other.site.map(top), `site-nav de ${other.name} × ${ref.name}`).toEqual(ref.site.map(top));
            expect(other.menu.map(top), `menu-nav de ${other.name} × ${ref.name}`).toEqual(ref.menu.map(top));
        }
    });
});

/* scene.js: a formação ativa (data-active-scene no canvas) é a da seção que cruza a faixa do
   meio da tela (de 42% a 58% da altura, o rootMargin do observer), também depois de redimensionar.
   O caso: de 1080 para 1440px de largura o layout dividido e o snap entram, o conteúdo acima das
   Recomendações cresce e, sem mudar a rolagem, a divisa Trajetória|Recomendações cai dentro da
   faixa: a Trajetória "entra" e vira a ativa. O snap então rola até o início das Recomendações, a
   Trajetória sai e as Recomendações, que nunca saíram da faixa, não avisam de novo: sem a
   conferência pela geometria (resize/scrollend), o Python da Trajetória ficava preso. */
test.describe("cena 3D: formação ativa depois de redimensionar", () => {
    const HEIGHT = 900;
    const FROM = 1080; /* abaixo de SPLIT_MIN: uma coluna, sem snap */
    const TO = 1440;
    test.use({ viewport: { width: TO, height: HEIGHT } });

    /* data-scene das seções que cruzam a faixa do meio, e a formação ativa */
    const sceneState = (page) =>
        page.evaluate(() => {
            const h = window.innerHeight;
            const middle = [...document.querySelectorAll("[data-scene]")]
                .filter((section) => {
                    const r = section.getBoundingClientRect();
                    return r.bottom > h * 0.42 && r.top < h * 0.58;
                })
                .map((section) => section.dataset.scene);
            return { active: document.getElementById("scene-canvas").dataset.activeScene, middle: middle.join("+") };
        });

    /* espera a rolagem parar (o snap anima) */
    const scrollSettled = async (page) => {
        let last = null;
        await expect
            .poll(
                async () => {
                    const y = await page.evaluate(() => Math.round(window.scrollY));
                    const same = y === last;
                    last = y;
                    return same;
                },
                { message: "a rolagem para", intervals: [300], timeout: 5_000 }
            )
            .toBe(true);
    };

    test("Recomendações: de 1080 para 1440px a formação não fica presa na Trajetória", async ({ page }) => {
        await page.addInitScript((key) => {
            try {
                localStorage.setItem(key, "light");
            } catch (e) {
                /* about:blank */
            }
        }, THEME_KEY);
        await open(page, "/index.html");
        const ready = await page.waitForFunction(() =>
            document.body.classList.contains("no-webgl") ||
            document.querySelector("#scene-canvas.is-on[data-active-scene]")
        , null, { timeout: 20_000 });
        test.skip(await ready.evaluate((v) => v === true), "sem WebGL: não há formação");

        const recs = page.locator("#recomendacoes");
        const recsScene = await recs.getAttribute("data-scene");
        const docTop = () => recs.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

        /* onde as Recomendações começam em 1440px; em 1080px, a rolagem que, de volta a 1440px,
           põe esse começo no meio da tela (dentro da faixa e mais perto do snap das Recomendações
           que do fim da Trajetória: é o caminho em que a Trajetória entra e sai da faixa) */
        const topWide = await docTop();
        await page.setViewportSize({ width: FROM, height: HEIGHT });
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), topWide - HEIGHT * 0.5);
        await expect.poll(() => sceneState(page), { message: `${FROM}px: nas Recomendações` }).toEqual({
            active: recsScene,
            middle: recsScene
        });

        await page.setViewportSize({ width: TO, height: HEIGHT });
        await scrollSettled(page);
        expect((await sceneState(page)).middle, `${TO}px: o snap para nas Recomendações`).toBe(recsScene);
        await expect
            .poll(async () => (await sceneState(page)).active, { message: "a formação ativa é a das Recomendações" })
            .toBe(recsScene);
    });
});
