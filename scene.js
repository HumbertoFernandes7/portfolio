/* ============================================================
   Cena 3D — campo de partículas persistente entre as seções.
   Cada seção tem uma formação que remete a programação:
   00 </> (código) → 01 xícara de café (Java) → 02 folha
   (Spring) → 03 cobra (Python) → 04 rede neural (IA).
   As formas planas são amostradas de um canvas 2D; a rede
   neural é gerada por coordenadas. Carrega Three.js via import
   map; sem WebGL, o site segue normalmente sobre o fundo CSS.
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
    const OPACITY_SCALE = isSmall ? 0.5 : 1;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        42,
        window.innerWidth / window.innerHeight,
        0.1,
        140
    );
    camera.position.set(0, 0, 46);

    /* ---------- Formações ---------- */

    const rand = (min, max) => min + Math.random() * (max - min);

    /* Desenha um símbolo num canvas 2D e vira nuvem de pontos (x/y do
       pixel, z com pequena profundidade). Coordenadas em % do canvas.
       dx desloca a forma no eixo X do mundo (composição com o texto). */
    const sampleShape = (draw, extent, depth = 3, dx = 0) => {
        const s = 360;
        const cv = document.createElement("canvas");
        cv.width = s;
        cv.height = s;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#fff";
        draw(ctx, s / 100);
        const data = ctx.getImageData(0, 0, s, s).data;

        const candidates = [];
        for (let p = 3; p < data.length; p += 4) {
            if (data[p] > 40) {
                const idx = (p - 3) / 4;
                candidates.push(idx % s, (idx / s) | 0);
            }
        }

        const pts = new Float32Array(COUNT * 3);
        const n = candidates.length / 2;
        for (let k = 0; k < COUNT; k += 1) {
            if (n === 0) {
                /* fallback improvável (ex.: fonte indisponível): esfera */
                const a = Math.random() * Math.PI * 2;
                const b = Math.acos(rand(-1, 1));
                pts[k * 3] = 12 * Math.sin(b) * Math.cos(a);
                pts[k * 3 + 1] = 12 * Math.cos(b);
                pts[k * 3 + 2] = 12 * Math.sin(b) * Math.sin(a);
                continue;
            }
            const j = (Math.random() * n) | 0;
            pts[k * 3] = ((candidates[j * 2] + Math.random()) / s - 0.5) * extent + dx;
            pts[k * 3 + 1] = (0.5 - (candidates[j * 2 + 1] + Math.random()) / s) * extent;
            pts[k * 3 + 2] = (Math.random() - 0.5) * depth;
        }
        return pts;
    };

    /* 00 — código: glifo </> */
    const drawCode = (ctx, u) => {
        ctx.font = `900 ${Math.round(u * 40)}px "JetBrains Mono", Consolas, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("</>", u * 50, u * 53);
    };

    /* 01 — Java: xícara com vapor e pires */
    const drawCup = (ctx, u) => {
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(26 * u, 40 * u, 32 * u, 32 * u, [3 * u, 3 * u, 8 * u, 8 * u]);
        } else {
            ctx.rect(26 * u, 40 * u, 32 * u, 32 * u);
        }
        ctx.fill();

        ctx.lineWidth = 5 * u;
        ctx.beginPath();
        ctx.arc(58 * u, 54 * u, 10 * u, -Math.PI / 2.6, Math.PI / 2.6);
        ctx.stroke();

        ctx.lineCap = "round";
        ctx.lineWidth = 4 * u;
        ctx.beginPath();
        ctx.moveTo(22 * u, 79 * u);
        ctx.lineTo(62 * u, 79 * u);
        ctx.stroke();

        ctx.lineWidth = 4.5 * u;
        [34, 48].forEach((sx) => {
            ctx.beginPath();
            ctx.moveTo(sx * u, 34 * u);
            ctx.bezierCurveTo((sx - 6) * u, 27 * u, (sx + 6) * u, 21 * u, sx * u, 13 * u);
            ctx.stroke();
        });
    };

    /* 02 — Spring: folha com nervura central */
    const drawLeaf = (ctx, u) => {
        ctx.beginPath();
        ctx.moveTo(50 * u, 88 * u);
        ctx.bezierCurveTo(20 * u, 68 * u, 24 * u, 28 * u, 50 * u, 10 * u);
        ctx.bezierCurveTo(76 * u, 28 * u, 80 * u, 68 * u, 50 * u, 88 * u);
        ctx.fill();

        ctx.globalCompositeOperation = "destination-out";
        ctx.lineCap = "round";
        ctx.lineWidth = 3.5 * u;
        ctx.beginPath();
        ctx.moveTo(50 * u, 84 * u);
        ctx.bezierCurveTo(45 * u, 64 * u, 55 * u, 42 * u, 50 * u, 14 * u);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
    };

    /* 03 — Python: cobra em "S" com cabeça e língua */
    const drawSnake = (ctx, u) => {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 11 * u;
        ctx.beginPath();
        ctx.moveTo(28 * u, 80 * u);
        ctx.bezierCurveTo(64 * u, 78 * u, 70 * u, 60 * u, 50 * u, 53 * u);
        ctx.bezierCurveTo(30 * u, 46 * u, 34 * u, 29 * u, 56 * u, 27 * u);
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(63 * u, 26 * u, 9.5 * u, 7 * u, -0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.moveTo(71 * u, 25 * u);
        ctx.lineTo(78 * u, 22 * u);
        ctx.moveTo(78 * u, 22 * u);
        ctx.lineTo(82 * u, 24 * u);
        ctx.moveTo(78 * u, 22 * u);
        ctx.lineTo(81 * u, 19 * u);
        ctx.stroke();
    };

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

        const perNode = Math.floor((COUNT * 0.4) / nodes.length);
        nodes.forEach((node) => {
            for (let k = 0; k < perNode; k += 1) {
                const r = 0.95 * Math.cbrt(Math.random());
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
                a.x + (b.x - a.x) * t + rand(-0.12, 0.12),
                a.y + (b.y - a.y) * t + rand(-0.12, 0.12),
                a.z + (b.z - a.z) * t + rand(-0.12, 0.12)
            );
        }
        return pts;
    };

    const formations = [
        sampleShape(drawCode, 30, 3, isSmall ? 0 : 5),
        sampleShape(drawCup, 26),
        sampleShape(drawLeaf, 26),
        sampleShape(drawSnake, 28),
        makeNetwork()
    ];

    /* Comportamento por seção: inclinação, distância e balanço.
       Os símbolos oscilam em vez de girar para seguirem legíveis. */
    const configs = [
        { rotX: -0.05, camZ: 42, amp: 0.2, speed: 0.5 },
        { rotX: -0.07, camZ: 44, amp: 0.2, speed: 0.45 },
        { rotX: -0.06, camZ: 44, amp: 0.24, speed: 0.5 },
        { rotX: -0.05, camZ: 43, amp: 0.2, speed: 0.48 },
        { rotX: -0.06, camZ: 42, amp: 0.15, speed: 0.38 }
    ];

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

    const points = new THREE.Points(geometry, material);
    const group = new THREE.Group();
    group.add(points);
    scene.add(group);

    /* ---------- Tema ---------- */

    const THEMES = {
        dark: {
            primary: new THREE.Color("#5f8aff"),
            secondary: new THREE.Color("#dfe8ff"),
            fog: new THREE.Color("#060b16"),
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        },
        light: {
            primary: new THREE.Color("#1e4fd6"),
            secondary: new THREE.Color("#3c485f"),
            fog: new THREE.Color("#eef1f7"),
            opacity: 0.5,
            blending: THREE.NormalBlending
        }
    };

    scene.fog = new THREE.Fog(THEMES.dark.fog, 36, 86);

    const applyTheme = (name) => {
        const theme = THEMES[name] || THEMES.dark;
        const colorAttr = geometry.getAttribute("color");
        const mixed = new THREE.Color();
        for (let i = 0; i < COUNT; i += 1) {
            mixed.copy(theme.primary).lerp(theme.secondary, mixes[i]);
            colorAttr.setXYZ(i, mixed.r, mixed.g, mixed.b);
        }
        colorAttr.needsUpdate = true;
        material.opacity = theme.opacity * OPACITY_SCALE;
        material.blending = theme.blending;
        material.needsUpdate = true;
        scene.fog.color.copy(theme.fog);
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

    let activeIndex = 0;
    let target = formations[0];

    const setFormation = (index) => {
        if (index === activeIndex || !formations[index]) {
            return;
        }
        activeIndex = index;
        target = formations[index];

        if (reduceMotion) {
            positions.set(target);
            geometry.getAttribute("position").needsUpdate = true;
            group.rotation.x = configs[index].rotX;
            camera.position.z = configs[index].camZ;
            renderer.render(scene, camera);
        }
    };

    const sceneSections = document.querySelectorAll("[data-scene]");
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setFormation(Number(entry.target.dataset.scene));
                    }
                });
            },
            { rootMargin: "-42% 0px -42% 0px", threshold: 0 }
        );
        sceneSections.forEach((section) => observer.observe(section));
    }

    /* ---------- Interação ---------- */

    let pointerX = 0;
    let pointerY = 0;
    let easedX = 0;
    let easedY = 0;

    if (!reduceMotion) {
        window.addEventListener(
            "pointermove",
            (event) => {
                pointerX = event.clientX / window.innerWidth - 0.5;
                pointerY = event.clientY / window.innerHeight - 0.5;
            },
            { passive: true }
        );
    }

    let baseScale = 1;
    let lastW = 0;
    let lastH = 0;

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
        baseScale = Math.min(1, Math.max(0.52, w / 1180));
        if (reduceMotion) {
            group.scale.setScalar(baseScale);
            renderer.render(scene, camera);
        }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    /* ---------- Loop ---------- */

    canvas.classList.add("is-on");

    if (reduceMotion) {
        positions.set(target);
        geometry.getAttribute("position").needsUpdate = true;
        group.rotation.x = configs[0].rotX;
        group.scale.setScalar(baseScale);
        renderer.render(scene, camera);
        return;
    }

    const clock = new THREE.Clock();
    let elapsed = 0;
    let phase = 0;
    let swaySpeed = configs[0].speed;
    let swayAmp = configs[0].amp;
    let rotX = configs[0].rotX;
    let camZ = configs[0].camZ;
    let frameId = null;

    const tick = () => {
        frameId = requestAnimationFrame(tick);

        /* autocura: webviews podem iniciar com viewport 0×0 sem disparar resize */
        if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
            handleResize();
        }

        const dt = Math.min(clock.getDelta(), 0.05);
        elapsed += dt;

        const morphK = 1 - Math.exp(-2.9 * dt);
        const easeK = 1 - Math.exp(-3.4 * dt);

        const posAttr = geometry.getAttribute("position");
        const arr = posAttr.array;
        for (let i = 0; i < arr.length; i += 1) {
            arr[i] += (target[i] - arr[i]) * morphK;
        }
        posAttr.needsUpdate = true;

        const config = configs[activeIndex];
        swaySpeed += (config.speed - swaySpeed) * easeK;
        swayAmp += (config.amp - swayAmp) * easeK;
        rotX += (config.rotX - rotX) * easeK;
        camZ += (config.camZ - camZ) * easeK;

        easedX += (pointerX - easedX) * easeK;
        easedY += (pointerY - easedY) * easeK;

        phase += swaySpeed * dt;
        group.rotation.y = Math.sin(phase) * swayAmp + easedX * 0.22;
        group.rotation.x = rotX + Math.sin(phase * 0.63) * swayAmp * 0.22 + easedY * 0.14;
        group.rotation.z = Math.sin(phase * 0.5) * swayAmp * 0.08;
        group.scale.setScalar(baseScale * (1 + Math.sin(elapsed * 0.45) * 0.012));

        camera.position.z = camZ;
        camera.position.x = easedX * 2.2;
        camera.position.y = -easedY * 1.6;
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
