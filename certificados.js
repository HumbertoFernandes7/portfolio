const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* ordem fixa dos filtros; tags novas, se surgirem, entram no fim */
const TAG_ORDER = [
    "Java & Spring",
    "Dados",
    "Cloud & DevOps",
    "Arquitetura & APIs",
    "Testes",
    "Front-end",
    "C# & .NET",
    "Carreira & outros"
];

/* ---------- Utilitários ---------- */

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined && text !== null) {
        node.textContent = text;
    }
    return node;
};

const arrow = (symbol) => {
    const span = el("span", null, symbol);
    span.setAttribute("aria-hidden", "true");
    return span;
};

/* "2025-08-01" -> "ago 2025" (sem passar por Date, para não sofrer com fuso) */
const formatDate = (iso) => {
    const [year, month] = String(iso).split("-");
    const label = MONTHS[Number(month) - 1];
    return label ? `${label} ${year}` : String(year || "");
};

const formatHours = (hours) => {
    if (typeof hours !== "number") {
        return "";
    }
    return `${String(hours).replace(".", ",")} h`;
};

/* minúsculas e sem acento, para a busca */
const normalize = (value) =>
    String(value)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();

const loadJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }
    return response.json();
};

/* ---------- Lightbox ---------- */

const lightbox = (() => {
    const dialog = document.getElementById("lightbox");
    const image = document.getElementById("lb-img");
    const stage = document.getElementById("lb-stage");
    const title = document.getElementById("lb-title");
    const meta = document.getElementById("lb-meta");
    const link = document.getElementById("lb-link");
    const count = document.getElementById("lb-count");
    const prev = document.getElementById("lb-prev");
    const next = document.getElementById("lb-next");
    const closeButton = document.getElementById("lb-close");

    /* list: [{ title, meta, image, width, height, url, focusTarget }] */
    let list = [];
    let index = 0;

    const show = (position) => {
        const item = list[position];
        if (!item) {
            return;
        }
        index = position;

        title.textContent = item.title;
        meta.textContent = item.meta;
        count.textContent = `${position + 1} / ${list.length}`;

        if (item.url) {
            link.href = item.url;
            link.hidden = false;
        } else {
            link.hidden = true;
        }

        const multiple = list.length > 1;
        prev.disabled = !multiple;
        next.disabled = !multiple;

        stage.classList.add("is-loading");
        image.alt = `Certificado: ${item.title}`;
        if (item.width && item.height) {
            image.width = item.width;
            image.height = item.height;
        } else {
            image.removeAttribute("width");
            image.removeAttribute("height");
        }
        image.src = item.image;
    };

    const step = (delta) => {
        if (list.length > 1) {
            show((index + delta + list.length) % list.length);
        }
    };

    image.addEventListener("load", () => stage.classList.remove("is-loading"));
    image.addEventListener("error", () => stage.classList.remove("is-loading"));

    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    closeButton.addEventListener("click", () => dialog.close());

    /* clique no fundo (o próprio <dialog>, fora do painel) fecha */
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    dialog.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            step(-1);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            step(1);
        }
    });

    /* Esc, botão e clique no fundo passam todos por aqui */
    dialog.addEventListener("close", () => {
        document.documentElement.classList.remove("lb-open");
        const item = list[index];
        const target = item && item.focusTarget;
        if (target && target.isConnected) {
            target.focus();
        }
        image.removeAttribute("src");
    });

    return {
        open(items, position) {
            if (typeof dialog.showModal !== "function") {
                /* sem <dialog> nativo: abre a imagem numa aba */
                window.open(items[position].image, "_blank", "noopener,noreferrer");
                return;
            }
            list = items;
            show(position);
            document.documentElement.classList.add("lb-open");
            dialog.showModal();
        }
    };
})();

/* ---------- Diplomas ---------- */

const renderDiplomas = (diplomas) => {
    const section = document.getElementById("diplomas");
    const container = document.getElementById("diploma-list");
    if (!section || !container) {
        return;
    }
    if (!diplomas.length) {
        section.hidden = true;
        return;
    }

    /* só entram no lightbox os diplomas que já têm imagem */
    const zoomable = [];
    const cards = [];

    diplomas.forEach((diploma) => {
        const card = el("article", "diploma-card");
        const hasImage = Boolean(diploma.thumb);
        const metaText = [diploma.issuer, diploma.period].filter(Boolean).join(" · ");

        if (hasImage) {
            const button = el("button", "diploma-media");
            button.type = "button";
            button.setAttribute("aria-haspopup", "dialog");
            button.setAttribute("aria-label", `Ampliar diploma: ${diploma.title}`);

            const img = el("img");
            img.src = diploma.thumb;
            img.alt = `Diploma: ${diploma.title}`;
            img.loading = "lazy";
            img.decoding = "async";
            button.appendChild(img);

            const entry = {
                title: diploma.title,
                meta: metaText,
                image: diploma.image || diploma.thumb,
                url: null,
                focusTarget: button
            };
            zoomable.push(entry);
            button.addEventListener("click", () => {
                lightbox.open(zoomable, zoomable.indexOf(entry));
            });
            card.appendChild(button);
        } else {
            const placeholder = el("div", "diploma-ph");
            placeholder.setAttribute("aria-hidden", "true");
            placeholder.appendChild(el("span", "diploma-ph-issuer", diploma.issuer));
            placeholder.appendChild(el("span", "diploma-ph-level", diploma.level));
            card.appendChild(placeholder);
        }

        const body = el("div", "diploma-body");
        body.appendChild(el("p", "diploma-level", diploma.level));
        body.appendChild(el("h3", "diploma-title", diploma.title));
        body.appendChild(el("p", "diploma-meta", metaText));
        card.appendChild(body);

        cards.push(card);
    });

    /* troca as molduras reservadas do HTML pelos cards reais */
    container.replaceChildren(...cards);
};

