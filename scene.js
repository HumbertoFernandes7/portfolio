/* ============================================================
   Cena 3D — campo de partículas persistente entre as seções.
   Cada seção tem uma formação; o scroll transforma uma na outra:
   00 onda (dados em fluxo) → 01 esfera (núcleo) → 02 malha
   (estrutura) → 03 hélice (evolução) → 04 anéis (conexão).
   Carrega Three.js via import map; sem WebGL, o site segue
   funcionando normalmente sobre o fundo em CSS.
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

    const makeWave = () => {
        const pts = new Float32Array(COUNT * 3);
        const cols = Math.ceil(Math.sqrt(COUNT * 1.9));
        const rows = Math.ceil(COUNT / cols);
        for (let i = 0; i < COUNT; i += 1) {
            const cx = i % cols;
            const cz = Math.floor(i / cols);
            const x = (cx / (cols - 1) - 0.5) * 72;
            const z = (cz / (rows - 1) - 0.5) * 40;
            const y =
                Math.sin(x * 0.24) * 2.1 +
                Math.cos(z * 0.31) * 1.7 +
                Math.sin((x + z) * 0.12) * 1.2;
            pts[i * 3] = x + rand(-0.25, 0.25);
            pts[i * 3 + 1] = y - 3 + rand(-0.2, 0.2);
            pts[i * 3 + 2] = z + rand(-0.25, 0.25);
        }
        return pts;
    };

    const makeSphere = () => {
        const pts = new Float32Array(COUNT * 3);
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < COUNT; i += 1) {
            const t = i / (COUNT - 1);
            const inclination = Math.acos(1 - 2 * t);
            const azimuth = golden * i;
            const r = 13 + rand(-0.5, 0.5);
            pts[i * 3] = r * Math.sin(inclination) * Math.cos(azimuth);
            pts[i * 3 + 1] = r * Math.cos(inclination);
            pts[i * 3 + 2] = r * Math.sin(inclination) * Math.sin(azimuth);
        }
        return pts;
    };

    const makeLattice = () => {
        const pts = new Float32Array(COUNT * 3);
        const side = Math.round(Math.cbrt(COUNT));
        const spacing = 34 / (side - 1);
        const cube = side * side * side;
        for (let i = 0; i < COUNT; i += 1) {
            if (i < cube) {
                const x = i % side;
                const y = Math.floor(i / side) % side;
                const z = Math.floor(i / (side * side)) % side;
                pts[i * 3] = (x - (side - 1) / 2) * spacing + rand(-0.14, 0.14);
                pts[i * 3 + 1] = (y - (side - 1) / 2) * spacing + rand(-0.14, 0.14);
                pts[i * 3 + 2] = (z - (side - 1) / 2) * spacing + rand(-0.14, 0.14);
            } else {
                pts[i * 3] = rand(-17, 17);
                pts[i * 3 + 1] = rand(-17, 17);
                pts[i * 3 + 2] = rand(-17, 17);
            }
        }
        return pts;
    };

    const makeHelix = () => {
        const pts = new Float32Array(COUNT * 3);
        const turns = 2.6;
        for (let i = 0; i < COUNT; i += 1) {
            const t = i / (COUNT - 1);
            const angle = t * turns * Math.PI * 2 + (i % 2) * Math.PI;
            const r = 7.2 + rand(-0.9, 0.9);
            pts[i * 3] = Math.cos(angle) * r;
            pts[i * 3 + 1] = (t - 0.5) * 34 + rand(-0.3, 0.3);
            pts[i * 3 + 2] = Math.sin(angle) * r;
        }
        return pts;
    };

    const makeRings = () => {
        const pts = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i += 1) {
            const inner = i % 10 < 3;
            const radius = (inner ? 7.5 : 13) + rand(-1.1, 1.1);
            const angle = Math.random() * Math.PI * 2;
            pts[i * 3] = Math.cos(angle) * radius;
            pts[i * 3 + 1] = rand(-0.9, 0.9);
            pts[i * 3 + 2] = Math.sin(angle) * radius;
        }
        return pts;
    };

    const formations = [makeWave(), makeSphere(), makeLattice(), makeHelix(), makeRings()];

    /* Comportamento por seção: inclinação, distância e giro */
    const configs = [
        { rotX: -0.5, camZ: 42, spin: 0.016 },
        { rotX: -0.12, camZ: 47, spin: 0.05 },
        { rotX: -0.2, camZ: 49, spin: 0.04 },
        { rotX: -0.05, camZ: 45, spin: 0.1 },
        { rotX: -0.62, camZ: 43, spin: 0.14 }
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
            copper: new THREE.Color("#c89b63"),
            neutral: new THREE.Color("#ece7de"),
            fog: new THREE.Color("#0c0b0a"),
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        },
        light: {
            copper: new THREE.Color("#8a5424"),
            neutral: new THREE.Color("#3a3226"),
            fog: new THREE.Color("#f2eee7"),
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
            mixed.copy(theme.copper).lerp(theme.neutral, mixes[i]);
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
    let spin = 0;
    let spinSpeed = configs[0].spin;
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
        spinSpeed += (config.spin - spinSpeed) * easeK;
        rotX += (config.rotX - rotX) * easeK;
        camZ += (config.camZ - camZ) * easeK;

        easedX += (pointerX - easedX) * easeK;
        easedY += (pointerY - easedY) * easeK;

        spin += spinSpeed * dt;
        group.rotation.y = spin + easedX * 0.22;
        group.rotation.x = rotX + easedY * 0.14;
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
