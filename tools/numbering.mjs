/* ============================================================
   --fix do verificador: acerta a numeração das seções do index.html e a
   lista SECTIONS do components.js.

   Uso:   npm run fix                  (= node tools/check.mjs --fix [pasta])

   A ORDEM das seções no <main> manda. Quando você move, insere ou tira uma
   seção, o que depende da posição fica errado; o --fix reescreve só esses
   valores, a partir da ordem atual:
     - o NN do <span> do kicker (<p class="kicker"><span>NN</span>Rótulo</p>);
     - href, aria-label e title das setas .step-prev e .step-next
       ("Ir para NN · Rótulo", com o rótulo do kicker da seção de destino);
     - o href da seta do hero (a.scroll-cue), que leva à segunda seção;
     - as linhas { id: "…", label: "…" }, do array SECTIONS do components.js
       (de onde saem os menus): reordenadas para seguir as <section> do <main>
       e, para a seção que ainda não tem linha, acrescentada uma (id = o id da
       seção, label = o rótulo do kicker, no formato e na indentação das
       outras), no lugar certo da ordem.

   O data-scene NUNCA é mexido: ele não é a posição, é o id da formação 3D da
   seção (scene.js: 0 = </>, 1 = xícara, 2 = terminal, 3 = Python, 4 = balão,
   5 = rede neural). Quem muda de lugar leva o próprio data-scene junto, e o
   scene.js acompanha: o lado do texto sai da posição no DOM e o balão
   espelha sozinho. A regra "secoes" do check só exige que seja um inteiro,
   único, com o conjunto exatamente 0..N-1, e 0 no hero.

   Como o check e o fix nunca discordam: não existe um segundo cálculo. A
   regra "numeracao" do check.mjs calcula o valor esperado e, quando o valor
   está errado num lugar que existe, anexa ao erro o que trocar:
   ctx.error(arquivo, linha, msg, { el, attr, value }). A regra "lista-secoes"
   faz o mesmo com a lista do SECTIONS: calcula a que o index pede e a anexa ao
   primeiro erro de ordem, de falta ou de sobra, como { list }. O --fix só
   aplica esses `fix` no arquivo e roda o check normal de novo. O que o check
   não reclama, o fix não toca (por isso rodar duas vezes não muda nada).

   Edição cirúrgica: troca só o valor, entre as aspas (ou o texto do <span>).
   Indentação, espaços, CRLF/LF, ordem dos atributos e o resto do arquivo
   ficam byte a byte iguais. No SECTIONS, só as linhas do array são
   reescritas: cada linha que já existe segue inteira, com o mesmo texto (só a
   vírgula do fim se ajusta); o resto do components.js nem é tocado. O fix só
   mexe num array com um item por linha, o [ no fim da linha e o ] sozinho
   na dele (como está hoje); com outro formato, avisa e deixa para você.

   Não inventa HTML: não cria nem apaga nada. Se faltar o kicker, uma seta ou
   um atributo, o --fix avisa o que falta e como copiar de outra seção, e o
   check continua vermelho até você completar. A única exceção é MOVER: se
   uma seção deixou de ser a última (ou passou a ser) e há exatamente uma seta
   sobrando e uma faltando da mesma classe, a que sobra vai (a linha inteira,
   como está) para o fim da que falta; os valores dela o fix acerta em
   seguida. É o caso de mover o #contato, ou de acrescentar uma seção no fim.
   Do SECTIONS ele também não apaga nada: uma linha a mais (sem seção no
   index) é avisada e vai para o fim da lista, e o check continua vermelho
   até você apagá-la (ou criar a seção). O rótulo de uma linha que já existe
   também é seu: o fix não reescreve texto, só ordem e linha que falta.
   Menus escritos à mão no HTML (site-nav, menu-nav) também não: hoje os dois
   saem do <site-header>, que lê o SECTIONS.

   ------------------------------------------------------------
   Como acrescentar uma seção (ou mudar a ordem):
     1. Copie uma seção inteira do index.html (de <section id="sobre" …> até
        </section>) e cole na posição desejada entre as filhas do <main>.
        Para só mudar a ordem, recorte e cole a seção no lugar novo.
     2. Na cópia, ajuste o id (e os ids internos que o usam, como
        sobre-title no aria-labelledby), os textos e o rótulo do kicker; o NN
        o fix acerta. O data-scene escolhe o desenho 3D da seção: só mexa
        nele para uma seção nova. Ela precisa de uma formação nova no
        scene.js (um item a mais em builders e outro, na mesma posição, em
        configs, com outro desenho ou o mesmo builder de outra seção), e o
        data-scene dela é o id novo (N, o próximo depois do último); o
        conjunto tem que continuar 0..N-1, sem repetir.
        Quem só muda de lugar leva o data-scene que já tem.
     3. Rode npm run fix. Ele renumera os kickers, refaz os destinos e
        rótulos das setas (das seções vizinhas também) e deixa o SECTIONS do
        components.js (menus) na ordem do <main>, com a linha da seção nova
        (id da seção e rótulo do kicker). Não precisa editar o SECTIONS.
     4. npm run check confirma (0 erros). Se sobrar erro, o fix explica.
        Seção que sai do index: apague a linha dela no SECTIONS (o fix não
        apaga) e rode o fix de novo.
   ============================================================ */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const escapeValue = (value, quote) =>
    value.replace(/&/g, "&amp;").replace(quote === "'" ? /'/g : /"/g, quote === "'" ? "&#39;" : "&quot;");

/* Onde está o valor do atributo `name` na tag de abertura de `el` (el.pos…el.end, posições
   em `text`): { start, end, to }, para trocar text[start, end) por `to`. Percorre os
   atributos com o mesmo ATTR_RE do parser e o primeiro com o nome vence, como em parseAttrs.
   null se a tag não tem o atributo. */
function attrEdit(text, el, name, value, ATTR_RE) {
    const base = el.pos + /^<[a-zA-Z][\w:-]*/.exec(text.slice(el.pos, el.end))[0].length;
    for (const m of text.slice(base, el.end).matchAll(new RegExp(ATTR_RE.source, "gd"))) {
        if (m[1].toLowerCase() !== name) {
            continue;
        }
        const span = (i) => [base + m.indices[i][0], base + m.indices[i][1]];
        if (m[2] !== undefined) {
            return { start: span(2)[0], end: span(2)[1], to: escapeValue(value, '"') };
        }
        if (m[3] !== undefined) {
            return { start: span(3)[0], end: span(3)[1], to: escapeValue(value, "'") };
        }
        if (m[4] !== undefined) {
            return { start: span(4)[0], end: span(4)[1], to: `"${escapeValue(value, '"')}"` };
        }
        return { start: span(1)[1], end: span(1)[1], to: `="${escapeValue(value, '"')}"` };
    }
    return null;
}

/* Onde está o texto de `el` (só texto, sem tags dentro), sem os espaços das pontas:
   { start, end, to }. null se tiver outra tag dentro ou faltar o fechamento. */
function textEdit(text, el, value) {
    const close = new RegExp(`</${el.tag}\\s*>`, "i").exec(text.slice(el.end));
    if (!close) {
        return null;
    }
    const raw = text.slice(el.end, el.end + close.index);
    if (raw.includes("<")) {
        return null;
    }
    const start = el.end + raw.indexOf(raw.trim());
    return { start, end: start + raw.trim().length, to: value.replace(/&/g, "&amp;").replace(/</g, "&lt;") };
}

/* Mover a linha do <p> `orphan` (a seta que sobra) para o fim da `section` que não tem a seta:
   [tira a linha, põe a linha antes da linha do </section>]. Só quando o <p> ocupa linhas
   inteiras e o </section> está sozinho na linha dele. null se não for assim. */
function moveEdits(text, orphan, section) {
    const lineStart = text.lastIndexOf("\n", orphan.pos - 1) + 1;
    const close = new RegExp("</p\\s*>", "i").exec(text.slice(orphan.end));
    const tail = close && /^[ \t]*\r?\n/.exec(text.slice(orphan.end + close.index + close[0].length));
    const sectionClose = new RegExp("</section\\s*>", "i").exec(text.slice(section.end));
    if (!tail || !sectionClose || text.slice(lineStart, orphan.pos).trim() !== "") {
        return null;
    }
    const lineEnd = orphan.end + close.index + close[0].length + tail[0].length;
    const closeAt = section.end + sectionClose.index;
    const insertAt = text.lastIndexOf("\n", closeAt - 1) + 1;
    if (text.slice(section.end, closeAt).includes("<section") || text.slice(insertAt, closeAt).trim() !== "") {
        return null;
    }
    return [
        { start: lineStart, end: lineEnd, to: "" },
        { start: insertAt, end: insertAt, to: text.slice(lineStart, lineEnd) }
    ];
}

/* As linhas do array SECTIONS (o literal em `text`, de plan.at, com o texto plan.literal) na
   ordem de plan.order, com a linha que falta, e as linhas a mais (plan.extras) no fim. Cada linha
   que existe segue inteira (indentação, texto e o que vem depois da vírgula); só a vírgula do fim
   se ajusta. A linha nova copia a indentação da primeira e o formato { id: "…", label: "…" }.
   Só mexe num array de um item { … } por linha, com o [ no fim da linha dele e o ] sozinho
   numa linha, e cujas linhas batem com os itens que o check leu (plan.items).
   Devolve { edit } (edit = { start, end, to }, ou null se a lista já está certa) ou { reason }. */
function sectionListEdit(text, plan) {
    const { at, literal } = plan;
    const unsupported = { reason: 'o fix só mexe em SECTIONS com um item { id: "…", label: "…" } por linha, o [ no fim da linha e o ] sozinho na dele; acerte à mão' };
    if (text.slice(at, at + literal.length) !== literal) {
        return { reason: "o components.js mudou depois da leitura; rode o fix de novo" };
    }
    const inner = literal.slice(1, -1);
    const head = /^[ \t]*\r?\n/.exec(inner);
    const tail = /\r?\n[ \t]*$/.exec(inner);
    if (!head || !tail || tail.index < head[0].length) {
        return unsupported;
    }
    const start = at + 1 + head[0].length;
    const region = inner.slice(head[0].length, tail.index);
    const parts = region.split(/(\r?\n)/); /* [linha, quebra, linha, quebra, …, linha] */
    const lines = [];
    for (let k = 0; k < parts.length; k += 2) {
        const m = /^([ \t]*)(\{[^{}]*\})(,?)([ \t]*)$/.exec(parts[k]);
        let id;
        try {
            id = m && vm.runInNewContext(`(${m[2]})`, Object.create(null), { timeout: 1000 }).id;
        } catch {
            id = undefined;
        }
        if (!m || id !== (plan.items[k / 2] || {}).id) {
            return unsupported;
        }
        lines.push({ indent: m[1], obj: m[2], trail: m[4] });
    }
    if (lines.length !== plan.items.length) {
        return unsupported;
    }
    const fresh = (o) => ({ indent: lines[0].indent, obj: `{ id: ${JSON.stringify(o.id)}, label: ${JSON.stringify(o.label)} }`, trail: "" });
    const next = [
        ...plan.order.map((o) => (o.item ? lines[o.item.index] : fresh(o))),
        ...plan.extras.map((item) => lines[item.index])
    ];
    const eol = parts[1] ?? /\r?\n/.exec(head[0])[0];
    const to = next
        .map((l, k) => `${l.indent}${l.obj}${k < next.length - 1 ? "," : ""}${l.trail}`)
        .map((line, k) => (k === 0 ? line : (parts[2 * k - 1] ?? eol) + line))
        .join("");
    return { edit: to === region ? null : { start, end: start + region.length, to } };
}

/* Aplica no disco os `fix` que as regras anexaram aos erros de ctx. Cada fix é
     { el, attr, value }     troca o valor do atributo;
     { el, value }           troca o texto do elemento;
     { orphan, cls, from }   seta que sobra (numa seção que não deve ter);
     { missing, cls, to }    seta que falta (numa seção que deve ter);
     { list }                a lista que o SECTIONS deveria ter (veja sectionListEdit).
   Imprime o que reescreveu e o que não deu para corrigir. Devolve quantas mudanças fez
   (0 = nada a fazer, o check pode seguir com o que já leu). `pass` é a volta (1 = primeira). */
export function applyFixes(ctx, { ATTR_RE }, pass = 1) {
    const perFile = new Map();
    const skipped = [];
    const where = (p) => `${p.file}:${p.line}: [${p.rule}]`;
    const idOf = (el) => `#${el.attrs.id || el.tag}`;
    const add = (p, edit, msg) => {
        if (!perFile.has(p.file)) {
            perFile.set(p.file, new Map());
        }
        perFile.get(p.file).set(`${edit.start}:${edit.end}`, { ...edit, msg: `${where(p)} ${msg}` });
    };
    const errors = ctx.problems.filter((p) => p.level === "erro" && p.fix);

    /* valores errados em elementos que existem */
    errors.filter((p) => p.fix.el).forEach((p) => {
        const { el, attr, value } = p.fix;
        const text = ctx.source(p.file).text;
        if (el.generated) {
            skipped.push(`${where(p)} o elemento vem do <${el.generated}> (components.js); corrija lá: ${p.msg}`);
            return;
        }
        const edit = attr ? attrEdit(text, el, attr, value, ATTR_RE) : textEdit(text, el, value);
        if (!edit) {
            skipped.push(attr
                ? `${where(p)} <${el.tag}> não tem o atributo ${attr}; o fix não cria atributos (copie de outra seção): ${p.msg}`
                : `${where(p)} <${el.tag}> não é só texto; o fix não mexe: ${p.msg}`);
        } else if (text.slice(edit.start, edit.end) !== edit.to) {
            add(p, edit, p.msg);
        }
    });

    /* SECTIONS do components.js: reordena pelo <main> e acrescenta a linha da seção nova; linha
       a mais o fix não apaga, só avisa (e ela vai para o fim) */
    errors.filter((p) => p.fix.list).forEach((p) => {
        const plan = p.fix.list;
        plan.extras.forEach((item) => {
            skipped.push(`${where(p)} SECTIONS: "${item.id}" (components.js:${item.line}) não tem seção no index.html; o fix não apaga linhas: apague-a à mão (ou crie a seção)`);
        });
        if (plan.blocked.length) {
            skipped.push(`${where(p)} SECTIONS: sem rótulo para ${plan.blocked.map((id) => `#${id}`).join(", ")} (a seção não tem kicker no index.html); o fix não mexeu na lista`);
            return;
        }
        const { edit, reason } = sectionListEdit(ctx.source(p.file).text, plan);
        if (reason) {
            skipped.push(`${where(p)} SECTIONS: ${reason}`);
        } else if (edit) {
            const added = plan.order.filter((o) => !o.item);
            const kept = plan.order.filter((o) => o.item);
            const keptNow = plan.items.filter((item) => kept.some((o) => o.item === item));
            const said = [];
            if (added.length) {
                said.push(`acrescentei ${added.map((o) => `{ id: "${o.id}", label: "${o.label}" }`).join(", ")}`);
            }
            if (keptNow.some((item, k) => item !== kept[k].item)) {
                said.push("reordenei as linhas pela ordem do <main>");
            }
            add(p, edit, `SECTIONS: ${said.length ? said.join("; ") : "levei as linhas a mais para o fim da lista"}`);
        }
    });

    /* seta que sobra × seta que falta, da mesma classe: 1 para 1, move a linha */
    new Set(errors.filter((p) => p.fix.cls).map((p) => p.fix.cls)).forEach((cls) => {
        const orphans = errors.filter((p) => p.fix.orphan && p.fix.cls === cls);
        const missing = errors.filter((p) => p.fix.missing && p.fix.cls === cls);
        if (orphans.length !== 1 || missing.length !== 1 || orphans[0].file !== missing[0].file) {
            return;
        }
        const [o] = orphans;
        const [m] = missing;
        const edits = o.fix.orphan.generated || m.fix.to.generated ? null : moveEdits(ctx.source(o.file).text, o.fix.orphan, m.fix.to);
        const move = `a seta .${cls} de ${idOf(o.fix.from)} para ${idOf(m.fix.to)}`;
        if (edits) {
            edits.forEach((edit) => add(o, edit, `moveu ${move}`));
        } else {
            skipped.push(`${where(o)} não consegui mover ${move} (o <p> e o </section> precisam estar em linhas inteiras); mova à mão`);
        }
    });

    let changed = 0;
    perFile.forEach((byPos, file) => {
        const edits = [...byPos.values()].sort((a, b) => a.start - b.start);
        let text = ctx.source(file).text;
        [...edits].reverse().forEach((e) => {
            text = text.slice(0, e.start) + e.to + text.slice(e.end);
        });
        writeFileSync(join(ctx.root, file), text, "utf8");
        /* mover = duas edições (tira e põe) com a mesma mensagem: conta e mostra uma vez */
        const shown = [...new Set(edits.map((e) => e.msg))];
        console.log(`fix: ${file} — ${shown.length} ${shown.length === 1 ? "correção" : "correções"}${pass > 1 ? ` (volta ${pass}: o que a anterior moveu)` : ""}`);
        shown.forEach((msg) => console.log(`  corrigido ${msg}`));
        changed += shown.length;
    });

    if (skipped.length && pass === 1) {
        console.log(`fix: ${skipped.length} sem como corrigir`);
        skipped.forEach((s) => console.log(`  ${s}`));
    }
    if (pass === 1 && !changed && !skipped.length) {
        const pending = ctx.problems.some((p) => p.level === "erro" && (p.rule === "numeracao" || p.rule === "secoes" || p.rule === "lista-secoes"));
        console.log(pending
            ? "fix: nenhum valor para trocar; o que sobrou é à mão (veja abaixo)"
            : "fix: nada para corrigir (a numeração e o SECTIONS já batem com a ordem das seções)");
    }
    return changed;
}

/* Texto de ajuda para o que o --fix não resolve sozinho (depois do check normal), ou "". */
export function leftoverHint(errors) {
    const out = [];
    const mine = errors.filter((e) => e.rule === "numeracao");
    if (mine.length) {
        const ids = [...new Set(mine.flatMap((e) => [...e.msg.matchAll(/#([\w-]+)/g)].map((m) => `#${m[1]}`)))];
        out.push(
            `fix: ${mine.length} ${mine.length === 1 ? "erro" : "erros"} [numeracao] acima ${mine.length === 1 ? "pede" : "pedem"} HTML que falta ou sobra${ids.length ? ` (${ids.join(", ")})` : ""}; o --fix não cria nem apaga HTML.`,
            "  Ele só troca valores e move a seta que sobra para a que falta (1 para 1).",
            "  Como resolver: copie o kicker e as setas de outra seção do index.html (o mais seguro é copiar a seção inteira, de",
            '  <section id="sobre" …> até </section>): <p class="kicker"><span>NN</span>Rótulo</p> perto do título; <p class="section-step step-prev">',
            "  no início e step-next no fim (a primeira seção não tem step-prev, a última não tem step-next), cada uma com",
            '  <a class="step-link" href aria-label title>. Ajuste id e textos e rode npm run fix de novo: ele acerta números, destinos e rótulos.'
        );
    }
    if (errors.some((e) => e.rule === "secoes")) {
        out.push("fix: o --fix nunca mexe em data-scene (é o id da formação 3D da seção, não a posição): cada seção leva o seu, único, de 0 a N-1, e o hero leva 0. Acerte à mão os erros [secoes] acima.");
    }
    if (errors.some((e) => e.rule === "lista-secoes")) {
        out.push("fix: no SECTIONS do components.js o --fix só reordena as linhas e acrescenta a da seção nova; não apaga linha a mais nem troca rótulo (o rótulo é o do kicker da seção). Acerte à mão os erros [lista-secoes] acima.");
    }
    if (errors.some((e) => e.rule === "menus")) {
        out.push("fix: o --fix não mexe em menus escritos à mão (site-nav, menu-nav); os do <site-header> seguem o SECTIONS (veja [lista-secoes]). Acerte à mão os itens dos erros [menus] acima.");
    }
    return out.join("\n");
}
