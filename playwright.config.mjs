/* Testes no navegador — só desenvolvimento; o site não depende de nada daqui.

   npm test            smoke (tests/smoke.spec.mjs)
   npm run ab          comparação visual A/B (tools/ab.mjs liga AB=1 e roda tests/ab.spec.mjs)

   Variáveis:
     SITE_DIR   pasta servida (padrão "."; o A/B aponta para .ab/base na rodada da base)
     PORT       porta do servidor local (padrão 4391; a 4173 é do preview do dono)
     CI         no GitHub Actions: chromium do Playwright com WebGL por software
*/
import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const CI = Boolean(process.env.CI);
const AB = Boolean(process.env.AB);
const PORT = Number(process.env.PORT || 4391);
const SITE_DIR = resolve(process.env.SITE_DIR || ".");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

/* O mesmo http.server do `python -m http.server`, com dois ajustes para vários workers
   carregando páginas ao mesmo tempo no Windows:
   - fila de conexões 128 (a padrão, 5, dá ERR_CONNECTION_REFUSED aleatório);
   - HTTP/1.1 com keep-alive (o padrão HTTP/1.0 abre uma conexão por arquivo: milhares de
     sockets em TIME_WAIT a cada rodada e, de vez em quando, ERR_ADDRESS_IN_USE). */
const SERVER_PY = [
    "import http.server as s",
    "s.ThreadingHTTPServer.request_queue_size = 128",
    "H = type('H', (s.SimpleHTTPRequestHandler,), {'protocol_version': 'HTTP/1.1', " +
        `'__init__': lambda self, *a, **k: s.SimpleHTTPRequestHandler.__init__(self, *a, directory=r'${SITE_DIR}', **k)})`,
    `s.ThreadingHTTPServer(('127.0.0.1', ${PORT}), H).serve_forever()`
].join("; ");

export default defineConfig({
    testDir: "tests",
    testMatch: AB ? "ab.spec.mjs" : "smoke.spec.mjs",
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 2 : 0,
    workers: CI ? 2 : undefined,
    timeout: 60_000,
    reporter: AB
        ? [["list"], ["html", { outputFolder: ".ab/report", open: "never" }], ["json", { outputFile: ".ab/last-run.json" }]]
        : CI
            ? [["github"], ["list"], ["html", { open: "never" }]]
            : [["list"]],
    outputDir: AB ? ".ab/results" : "test-results",
    /* só o A/B grava snapshots */
    snapshotPathTemplate: ".ab/snapshots/{arg}{ext}",

    expect: {
        timeout: 10_000,
        toHaveScreenshot: {
            /* Nenhum pixel pode mudar de forma perceptível. threshold 0.01 (escala YIQ de 0 a 1)
               só absorve o arredondamento de 1 nível (1/255) que o raster por software solta em
               ~10-20 px do hero escuro em ~1 de cada 10 rodadas; uma mudança de cor de 3 níveis
               em cinza (ou ~8 só no azul) já conta. */
            maxDiffPixels: 0,
            threshold: 0.01,
            animations: "disabled",
            caret: "hide",
            scale: "css"
        }
    },

    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: CI ? "on-first-retry" : "retain-on-failure"
    },

    projects: [
        CI
            ? {
                name: "chromium",
                use: {
                    ...devices["Desktop Chrome"],
                    /* runner sem GPU: WebGL pelo SwiftShader, senão o three.js loga console.error */
                    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
                }
            }
            : {
                /* local: o Edge instalado, sem baixar navegador. No A/B, raster por software:
                   com GPU duas capturas seguidas da mesma página já saem diferentes (escala
                   das imagens); sem GPU saem idênticas byte a byte */
                name: "msedge",
                use: {
                    ...devices["Desktop Edge"],
                    channel: "msedge",
                    launchOptions: { args: AB ? ["--disable-gpu"] : [] }
                }
            }
    ],

    webServer: {
        command: `${PYTHON} -c "${SERVER_PY}"`,
        url: `http://127.0.0.1:${PORT}/index.html`,
        /* nunca reaproveita: a pasta servida muda entre as rodadas do A/B */
        reuseExistingServer: false,
        timeout: 20_000,
        /* o http.server loga cada requisição no stderr */
        stdout: "ignore",
        stderr: "ignore"
    }
});
