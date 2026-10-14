/* ============================================================
   Cena 3D — campo de partículas persistente entre as seções.
   Cada seção tem uma formação que remete a programação:
   00 </> (código) → 01 xícara de café (Java) → 02 janela de
   terminal (projetos) → 03 logo do Python → 04 rede neural
   (IA). As formas planas são amostradas de um canvas 2D; a rede
   neural é gerada por coordenadas. No desktop largo a formação
   fica no lado livre da tela, alternando com o texto das seções.
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
    /* em telas estreitas as formações ficam atrás do texto: menos pontos e mais discretos */
    const COUNT = isSmall ? 2200 : 6500;
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

    /* Desenha um símbolo num canvas 2D e vira nuvem de pontos (x/y do
       pixel, z com pequena profundidade). Coordenadas em % do canvas.
       edge: fração dos pontos reservada ao contorno — formas cheias
       (xícara, Python) ganham silhueta, vãos e olhos nítidos. */
    const sampleShape = (draw, extent, depth = 3, count = COUNT, edge = 0) => {
        const s = 360;
        const cv = document.createElement("canvas");
        cv.width = s;
        cv.height = s;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#fff";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        draw(ctx, s / 100);
        const data = ctx.getImageData(0, 0, s, s).data;

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

    /* A formação do Python é bicolor: primeira metade dos pontos é a
       cobra azul (cima), segunda metade a dourada (baixo). */
    const PY_SPLIT = Math.floor(COUNT / 2);
    const makePython = () => {
        const pts = new Float32Array(COUNT * 3);
        pts.set(sampleShape(drawPyTop, 28, 2, PY_SPLIT, 0.45), 0);
        pts.set(sampleShape(drawPyBottom, 28, 2, COUNT - PY_SPLIT, 0.45), PY_SPLIT * 3);
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

    /* formações centradas na origem; o deslocamento lateral é aplicado no loop */
    const formations = [
        sampleShape(drawCode, 30, 3),
        sampleShape(drawCup, 30, 3, COUNT, 0.3),
        sampleShape(drawTerminal, 30, 2.4),
        makePython(),
        makeNetwork()
    ];
    const extents = formations.map(centerCloud);

    /* Comportamento por seção: inclinação, distância e balanço.
       Os símbolos oscilam em vez de girar para seguirem legíveis. */
    const configs = [
        { rotX: -0.05, camZ: 42, amp: 0.2, speed: 0.5 },
        { rotX: -0.07, camZ: 44, amp: 0.2, speed: 0.45 },
        { rotX: -0.06, camZ: 44, amp: 0.2, speed: 0.5 },
        { rotX: -0.03, camZ: 43, amp: 0.1, speed: 0.42 },
        { rotX: -0.06, camZ: 42, amp: 0.15, speed: 0.38 }
    ];

    /* posição (x no mundo) e escala de cada formação; recalculadas no resize */
    const layout = formations.map(() => ({ x: 0, s: 1 }));
    let split = false;

    /* ---------- Geometria e material ---------- */

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const mixes = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i += 1) {
        mixes[i] = Math.pow(Math.random(), 1.6);
        /* nasce como nuvem dispersa e converge para a primeira formação */
        positions[i * 3] = rand(-60, 60);
        positions[i * 3 + 1] = rand(-45, 45);
        positions[i * 3 + 2] = rand(-50, 30);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const makeSprite = () => {
        const size = 64;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const texture = new THREE.CanvasTexture(c);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };

    const material = new THREE.PointsMaterial({
        size: isSmall ? 0.3 : 0.32,
        map: makeSprite(),
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
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        },
        /* no claro os pontos são "tinta" sobre papel: cores escuras, opacidade
           maior e névoa afastada, senão a forma vira um borrão cinza */
        light: {
            primary: new THREE.Color("#1d4ed8"),
            secondary: new THREE.Color("#0f2a6b"),
            gold: new THREE.Color("#c98a00"),
            goldSoft: new THREE.Color("#8a5a00"),
            fog: new THREE.Color("#dde3ec"),
            fogNear: 70,
            fogFar: 140,
            opacity: 0.6,
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

    /* movimento reduzido: coloca a formação ativa direto no lugar, sem morph */
    const snapToTarget = () => {
        const { x, s } = layout[activeIndex];
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] = target[i] + x;
            positions[i + 1] = target[i + 1];
            positions[i + 2] = target[i + 2];
        }
        geometry.getAttribute("position").needsUpdate = true;
        group.position.x = x;
        points.position.x = -x;
        group.scale.setScalar(s);
        group.rotation.set(configs[activeIndex].rotX, 0, 0);
        camera.position.z = configs[activeIndex].camZ;
        renderer.render(scene, camera);
    };

    /* fora do layout dividido o texto ocupa a tela toda: partículas só no hero */
    const updateDim = () => {
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
    if ("IntersectionObserver" in window) {
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

        if (split) {
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
        group.position.x = pivotX;
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
