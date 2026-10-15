/* ============================================================
   Cena 3D — campo de partículas persistente entre as seções.
   Cada seção tem uma formação que remete a programação:
   00 </> (código) → 01 xícara de café (Java) → 02 janela de
   terminal (projetos) → 03 logo do Python → 04 rede neural
   (IA). As formas planas são amostradas de um canvas 2D; a rede
   neural é gerada por coordenadas. No desktop largo a formação
   fica no lado livre da tela, alternando com o texto das seções.
   Outras páginas declaram uma formação única no canvas
   (data-formation) presa a um bloco âncora (data-scene-anchor):
   em certificados.html, o capelo de formatura ao lado da introdução.
   Carrega Three.js via import map; sem WebGL, o site segue
   normalmente sobre o fundo CSS.
   ============================================================ */

(async () => {
    const canvas = document.getElementById("scene-canvas");
    if (!canvas) {
        return;
    }

    let THREE;
    try {
        THREE = await import("three");
    } catch (e) {
        document.body.classList.add("no-webgl");
        return;
    }

    /* ---------- Setup básico ---------- */

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: false,
            powerPreference: "high-performance"
        });
    } catch (e) {
        document.body.classList.add("no-webgl");
        return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmall = window.matchMedia("(max-width: 768px)").matches;
    /* HD (experimento): amostragem uniforme, mais pontos e profundidade de
       sólido extrudado. Com ?antigo na URL tudo volta ao comportamento
       anterior, para comparar ao vivo. */
    const HD = !new URLSearchParams(location.search).has("antigo");
    /* em telas estreitas as formações ficam atrás do texto: menos pontos e mais discretos */
    const COUNT = HD ? (isSmall ? 3600 : 14000) : (isSmall ? 2200 : 6500);
    const OPACITY_SCALE = isSmall ? 0.35 : 1;

    /* Layout dividido (mesma media query do style.css): o texto ocupa uma
       coluna e a formação vai para o lado livre, alternando por seção —
       cenas 0, 2 e 4 à direita; 1 e 3 à esquerda. */
    const splitQuery = window.matchMedia("(min-width: 1100px)");
    const narrowQuery = window.matchMedia("(max-width: 768px)");
    const SIDE = [1, -1, 1, -1, 1];
    const FREE_GAP = 40; /* px entre a coluna de texto e a formação */
    const FREE_EDGE = 28; /* px de folga na borda da janela */
    const FREE_OVERHANG = 160; /* px que a área livre pode avançar além do container */
    /* fora do layout dividido (tablet, só no hero): formação deslocada à direita */
    const SIDE_X = 13;
    const SHAPE_HALF_W = 13.5; /* meia largura da maior formação (rede neural) */
    const FOV = 42;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        FOV,
        window.innerWidth / window.innerHeight,
        0.1,
        140
    );
    camera.position.set(0, 0, 46);

    /* ---------- Formações ---------- */

    const rand = (min, max) => min + Math.random() * (max - min);

    /* Cede a vez à página entre as etapas pesadas (HD): a amostragem de
       cada forma vira uma tarefa curta, em vez de um bloco longo que trava
       a rolagem e a primeira pintura. Sem HD não divide nada. */
    const yieldToPage = () => {
        if (!HD) {
            return null;
        }
        if (window.scheduler && typeof window.scheduler.yield === "function") {
            return window.scheduler.yield();
        }
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    };

    /* Desenha o símbolo num canvas 2D s×s e devolve os pixels (RGBA) */
    const rasterize = (draw, s) => {
        const cv = document.createElement("canvas");
        cv.width = s;
        cv.height = s;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#fff";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        draw(ctx, s / 100);
        return ctx.getImageData(0, 0, s, s).data;
    };

    /* Embaralha (Fisher-Yates) n candidatos guardados em três arrays */
    const shuffle3 = (xs, ys, zs, n) => {
        for (let i = n - 1; i > 0; i -= 1) {
            const j = (Math.random() * (i + 1)) | 0;
            let t = xs[i];
            xs[i] = xs[j];
            xs[j] = t;
            t = ys[i];
            ys[i] = ys[j];
            ys[j] = t;
            t = zs[i];
            zs[i] = zs[j];
            zs[j] = t;
        }
    };

    /* Grade de hash 3D para o dart throwing: célula ≥ r, então basta olhar
       as 27 células vizinhas (célula maior que r continua correta; o piso
       limita o tamanho da grade). head[célula] → último aceito nela. */
    const makeGrid = (r, s, zMin, zRange) => {
        const cell = Math.max(r, Math.cbrt((s * s * Math.max(zRange, 1)) / 4e6));
        const gw = Math.ceil(s / cell) + 2;
        const gz = zRange > 0 ? Math.ceil(zRange / cell) + 2 : 1;
        return { cell, gw, gz, zMin, head: new Int32Array(gw * gw * gz).fill(-1) };
    };

    /* Dart throwing (Poisson-disk): percorre os candidatos já embaralhados e
       aceita um só se nenhum aceito estiver a menos de r (distância em x/y/z,
       em px do canvas). Continua a partir de got aceitos (out/next/grade
       compartilhados entre passadas) e para ao chegar em limit. */
    const dartThrow = (xs, ys, zs, n, r, grid, out, next, got, limit) => {
        const { cell, gw, gz, zMin, head } = grid;
        const r2 = r * r;
        for (let c = 0; c < n && got < limit; c += 1) {
            const x = xs[c];
            const y = ys[c];
            const z = zs[c];
            const gx = (x / cell) | 0;
            const gy = (y / cell) | 0;
            const gzc = ((z - zMin) / cell) | 0;
            let free = true;
            for (let cy = Math.max(0, gy - 1); free && cy <= gy + 1 && cy < gw; cy += 1) {
                for (let cx = Math.max(0, gx - 1); free && cx <= gx + 1 && cx < gw; cx += 1) {
                    for (let cz = Math.max(0, gzc - 1); free && cz <= gzc + 1 && cz < gz; cz += 1) {
                        for (let p = head[(cy * gw + cx) * gz + cz]; p !== -1; p = next[p]) {
                            const a = out[p];
                            const dx = xs[a] - x;
                            const dy = ys[a] - y;
                            const dz = zs[a] - z;
                            if (dx * dx + dy * dy + dz * dz < r2) {
                                free = false;
                                break;
                            }
                        }
                    }
                }
            }
            if (!free) {
                continue;
            }
            const h = (gy * gw + gx) * gz + gzc;
            out[got] = c;
            next[got] = head[h];
            head[h] = got;
            got += 1;
        }
        return got;
    };

    /* Escolhe exatamente want candidatos bem espaçados (blue noise). O raio
       parte da estimativa pela área (com ~8 candidatos por ponto, o dart
       throwing fecha em ~1,6–1,8·r² por ponto), folgada para a 1ª passada
       ficar logo abaixo de want; a falta é completada numa passada com raio
       menor (pontos ∝ 1/r²) na mesma grade, que só acha lugar nos vãos
       maiores e para ao chegar em want. Se a 1ª passada estourar o teto, o
       raio cresce e recomeça; o excedente (até 3%) é aparado ao acaso. */
    const blueNoise = (xs, ys, zs, n, want, area, s, zMin, zRange) => {
        const out = new Int32Array(Math.max(n, want));
        if (want <= 0 || n === 0) {
            return out;
        }
        const next = new Int32Array(n);
        const cap = Math.floor(want * 1.03) + 1;
        let r = Math.sqrt(area / (1.65 * want));
        let grid = null;
        let got = 0;
        for (let tries = 0; tries < 5; tries += 1) {
            grid = makeGrid(r, s, zMin, zRange);
            got = dartThrow(xs, ys, zs, n, r, grid, out, next, 0, cap);
            if (got < cap) {
                break;
            }
            r *= 1.06;
        }
        for (let k = 0; got < want && k < 8; k += 1) {
            r *= k === 0 ? Math.sqrt(got / want) * 0.96 : 0.93;
            got = dartThrow(xs, ys, zs, n, r, grid, out, next, got, want);
        }
        if (got > want) {
            /* apara: sorteia want dos aceitos (Fisher-Yates parcial) */
            for (let i = 0; i < want; i += 1) {
                const j = i + ((Math.random() * (got - i)) | 0);
                const t = out[i];
                out[i] = out[j];
                out[j] = t;
            }
        }
        for (let i = got; i < want; i += 1) {
            out[i] = (Math.random() * n) | 0;
        }
        return out;
    };

    /* Versão HD do sampleShape: canvas de 720 (480 no celular, que tem
       menos pontos e CPU mais lenta) e pontos uniformes. O miolo
       fica numa camada fina perto de z = 0 e o contorno (faixa fina na
       borda) vira as paredes laterais de um sólido extrudado fino — o
       balanço mostra volume sem borrão nem imagem dupla. */
    const HD_CORE = 0.3; /* espessura do miolo, em unidades do mundo */
    /* fração da profundidade ocupada pelas paredes: fina o bastante para o
       balanço mostrar a borda acesa (volume) sem franja de pontos ao lado */
    const HD_WALL = 0.3;
    const sampleShapeHD = (draw, extent, depth, count, edge) => {
        const s = isSmall ? 480 : 720;
        const data = rasterize(draw, s);
        const R = 2; /* espessura do contorno, em px do canvas (bem mais fina que os 3 px do de 360) */
        /* máscara com margem R: vizinhos fora do canvas contam como vazios */
        const W = s + 2 * R;
        const mask = new Uint8Array(W * W);
        let n = 0;
        for (let y = 0; y < s; y += 1) {
            for (let x = 0; x < s; x += 1) {
                if (data[(y * s + x) * 4 + 3] > 40) {
                    mask[(y + R) * W + x + R] = 1;
                    n += 1;
                }
            }
        }
        if (n === 0) {
            return null;
        }
        const xs = new Float32Array(n);
        const ys = new Float32Array(n);
        const zs = new Float32Array(n);
        const borders = new Int32Array(n);
        let nb = 0;
        let i = 0;
        for (let y = 0; y < s; y += 1) {
            for (let x = 0; x < s; x += 1) {
                const m = (y + R) * W + x + R;
                if (!mask[m]) {
                    continue;
                }
                xs[i] = x + Math.random();
                ys[i] = y + Math.random();
                i += 1;
                if (edge > 0 && (!mask[m - R] || !mask[m + R] || !mask[m - R * W] || !mask[m + R * W])) {
                    borders[nb] = y * s + x;
                    nb += 1;
                }
            }
        }
        const ne = nb > 0 ? Math.round(count * edge) : 0;
        const ni = count - ne;
        const pts = new Float32Array(count * 3);
        const toWorld = (px, py, pz, pick, want, offset, zOf) => {
            for (let q = 0; q < want; q += 1) {
                const c = pick[q];
                const o = (offset + q) * 3;
                pts[o] = (px[c] / s - 0.5) * extent;
                pts[o + 1] = (0.5 - py[c] / s) * extent;
                pts[o + 2] = zOf(pz[c]);
            }
        };

        /* miolo: escolha em 2D (z = 0), depois espalhado na camada fina.
           Embaralhados, os primeiros 8 candidatos por ponto já são uma
           amostra uniforme — basta para o dart throwing quase saturar */
        shuffle3(xs, ys, zs, n);
        const core = Math.min(HD_CORE, depth);
        toWorld(xs, ys, zs, blueNoise(xs, ys, zs, Math.min(n, ni * 8), ni, n, s, 0, 0), ni, 0, () => (Math.random() - 0.5) * core);

        /* contorno: candidatos em várias alturas z por pixel da borda, e o
           blue noise em 3D distribui por igual na "parede" (borda × espessura) */
        if (ne > 0) {
            const dpx = ((depth * HD_WALL) / extent) * s;
            const perPx = Math.min(24, Math.max(4, Math.ceil((8 * ne) / nb)));
            const m = nb * perPx;
            const bx = new Float32Array(m);
            const by = new Float32Array(m);
            const bz = new Float32Array(m);
            for (let k = 0; k < m; k += 1) {
                const b = borders[(k / perPx) | 0];
                bx[k] = (b % s) + Math.random();
                by[k] = ((b / s) | 0) + Math.random();
                bz[k] = (Math.random() - 0.5) * dpx;
            }
            shuffle3(bx, by, bz, m);
            /* a faixa da borda tem espessura (R px + jitter), então a parede
               comporta ~25% mais pontos que uma superfície de mesma área */
            const pick = blueNoise(bx, by, bz, m, ne, (nb / R) * dpx * 1.25, s, -dpx / 2, dpx);
            toWorld(bx, by, bz, pick, ne, ni, (z) => (z / s) * extent);
        }
        return pts;
    };

    /* Desenha um símbolo num canvas 2D e vira nuvem de pontos (x/y do
       pixel, z com pequena profundidade). Coordenadas em % do canvas.
       edge: fração dos pontos reservada ao contorno — formas cheias
       (xícara, Python) ganham silhueta, vãos e olhos nítidos. */
    const sampleShape = (draw, extent, depth = 3, count = COUNT, edge = 0) => {
        if (HD) {
            const hd = sampleShapeHD(draw, extent, depth, count, edge);
            if (hd) {
                return hd;
            }
        }
        const s = 360;
        const data = rasterize(draw, s);

        const filled = (x, y) => x >= 0 && y >= 0 && x < s && y < s && data[(y * s + x) * 4 + 3] > 40;
        const candidates = [];
        const borders = [];
        const R = 3; /* espessura do contorno, em px do canvas */
        for (let y = 0; y < s; y += 1) {
            for (let x = 0; x < s; x += 1) {
                if (!filled(x, y)) {
                    continue;
                }
                candidates.push(x, y);
                if (edge > 0 && (!filled(x - R, y) || !filled(x + R, y) || !filled(x, y - R) || !filled(x, y + R))) {
                    borders.push(x, y);
                }
            }
        }

        const pts = new Float32Array(count * 3);
        const n = candidates.length / 2;
        const nb = borders.length / 2;
        for (let k = 0; k < count; k += 1) {
            if (n === 0) {
                /* fallback improvável (ex.: canvas indisponível): esfera */
                const a = Math.random() * Math.PI * 2;
                const b = Math.acos(rand(-1, 1));
                pts[k * 3] = 12 * Math.sin(b) * Math.cos(a);
                pts[k * 3 + 1] = 12 * Math.cos(b);
                pts[k * 3 + 2] = 12 * Math.sin(b) * Math.sin(a);
                continue;
            }
            const fromBorder = nb > 0 && Math.random() < edge;
            const src = fromBorder ? borders : candidates;
            const j = (Math.random() * (fromBorder ? nb : n)) | 0;
            pts[k * 3] = ((src[j * 2] + Math.random()) / s - 0.5) * extent;
            pts[k * 3 + 1] = (0.5 - (src[j * 2 + 1] + Math.random()) / s) * extent;
            pts[k * 3 + 2] = (Math.random() - 0.5) * depth;
        }
        return pts;
    };

    /* 00 — código: </> em traços (não depende de fonte carregada) */
    const drawCode = (ctx, u) => {
        ctx.lineWidth = 6.5 * u;
        ctx.beginPath();
        ctx.moveTo(29 * u, 32 * u);
        ctx.lineTo(11 * u, 50 * u);
        ctx.lineTo(29 * u, 68 * u);
        ctx.moveTo(57 * u, 26 * u);
        ctx.lineTo(43 * u, 74 * u);
        ctx.moveTo(71 * u, 32 * u);
        ctx.lineTo(89 * u, 50 * u);
        ctx.lineTo(71 * u, 68 * u);
        ctx.stroke();
    };

    /* 01 — Java: xícara de café — corpo afunilado com fundo arredondado,
       alça em anel, pires achatado e três fios de vapor em S */
    const drawCup = (ctx, u) => {
        /* pires */
        ctx.beginPath();
        ctx.ellipse(46 * u, 82 * u, 31 * u, 4.6 * u, 0, 0, Math.PI * 2);
        ctx.fill();

        /* corpo: mais largo em cima, base arredondada */
        ctx.beginPath();
        ctx.moveTo(22 * u, 42 * u);
        ctx.lineTo(70 * u, 42 * u);
        ctx.lineTo(65 * u, 64 * u);
        ctx.quadraticCurveTo(62 * u, 77 * u, 50 * u, 77 * u);
        ctx.lineTo(42 * u, 77 * u);
        ctx.quadraticCurveTo(30 * u, 77 * u, 27 * u, 64 * u);
        ctx.closePath();
        ctx.fill();

        /* alça: anel com vão, encostado na lateral direita */
        ctx.lineWidth = 4.6 * u;
        ctx.beginPath();
        ctx.arc(68 * u, 56 * u, 8.5 * u, -Math.PI / 2.1, Math.PI / 2.1);
        ctx.stroke();

        /* frisos que separam a borda e o pires do corpo */
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.moveTo(18 * u, 47 * u);
        ctx.lineTo(74 * u, 47 * u);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(14 * u, 78.6 * u);
        ctx.lineTo(78 * u, 78.6 * u);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";

        /* vapor: três S finos, o do meio mais alto */
        ctx.lineWidth = 2.6 * u;
        [[34, 21], [46, 28], [58, 21]].forEach(([sx, hgt]) => {
            const y0 = 37;
            ctx.beginPath();
            ctx.moveTo(sx * u, y0 * u);
            ctx.bezierCurveTo(
                (sx - 7) * u, (y0 - hgt * 0.35) * u,
                (sx + 7) * u, (y0 - hgt * 0.62) * u,
                sx * u, (y0 - hgt) * u
            );
            ctx.stroke();
        });
    };

    /* 02 — Projetos: janela de terminal — contorno de cantos arredondados
       (4:3), barra de título com 3 bolinhas, prompt ">_" grande e duas
       linhas curtas de "saída" abaixo dele. Traços finos, como na xícara. */
    const drawTerminal = (ctx, u) => {
        const [x0, y0, x1, y1] = [8, 18, 92, 81];

        /* moldura */
        ctx.lineWidth = 2.6 * u;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x0 * u, y0 * u, (x1 - x0) * u, (y1 - y0) * u, 5 * u);
        } else {
            ctx.rect(x0 * u, y0 * u, (x1 - x0) * u, (y1 - y0) * u);
        }
        /* linha que separa a barra de título */
        ctx.moveTo(x0 * u, 29 * u);
        ctx.lineTo(x1 * u, 29 * u);
        ctx.stroke();

        /* bolinhas da barra de título (como no macOS) */
        [15, 21.5, 28].forEach((cx) => {
            ctx.beginPath();
            ctx.arc(cx * u, 23.5 * u, 2.1 * u, 0, Math.PI * 2);
            ctx.fill();
        });

        /* prompt ">_" */
        ctx.lineWidth = 4.2 * u;
        ctx.beginPath();
        ctx.moveTo(18 * u, 40 * u);
        ctx.lineTo(28 * u, 49 * u);
        ctx.lineTo(18 * u, 58 * u);
        ctx.moveTo(34 * u, 58 * u);
        ctx.lineTo(48 * u, 58 * u);
        ctx.stroke();

        /* saída discreta: duas linhas curtas de "texto" */
        ctx.lineWidth = 1.9 * u;
        ctx.beginPath();
        ctx.moveTo(18 * u, 67.5 * u);
        ctx.lineTo(60 * u, 67.5 * u);
        ctx.moveTo(18 * u, 73.5 * u);
        ctx.lineTo(44 * u, 73.5 * u);
        ctx.stroke();
    };

    /* 03 — Python: logo oficial (simple-icons, CC0, viewBox 24×24).
       O path tem 4 subpaths: cobra 1, olho 1, cobra 2, olho 2. Cada cobra
       é amostrada à parte para a formação ficar bicolor; os olhos (com
       moveto relativo convertido para absoluto) são recortados. */
    const PY_D = "M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z";
    const [pySnakeA, pyEyeA, pySnakeB, pyEyeB] = PY_D.split("z");
    /* troca o "m dx dy" inicial do subpath por um moveto absoluto */
    const absMove = (sub, x, y) => `M${x} ${y}${sub.slice(sub.indexOf("l"))}z`;
    const PY_TOP = `${pySnakeA}z`; /* já começa com M absoluto */
    const PY_BOTTOM = absMove(pySnakeB, 21.04, 6.11);
    const PY_EYES = absMove(pyEyeA, 7.95, 2.16) + absMove(pyEyeB, 14.57, 20.36);

    const drawPySnake = (d) => (ctx, u) => {
        const k = (84 * u) / 24;
        ctx.save();
        ctx.translate(8 * u, 8 * u);
        ctx.scale(k, k);
        ctx.fill(new Path2D(d));
        /* olhos: recorte um pouco maior que o original para ler bem em pontos */
        const eyes = new Path2D(PY_EYES);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fill(eyes);
        ctx.lineWidth = 0.55;
        ctx.stroke(eyes);
        ctx.restore();
    };

    const drawPyTop = drawPySnake(PY_TOP);
    const drawPyBottom = drawPySnake(PY_BOTTOM);

    /* 04 — IA: rede neural (camadas de nós + pontos ao longo das conexões) */
    const makeNetwork = () => {
        const layers = [
            { x: -13.5, ys: [-7.5, 0, 7.5] },
            { x: -4.5, ys: [-10, -5, 0, 5, 10] },
            { x: 4.5, ys: [-10, -5, 0, 5, 10] },
            { x: 13.5, ys: [-6, 0, 6] }
        ];
        const nodes = [];
        layers.forEach((layer, li) => {
            layer.ys.forEach((y) => {
                nodes.push({ x: layer.x, y, z: rand(-0.6, 0.6), layer: li });
            });
        });
        const edges = [];
        nodes.forEach((a) => {
            nodes.forEach((b) => {
                if (b.layer === a.layer + 1) {
                    edges.push([a, b]);
                }
            });
        });

        const pts = new Float32Array(COUNT * 3);
        let i = 0;
        const put = (x, y, z) => {
            pts[i * 3] = x;
            pts[i * 3 + 1] = y;
            pts[i * 3 + 2] = z;
            i += 1;
        };

        /* nós densos (esferas) e conexões finas: lê bem mesmo com opacidade baixa */
        const perNode = Math.floor((COUNT * 0.45) / nodes.length);
        if (HD) {
            /* HD: cada nó é uma bola em cascas concêntricas (pontos por casca
               ∝ volume dela), cada casca uma esfera de Fibonacci com eixo e
               giro sorteados; as conexões recebem pontos em passos regulares,
               em número proporcional ao comprimento visível (fora dos nós) */
            const NODE_R = 1.05;
            const GOLDEN = Math.PI * (3 - Math.sqrt(5));
            const shells = Math.max(2, Math.round(Math.cbrt(perNode) / 1.6));
            nodes.forEach((node) => {
                let done = 0;
                for (let j = 0; j < shells; j += 1) {
                    const share = ((j + 1) ** 3 - j ** 3) / shells ** 3;
                    const c = j === shells - 1 ? perNode - done : Math.round(perNode * share);
                    const spin = Math.random() * Math.PI * 2;
                    const axis = (Math.random() * 3) | 0;
                    for (let k = 0; k < c; k += 1) {
                        const v = 1 - (2 * (k + 0.5)) / c;
                        const ring = Math.sqrt(1 - v * v);
                        const a = spin + k * GOLDEN;
                        /* raio uniforme no volume da casca */
                        const r = (NODE_R / shells) * Math.cbrt(j ** 3 + Math.random() * ((j + 1) ** 3 - j ** 3));
                        const d = [ring * Math.cos(a), v, ring * Math.sin(a)];
                        put(
                            node.x + r * d[axis],
                            node.y + r * d[(axis + 1) % 3],
                            node.z + r * d[(axis + 2) % 3]
                        );
                    }
                    done += c;
                }
            });

            const spans = edges.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
            const visible = spans.map((len) => Math.max(0.01, len - 2 * NODE_R));
            const total = visible.reduce((sum, v) => sum + v, 0);
            const left = COUNT - i;
            /* cotas por comprimento; a sobra do arredondamento vai para as
               conexões com a maior parte fracionária */
            const quotas = visible.map((v) => (left * v) / total);
            const counts = quotas.map(Math.floor);
            let rest = left - counts.reduce((sum, v) => sum + v, 0);
            quotas
                .map((q, e) => [q - Math.floor(q), e])
                .sort((p, q) => q[0] - p[0])
                .forEach(([, e]) => {
                    if (rest > 0) {
                        counts[e] += 1;
                        rest -= 1;
                    }
                });
            edges.forEach(([a, b], e) => {
                const n = counts[e];
                const t0 = Math.min(0.5, NODE_R / spans[e]);
                for (let k = 0; k < n; k += 1) {
                    const t = t0 + (1 - 2 * t0) * ((k + 0.5 + rand(-0.15, 0.15)) / n);
                    put(
                        a.x + (b.x - a.x) * t + rand(-0.03, 0.03),
                        a.y + (b.y - a.y) * t + rand(-0.03, 0.03),
                        a.z + (b.z - a.z) * t + rand(-0.03, 0.03)
                    );
                }
            });
            return pts;
        }
        nodes.forEach((node) => {
            for (let k = 0; k < perNode; k += 1) {
                const r = 1.05 * Math.cbrt(Math.random());
                const a = Math.random() * Math.PI * 2;
                const b = Math.acos(rand(-1, 1));
                put(
                    node.x + r * Math.sin(b) * Math.cos(a),
                    node.y + r * Math.cos(b),
                    node.z + r * Math.sin(b) * Math.sin(a)
                );
            }
        });

        while (i < COUNT) {
            const [a, b] = edges[(Math.random() * edges.length) | 0];
            const t = Math.random();
            put(
                a.x + (b.x - a.x) * t + rand(-0.1, 0.1),
                a.y + (b.y - a.y) * t + rand(-0.1, 0.1),
                a.z + (b.z - a.z) * t + rand(-0.1, 0.1)
            );
        }
        return pts;
    };

    /* Certificados: capelo de formatura — tampo em losango achatado (o
       quadrado visto de cima, em leve perspectiva) com espessura na borda
       da frente, copa arredondada abaixo dele, botão no centro e a borla
       pendendo pelo lado direito. Cordão, botão e frisos são recortados
       do tampo cheio para lerem em pontos. */
    const drawGradCap = (ctx, u) => {
        /* copa: faixa que encaixa na cabeça, base arredondada (o topo fica sob o tampo) */
        ctx.beginPath();
        ctx.moveTo(28 * u, 46 * u);
        ctx.lineTo(29.5 * u, 66 * u);
        ctx.quadraticCurveTo(50 * u, 76 * u, 70.5 * u, 66 * u);
        ctx.lineTo(72 * u, 46 * u);
        ctx.closePath();
        ctx.fill();

        /* tampo + espessura: losango com as duas arestas da frente "engrossadas" */
        ctx.beginPath();
        ctx.moveTo(10 * u, 40 * u);
        ctx.lineTo(50 * u, 25 * u);
        ctx.lineTo(90 * u, 40 * u);
        ctx.lineTo(90 * u, 43 * u);
        ctx.lineTo(50 * u, 58 * u);
        ctx.lineTo(10 * u, 43 * u);
        ctx.closePath();
        ctx.fill();

        ctx.globalCompositeOperation = "destination-out";

        /* frisos: face de cima × espessura, e espessura × copa */
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.moveTo(10 * u, 40 * u);
        ctx.lineTo(50 * u, 55 * u);
        ctx.lineTo(90 * u, 40 * u);
        ctx.stroke();
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.moveTo(10 * u, 43 * u);
        ctx.lineTo(50 * u, 58 * u);
        ctx.lineTo(90 * u, 43 * u);
        ctx.stroke();

        /* folga em volta do cordão (sobre o tampo) e do botão */
        ctx.lineWidth = 5 * u;
        ctx.beginPath();
        ctx.moveTo(50 * u, 40 * u);
        ctx.lineTo(78 * u, 44.5 * u);
        ctx.lineTo(78 * u, 50 * u);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(50 * u, 40 * u, 3.8 * u, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";

        /* cordão: do botão até a aresta da frente e caindo pelo lado */
        ctx.lineWidth = 1.8 * u;
        ctx.beginPath();
        ctx.moveTo(50 * u, 40 * u);
        ctx.lineTo(78 * u, 44.5 * u);
        ctx.lineTo(78 * u, 63 * u);
        ctx.stroke();

        /* botão */
        ctx.beginPath();
        ctx.arc(50 * u, 40 * u, 2.2 * u, 0, Math.PI * 2);
        ctx.fill();

        /* borla: nó e franja que abre para baixo */
        ctx.beginPath();
        ctx.arc(78 * u, 63 * u, 2 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(76.2 * u, 64 * u);
        ctx.lineTo(79.8 * u, 64 * u);
        ctx.lineTo(82.5 * u, 77 * u);
        ctx.lineTo(73.5 * u, 77 * u);
        ctx.closePath();
        ctx.fill();
    };

    /* A formação do Python é bicolor: primeira metade dos pontos é a
       cobra azul (cima), segunda metade a dourada (baixo).
       HD: o contorno fino já recorta a silhueta com menos pontos; o resto
       vai para o miolo (fração de contorno menor que a de antes) */
    const PY_SPLIT = Math.floor(COUNT / 2);
    const PY_EDGE = HD ? 0.3 : 0.45;
    const makePython = async () => {
        const pts = new Float32Array(COUNT * 3);
        pts.set(sampleShape(drawPyTop, 28, 2, PY_SPLIT, PY_EDGE), 0);
        await yieldToPage();
        pts.set(sampleShape(drawPyBottom, 28, 2, COUNT - PY_SPLIT, PY_EDGE), PY_SPLIT * 3);
        return pts;
    };

    /* Centraliza a nuvem na origem (pelo retângulo envolvente) e devolve a
       meia largura/altura — usadas para a formação caber no lado livre. */
    const centerCloud = (pts) => {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < pts.length; i += 3) {
            minX = Math.min(minX, pts[i]);
            maxX = Math.max(maxX, pts[i]);
            minY = Math.min(minY, pts[i + 1]);
            maxY = Math.max(maxY, pts[i + 1]);
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        for (let i = 0; i < pts.length; i += 3) {
            pts[i] -= cx;
            pts[i + 1] -= cy;
        }
        return { hw: (maxX - minX) / 2, hh: (maxY - minY) / 2 };
    };

    /* Páginas de formação única: o canvas declara qual (data-formation) e
       a formação acompanha o bloco marcado com data-scene-anchor. Sem
       data-formation (index), valem as 5 formações por seção. */
    const SOLO_PAGES = {
        cap: {
            make: () => sampleShape(drawGradCap, 30, 3, COUNT, HD ? 0.22 : 0.3),
            config: { rotX: -0.06, camZ: 44, amp: 0.18, speed: 0.45 }
        }
    };
    const solo = SOLO_PAGES[canvas.dataset.formation] || null;
    const anchorEl = solo ? document.querySelector("[data-scene-anchor]") : null;

    /* formações centradas na origem; o deslocamento lateral é aplicado no loop.
       HD: as formas de traço (código, terminal) também ganham contorno, para
       o balanço mostrar a espessura delas; nas cheias o contorno fino pede
       uma fração menor que a de antes. Geradas uma a uma, cedendo a vez à
       página entre elas (mesma ordem de antes) */
    const builders = solo
        ? [solo.make]
        : [
            () => sampleShape(drawCode, 30, 3, COUNT, HD ? 0.15 : 0),
            () => sampleShape(drawCup, 30, 3, COUNT, HD ? 0.22 : 0.3),
            () => sampleShape(drawTerminal, 30, 2.4, COUNT, HD ? 0.15 : 0),
            makePython,
            makeNetwork
        ];
    const formations = [];
    for (let k = 0; k < builders.length; k += 1) {
        await yieldToPage();
        formations.push(await builders[k]());
    }
    /* e mais uma vez antes da montagem da cena e do primeiro quadro */
    await yieldToPage();
    const extents = formations.map(centerCloud);

    /* Comportamento por seção: inclinação, distância e balanço.
       Os símbolos oscilam em vez de girar para seguirem legíveis. */
    const configs = solo
        ? [solo.config]
        : [
            { rotX: -0.05, camZ: 42, amp: 0.2, speed: 0.5 },
            { rotX: -0.07, camZ: 44, amp: 0.2, speed: 0.45 },
            { rotX: -0.06, camZ: 44, amp: 0.2, speed: 0.5 },
            { rotX: -0.03, camZ: 43, amp: 0.1, speed: 0.42 },
            { rotX: -0.06, camZ: 42, amp: 0.15, speed: 0.38 }
        ];

    /* posição (x no mundo) e escala de cada formação; recalculadas no resize */
    const layout = formations.map(() => ({ x: 0, s: 1 }));
    let split = false;
    /* formação única: deslocamento vertical (mundo) que a mantém na altura
       do bloco âncora enquanto ele rola; no index fica sempre 0 */
    let anchorY = 0;
    let anchorVisible = true;

    /* ---------- Geometria e material ---------- */

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const mixes = new Float32Array(COUNT);

    /* HD: com a distribuição uniforme não há mais aglomerados acendendo
       por acaso; 5% dos pontos puxam para a cor clara (faíscas esparsas)
       para a forma não ficar chapada */
    const SPARK = HD ? 0.05 : 0;
    for (let i = 0; i < COUNT; i += 1) {
        mixes[i] = SPARK > 0 && Math.random() < SPARK ? rand(0.7, 1) : Math.pow(Math.random(), 1.6);
        /* nasce como nuvem dispersa e converge para a primeira formação */
        positions[i * 3] = rand(-60, 60);
        positions[i * 3 + 1] = rand(-45, 45);
        positions[i * 3 + 2] = rand(-50, 30);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    /* tinta (tema claro): miolo mais cheio e borda curta, para a mancha
       multiplicar sobre o papel sem virar névoa.
       HD: pontos menores e mais juntos pedem sprites mais duros — no escuro,
       miolo sólido com queda curta (cada ponto lê como ponto, não névoa); no
       claro, a tinta encurta a borda */
    const makeSprite = (ink) => {
        const size = 64;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        if (HD && ink) {
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
            grad.addColorStop(0.68, "rgba(255,255,255,0.25)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
        } else if (HD) {
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(0.28, "rgba(255,255,255,1)");
            grad.addColorStop(0.58, "rgba(255,255,255,0)");
        } else if (ink) {
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(0.55, "rgba(255,255,255,0.9)");
            grad.addColorStop(0.8, "rgba(255,255,255,0.25)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
        } else {
            grad.addColorStop(0, "rgba(255,255,255,1)");
            grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const texture = new THREE.CanvasTexture(c);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };

    /* um sprite por tema, criados uma única vez (o applyTheme só troca o map) */
    const sprites = {
        dark: makeSprite(false),
        light: makeSprite(true)
    };

    const material = new THREE.PointsMaterial({
        size: isSmall ? 0.3 : 0.32,
        map: sprites.dark,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true
    });

    /* o grupo gira e escala em torno do centro da formação (pivô em x):
       group.position.x = pivô e points.position.x = −pivô */
    const points = new THREE.Points(geometry, material);
    const group = new THREE.Group();
    group.add(points);
    scene.add(group);

    /* ---------- Tema ---------- */

    let activeIndex = 0;
    let target = formations[0];

    const THEMES = {
        dark: {
            primary: new THREE.Color("#5f8aff"),
            secondary: new THREE.Color("#dfe8ff"),
            gold: new THREE.Color("#f6c454"),
            goldSoft: new THREE.Color("#fff0c4"),
            fog: new THREE.Color("#060b16"),
            fogNear: 36,
            fogFar: 86,
            /* HD: o sprite duro concentra a luz no miolo do ponto — opacidade
               um pouco maior que a de antes deixa cada ponto mais vivo, e os
               nós e cruzamentos da rede ainda não estouram em branco */
            opacity: HD ? 0.44 : 0.4,
            size: HD ? (isSmall ? 0.29 : 0.3) : (isSmall ? 0.3 : 0.32),
            blending: THREE.AdditiveBlending
        },
        /* no claro os pontos são "tinta" sobre papel: cores escuras e névoa
           afastada, senão a forma vira um borrão cinza. O efeito de multiplicar
           vem do mix-blend-mode do canvas (CSS): MultiplyBlending do WebGL não
           funciona com canvas alpha:true, por isso segue NormalBlending.
           Com multiply a opacidade pode ser menor (0.78) */
        light: {
            primary: new THREE.Color("#1446c4"),
            secondary: new THREE.Color("#0a1d4f"),
            gold: new THREE.Color("#b4720b"),
            goldSoft: new THREE.Color("#7f5006"),
            fog: new THREE.Color("#edf2f8"),
            fogNear: 60,
            fogFar: 150,
            /* HD: pontos menores (não empastam onde a forma é densa) e
               opacidade abaixo da de antes, com mais pontos somando tinta */
            opacity: HD ? 0.7 : 0.78,
            size: HD ? 0.23 : (isSmall ? 0.26 : 0.28),
            blending: THREE.NormalBlending
        }
    };

    scene.fog = new THREE.Fog(THEMES.dark.fog, THEMES.dark.fogNear, THEMES.dark.fogFar);

    const applyTheme = (name) => {
        const theme = THEMES[name] || THEMES.dark;
        const colorAttr = geometry.getAttribute("color");
        const mixed = new THREE.Color();
        /* na formação do Python, a segunda metade dos pontos fica dourada */
        const bicolor = activeIndex === 3;
        for (let i = 0; i < COUNT; i += 1) {
            const gold = bicolor && i >= PY_SPLIT;
            mixed
                .copy(gold ? theme.gold : theme.primary)
                .lerp(gold ? theme.goldSoft : theme.secondary, mixes[i]);
            colorAttr.setXYZ(i, mixed.r, mixed.g, mixed.b);
        }
        colorAttr.needsUpdate = true;
        material.opacity = theme.opacity * OPACITY_SCALE;
        material.blending = theme.blending;
        material.size = theme.size;
        material.map = theme === THEMES.light ? sprites.light : sprites.dark;
        material.needsUpdate = true;
        scene.fog.color.copy(theme.fog);
        scene.fog.near = theme.fogNear;
        scene.fog.far = theme.fogFar;
    };

    const currentTheme = () =>
        document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

    applyTheme(currentTheme());
    window.addEventListener("hf:theme", (event) => {
        applyTheme(event.detail.theme);
        if (reduceMotion) {
            renderer.render(scene, camera);
        }
    });

    /* ---------- Seção ativa ---------- */

    /* Formação única: converte o centro do bloco âncora (px na tela) em y
       do mundo no plano z = 0, na distância da cena. Lido a cada quadro,
       a formação "rola" junto com o bloco. */
    const updateAnchor = () => {
        if (!anchorEl) {
            return;
        }
        const h = window.innerHeight;
        if (h === 0) {
            return;
        }
        const r = anchorEl.getBoundingClientRect();
        const halfH = configs[0].camZ * Math.tan((FOV / 2) * (Math.PI / 180));
        anchorY = (h / 2 - (r.top + r.height / 2)) / (h / 2 / halfH);
    };

    /* movimento reduzido: coloca a formação ativa direto no lugar, sem morph */
    const snapToTarget = () => {
        const { x, s } = layout[activeIndex];
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] = target[i] + x;
            positions[i + 1] = target[i + 1];
            positions[i + 2] = target[i + 2];
        }
        geometry.getAttribute("position").needsUpdate = true;
        updateAnchor();
        group.position.x = x;
        group.position.y = anchorY;
        points.position.x = -x;
        group.scale.setScalar(s);
        group.rotation.set(configs[activeIndex].rotX, 0, 0);
        camera.position.z = configs[activeIndex].camZ;
        renderer.render(scene, camera);
    };

    /* fora do layout dividido o texto ocupa a tela toda: partículas só no hero.
       Formação única: só enquanto o bloco âncora está na tela (nos dois layouts),
       para nunca ficar atrás do conteúdo que vem depois dele. */
    const updateDim = () => {
        if (solo) {
            canvas.classList.toggle("is-dim", !anchorVisible);
            return;
        }
        canvas.classList.toggle("is-dim", !split && activeIndex !== 0);
    };

    const setFormation = (index) => {
        if (index === activeIndex || !formations[index]) {
            return;
        }
        const repaint = (index === 3) !== (activeIndex === 3);
        activeIndex = index;
        target = formations[index];
        if (repaint) {
            applyTheme(currentTheme());
        }

        if (reduceMotion) {
            snapToTarget();
        }
    };

    const sceneSections = document.querySelectorAll("[data-scene]");
    if (solo) {
        if (anchorEl && "IntersectionObserver" in window) {
            /* "na tela" = ao menos 60% do bloco abaixo do header fixo (ou 60% da
               área útil, se o bloco for mais alto que ela); passou disso, apaga */
            const headerH = parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue("--header-h")
            ) || 72;
            const anchorObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        const rootH = entry.rootBounds ? entry.rootBounds.height : window.innerHeight;
                        anchorVisible = entry.isIntersecting && (
                            entry.intersectionRatio >= 0.6 ||
                            entry.intersectionRect.height >= rootH * 0.6
                        );
                    });
                    updateDim();
                },
                {
                    rootMargin: `-${headerH}px 0px 0px 0px`,
                    threshold: [0, 0.2, 0.4, 0.6, 0.8, 1]
                }
            );
            anchorObserver.observe(anchorEl);
        }
    } else if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setFormation(Number(entry.target.dataset.scene));
                        updateDim();
                    }
                });
            },
            { rootMargin: "-42% 0px -42% 0px", threshold: 0 }
        );
        sceneSections.forEach((section) => observer.observe(section));
    }

    let lastW = 0;
    let lastH = 0;

    /* Formação única (certificados): no layout dividido vai para o lado livre
       à direita do bloco âncora (a introdução ocupa ~59% da largura); fora
       dele, segue o hero do index em telas menores (deslocada à direita no
       tablet, centrada no celular). Nos dois casos a altura cabe na do bloco
       (com folga), para não invadir o conteúdo logo abaixo. */
    const SOLO_PAD = 28; /* px de folga acima/abaixo do bloco âncora */
    const layoutSolo = (w, h, tanHalf) => {
        const item = layout[0];
        const { hw, hh } = extents[0];
        const halfH = configs[0].camZ * tanHalf;
        const ppuY = h / 2 / halfH;
        const rect = anchorEl ? anchorEl.getBoundingClientRect() : null;
        const halfBlock = rect ? (rect.height / 2 + SOLO_PAD) / ppuY : halfH * 0.5;

        if (split) {
            const cw = document.documentElement.clientWidth || w;
            const ppu = ppuY * (cw / w);
            const shellEl = anchorEl && anchorEl.parentElement;
            const shell = shellEl ? shellEl.getBoundingClientRect() : null;
            const fl = (rect ? rect.right : cw * 0.62) + FREE_GAP;
            const fr = Math.min(cw - FREE_EDGE, shell ? shell.right + FREE_OVERHANG : cw);
            const halfFree = Math.max(1, (fr - fl) / 2 / ppu);
            item.x = ((fl + fr) / 2 - cw / 2) / ppu;
            item.s = Math.min(
                1,
                (halfFree * 0.94) / hw,
                halfBlock / hh,
                (halfH * 0.78) / hh
            );
        } else {
            let s = Math.min(1, Math.max(0.52, w / 1180));
            const narrow = narrowQuery.matches;
            if (!narrow) {
                const halfW = halfH * (w / h);
                s = Math.min(s, (halfW * 0.94) / (SIDE_X + hw));
            }
            s = Math.min(s, halfBlock / hh);
            item.x = narrow ? 0 : SIDE_X * s;
            item.s = s;
        }
    };

    /* Mede a coluna de texto de uma seção com conteúdo à esquerda (hero) e de
       uma com conteúdo à direita (sobre); o lado oposto é a área livre. */
    const columnRect = (index) => {
        const section = sceneSections[index];
        const col = section && section.firstElementChild;
        return col ? col.getBoundingClientRect() : null;
    };

    const handleResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w === 0 || h === 0) {
            return;
        }
        lastW = w;
        lastH = h;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);

        split = splitQuery.matches;
        const tanHalf = Math.tan((FOV / 2) * (Math.PI / 180));

        if (solo) {
            layoutSolo(w, h, tanHalf);
        } else if (split) {
            /* o canvas (innerWidth) é exibido na largura sem a barra de rolagem */
            const cw = document.documentElement.clientWidth || w;
            const k = cw / w;
            const leftCol = columnRect(0);
            const rightCol = columnRect(1);
            /* em telas muito largas a área livre não passa muito do container,
               para a formação não se afastar demais do texto */
            const shell = sceneSections[0] ? sceneSections[0].getBoundingClientRect() : null;
            const outerR = Math.min(cw - FREE_EDGE, shell ? shell.right + FREE_OVERHANG : cw);
            const outerL = Math.max(FREE_EDGE, shell ? shell.left - FREE_OVERHANG : 0);
            const free = {
                right: [(leftCol ? leftCol.right : cw * 0.62) + FREE_GAP, outerR],
                left: [outerL, (rightCol ? rightCol.left : cw * 0.38) - FREE_GAP]
            };
            layout.forEach((item, i) => {
                const [fl, fr] = SIDE[i] > 0 ? free.right : free.left;
                /* px de tela por unidade do mundo no plano z = 0, na distância da cena */
                const halfH = configs[i].camZ * tanHalf;
                const ppu = (h / 2 / halfH) * k;
                const halfFree = Math.max(1, (fr - fl) / 2 / ppu);
                item.x = ((fl + fr) / 2 - cw / 2) / ppu;
                item.s = Math.min(
                    1,
                    (halfFree * 0.94) / extents[i].hw,
                    (halfH * 0.78) / extents[i].hh
                );
            });
        } else {
            let s = Math.min(1, Math.max(0.52, w / 1180));
            const narrow = narrowQuery.matches;
            if (!narrow) {
                /* telas mais "quadradas": encolhe para a formação deslocada não cortar na borda
                   (meia largura visível = altura visível/2 × aspecto, na câmera mais próxima, z=42) */
                const halfW = 42 * tanHalf * (w / h);
                s = Math.min(s, (halfW * 0.94) / (SIDE_X + SHAPE_HALF_W));
            }
            layout.forEach((item) => {
                item.x = narrow ? 0 : SIDE_X * s;
                item.s = s;
            });
        }

        updateDim();
        if (reduceMotion) {
            snapToTarget();
        }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    if (anchorEl) {
        /* a altura do bloco âncora muda quando as fontes chegam */
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(handleResize);
        }
        /* sem o loop (movimento reduzido), a rolagem redesenha a formação no lugar */
        if (reduceMotion) {
            window.addEventListener("scroll", snapToTarget, { passive: true });
        }
    }

    /* ---------- Loop ---------- */

    canvas.classList.add("is-on");

    if (reduceMotion) {
        snapToTarget();
        return;
    }

    const clock = new THREE.Clock();
    let elapsed = 0;
    let phase = 0;
    let swaySpeed = configs[0].speed;
    let swayAmp = configs[0].amp;
    let rotX = configs[0].rotX;
    let camZ = configs[0].camZ;
    let pivotX = layout[0].x;
    let scaleNow = layout[0].s;
    let frameId = null;

    const tick = () => {
        frameId = requestAnimationFrame(tick);

        /* autocura: webviews podem iniciar com viewport 0×0 sem disparar resize */
        if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
            handleResize();
        }

        /* sem clamp: os easings são exponenciais (nunca passam do alvo),
           então dt grande em quadros lentos só acelera a convergência */
        const dt = clock.getDelta();
        elapsed += dt;

        const morphK = 1 - Math.exp(-2.9 * dt);
        const easeK = 1 - Math.exp(-3.4 * dt);

        /* cada ponto vai para a formação ativa já deslocada para o seu lado:
           na troca de seção a nuvem atravessa a tela enquanto muda de forma */
        const { x: offX, s: scaleTarget } = layout[activeIndex];
        const posAttr = geometry.getAttribute("position");
        const arr = posAttr.array;
        for (let i = 0; i < arr.length; i += 3) {
            arr[i] += (target[i] + offX - arr[i]) * morphK;
            arr[i + 1] += (target[i + 1] - arr[i + 1]) * morphK;
            arr[i + 2] += (target[i + 2] - arr[i + 2]) * morphK;
        }
        posAttr.needsUpdate = true;

        const config = configs[activeIndex];
        swaySpeed += (config.speed - swaySpeed) * easeK;
        swayAmp += (config.amp - swayAmp) * easeK;
        rotX += (config.rotX - rotX) * easeK;
        camZ += (config.camZ - camZ) * easeK;
        pivotX += (offX - pivotX) * easeK;
        scaleNow += (scaleTarget - scaleNow) * easeK;

        phase += swaySpeed * dt;
        updateAnchor();
        group.position.x = pivotX;
        group.position.y = anchorY;
        points.position.x = -pivotX;
        group.rotation.y = Math.sin(phase) * swayAmp;
        group.rotation.x = rotX + Math.sin(phase * 0.63) * swayAmp * 0.22;
        group.rotation.z = Math.sin(phase * 0.5) * swayAmp * 0.08;
        group.scale.setScalar(scaleNow * (1 + Math.sin(elapsed * 0.45) * 0.012));

        camera.position.z = camZ;
        camera.position.x = 0;
        camera.position.y = 0;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
    };

    tick();

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            if (frameId !== null) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            clock.stop();
        } else if (frameId === null) {
            clock.start();
            tick();
        }
    });
})();