/* ---------- Certificados ---------- */

const renderCertificates = (items) => {
    const grid = document.getElementById("cert-grid");
    const chipsBox = document.getElementById("cert-chips");
    const searchInput = document.getElementById("cert-search");
    const sortSelect = document.getElementById("cert-sort");
    const countLabel = document.getElementById("cert-count");
    const emptyMessage = document.getElementById("cert-empty");
    const stats = document.getElementById("cert-stats");

    const total = items.length;
    const courseCount = items.filter((item) => item.kind === "curso").length;
    const trackCount = items.filter((item) => item.kind === "trilha").length;
    stats.textContent = `${courseCount} certificados · ${trackCount} trilhas`;

    /* ----- filtros (chips) ----- */

    const tagCounts = new Map();
    items.forEach((item) => {
        (item.tags || []).forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    });

    const tags = TAG_ORDER.filter((tag) => tagCounts.has(tag));
    tagCounts.forEach((_, tag) => {
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
    });

    let activeTag = null;
    const chipButtons = new Map();

    const addChip = (tag, label, amount) => {
        const chip = el("button", "chip");
        chip.type = "button";
        chip.appendChild(el("span", null, label));
        chip.appendChild(el("span", "chip-count", String(amount)));
        chip.addEventListener("click", () => {
            activeTag = tag;
            update();
        });
        chipButtons.set(tag, chip);
        chipsBox.appendChild(chip);
    };

    addChip(null, "Todos", total);
    tags.forEach((tag) => addChip(tag, tag, tagCounts.get(tag)));

    /* ----- cards (criados uma vez; o filtro só reordena/esconde) ----- */

    const cards = new Map();
    const thumbButtons = new Map();
    let visible = [];

    items.forEach((item) => {
        const li = el("li", "cert-card");
        const isTrack = item.kind === "trilha";

        const thumb = el("button", "cert-thumb");
        thumb.type = "button";
        thumb.setAttribute("aria-haspopup", "dialog");
        thumb.setAttribute("aria-label", `Ampliar certificado: ${item.title}`);
        const img = el("img");
        img.src = item.thumb;
        img.alt = `Certificado: ${item.title}`;
        img.loading = "lazy";
        img.decoding = "async";
        if (item.width && item.height) {
            img.width = item.width;
            img.height = item.height;
        }
        thumb.appendChild(img);
        thumb.addEventListener("click", () => {
            const entries = visible.map((current) => ({
                title: current.title,
                meta: [current.issuer, formatDate(current.date)].filter(Boolean).join(" · "),
                image: current.image,
                width: current.width,
                height: current.height,
                url: current.url,
                focusTarget: thumbButtons.get(current)
            }));
            lightbox.open(entries, visible.indexOf(item));
        });
        li.appendChild(thumb);
        thumbButtons.set(item, thumb);

        const body = el("div", "cert-body");

        if (isTrack) {
            const badge = el("p", "cert-badge", `Trilha · ${item.courses} cursos`);
            body.appendChild(badge);
        }

        body.appendChild(el("h3", "cert-name", item.title));

        const meta = el("p", "cert-meta");
        [item.issuer, formatDate(item.date), formatHours(item.hours)]
            .filter(Boolean)
            .forEach((part) => meta.appendChild(el("span", null, part)));
        body.appendChild(meta);

        if (item.tags && item.tags.length) {
            const tagList = el("ul", "cert-tags");
            item.tags.forEach((tag) => tagList.appendChild(el("li", null, tag)));
            body.appendChild(tagList);
        }

        const link = el("a", "cert-link", "Ver credencial");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.appendChild(arrow("↗"));
        body.appendChild(link);

        li.appendChild(body);
        cards.set(item, li);
    });

    /* ----- atualização da lista ----- */

    const searchKeys = new Map(items.map((item) => [item, normalize(item.title)]));

    function update() {
        const query = normalize(searchInput.value.trim());
        const direction = sortSelect.value === "asc" ? 1 : -1;

        visible = items
            .filter((item) => !activeTag || (item.tags || []).includes(activeTag))
            .filter((item) => !query || searchKeys.get(item).includes(query))
            .sort((a, b) => {
                if (a.date !== b.date) {
                    return a.date < b.date ? -direction : direction;
                }
                return a.title.localeCompare(b.title, "pt-BR");
            });

        chipButtons.forEach((chip, tag) => {
            chip.setAttribute("aria-pressed", tag === activeTag ? "true" : "false");
        });

        grid.replaceChildren(...visible.map((item) => cards.get(item)));
        countLabel.textContent = `${visible.length} de ${total}`;
        emptyMessage.hidden = visible.length > 0;
    }

    searchInput.addEventListener("input", update);
    sortSelect.addEventListener("change", update);
    update();
};

/* ---------- Início ---------- */

document.addEventListener("DOMContentLoaded", async () => {
    const [certificates, diplomas] = await Promise.allSettled([
        loadJson("data/certificados.json"),
        loadJson("data/diplomas.json")
    ]);

    if (diplomas.status === "fulfilled" && Array.isArray(diplomas.value)) {
        renderDiplomas(diplomas.value);
    } else {
        /* a seção nasce visível (com molduras reservadas): some só no erro */
        const diplomaSection = document.getElementById("diplomas");
        if (diplomaSection) {
            diplomaSection.hidden = true;
        }
    }

    if (certificates.status === "fulfilled" && Array.isArray(certificates.value)) {
        renderCertificates(certificates.value);
    } else {
        document.getElementById("cert-error").hidden = false;
        document.querySelector(".cert-toolbar").hidden = true;
    }
});
