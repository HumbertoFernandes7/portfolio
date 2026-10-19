#!/usr/bin/env node
/* ============================================================
   Comparação visual A/B: uma ref base (padrão origin/main) × a árvore atual.

   Uso:   node tools/ab.mjs [ref] [--no-fetch] [-- argumentos extras do playwright]
          npm run ab
          npm run ab -- origin/main -- --grep certificados

   1. cria (ou atualiza) o git worktree da base em .ab/base (detached, na ref pedida);
   2. roda tests/ab.spec.mjs servindo .ab/base e grava os snapshots em .ab/snapshots;
   3. roda de novo servindo a árvore atual, comparando com esses snapshots;
   4. confirmação, só dos testes que diferiram, em até 3 tentativas. Cada tentativa captura a
      base de novo (uma pasta de snapshots por captura: .ab/snapshots-1, -2, -3; a da etapa 2
      é a .ab/snapshots) e compara a versão nova, capturada de novo a cada comparação, com
      TODAS as capturas da base que já existem, a mais nova primeiro. Basta UM par de capturas
      idênticas entre as variantes da base e as da versão nova para o teste valer como igual
      (aparece como instável); só conta como diferença o que diferir em todos os pares, da 1ª
      comparação e de todas as tentativas. Motivo: o raster de texto do Chromium sem GPU solta
      variações de antialiasing (bordas de letras em Fraunces, cabeçalho rolado) que, às vezes,
      se repetem numa segunda comparação; o main contra ele mesmo já deu essa diferença.
      O limiar de pixels é o do playwright.config.mjs, igual em toda comparação: repetir a
      captura não afrouxa nada, só dá mais chances de achar o par que o ruído separou. Uma
      diferença real (pixel que mudou de verdade) falha em todos os pares e é confirmada, à
      custa de ~3 capturas da base e ~9 comparações a mais (10 testes: uns 4 minutos no total);
   5. mostra onde ficam as diferenças (.ab/results e o relatório em .ab/report, os da última
      comparação).
   Sai com código 1 se houver diferença confirmada.
   ============================================================ */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const started = Date.now();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AB_DIR = join(ROOT, ".ab");
const BASE = join(AB_DIR, "base");
const RESULTS = join(AB_DIR, "results");
const FIRST_RESULTS = join(AB_DIR, "results-1a-comparacao");
const LAST_RUN = join(AB_DIR, "last-run.json"); /* reporter json do playwright.config.mjs */
const SNAPSHOTS = join(AB_DIR, "snapshots");
const ATTEMPTS = 3; /* tentativas de confirmação (etapa 4) */
const snapshotsOf = (attempt) => join(AB_DIR, `snapshots-${attempt}`);
const CLI = createRequire(import.meta.url).resolve("@playwright/test/cli");

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const own = sep === -1 ? argv : argv.slice(0, sep);
const extra = sep === -1 ? [] : argv.slice(sep + 1);
const ref = own.find((a) => !a.startsWith("-")) || "origin/main";
const fetch = !own.includes("--no-fetch");

const rel = (p) => relative(ROOT, p).replaceAll("\\", "/") || ".";
const say = (msg) => console.log(`\nab: ${msg}`);
const fail = (msg) => {
    console.error(`\nab: ${msg}`);
    process.exit(1);
};

const git = (args, { cwd = ROOT, allowFail = false } = {}) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0 && !allowFail) {
        fail(`git ${args.join(" ")} falhou:\n${(r.stderr || r.stdout || "").trim()}`);
    }
    return r;
};

/* ---------- 1. worktree da base ---------- */

if (fetch && ref.startsWith("origin/")) {
    const branch = ref.slice("origin/".length);
    const r = git(["fetch", "--quiet", "origin", branch], { allowFail: true });
    if (r.status !== 0) {
        console.warn(`ab: git fetch origin ${branch} falhou; sigo com a ${ref} local.\n${r.stderr.trim()}`);
    }
}
const sha = git(["rev-parse", "--verify", `${ref}^{commit}`]).stdout.trim();
const label = `${ref} (${sha.slice(0, 7)})`;

git(["worktree", "prune"]);
if (existsSync(BASE)) {
    if (!existsSync(join(BASE, ".git"))) {
        fail(`${rel(BASE)} existe mas não é um worktree do git; apague a pasta e rode de novo.`);
    }
    git(["checkout", "--quiet", "--force", "--detach", sha], { cwd: BASE });
} else {
    git(["worktree", "add", "--quiet", "--force", "--detach", BASE, sha]);
}
say(`base = ${label} em ${rel(BASE)}`);

/* ---------- 2 a 4. rodadas ---------- */

[
    "snapshots",
    ...Array.from({ length: ATTEMPTS }, (_, i) => `snapshots-${i + 1}`),
    "results",
    "report",
    "results-1a-comparacao",
    "last-run.json"
].forEach((name) => rmSync(join(AB_DIR, name), { recursive: true, force: true }));

/* `snapshots`: a pasta de snapshots desta rodada (grava com "all", compara com "none") */
const run = (siteDir, updateSnapshots, filter = [], snapshots = SNAPSHOTS) =>
    spawnSync(process.execPath, [CLI, "test", `--update-snapshots=${updateSnapshots}`, ...extra, ...filter], {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, AB: "1", SITE_DIR: siteDir, AB_SNAPSHOTS: rel(snapshots), PORT: process.env.PORT || "4392" }
    }).status;

/* títulos ("describe teste") dos testes que falharam na última rodada, lidos do reporter json */
const failedTitles = () => {
    if (!existsSync(LAST_RUN)) {
        return [];
    }
    const out = [];
    const walk = (suite, path) => {
        (suite.specs || []).forEach((spec) => {
            if (!spec.ok) {
                out.push([...path, spec.title].join(" "));
            }
        });
        (suite.suites || []).forEach((child) => walk(child, [...path, child.title]));
    };
    (JSON.parse(readFileSync(LAST_RUN, "utf8")).suites || []).forEach((file) => walk(file, []));
    return out;
};
const grepFor = (titles) => ["--grep", titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")];

say(`1/2 gravando os snapshots da base em ${rel(SNAPSHOTS)}…`);
if (run(BASE, "all") !== 0) {
    fail("a rodada da base falhou (veja acima); nada foi comparado.");
}

say("2/2 comparando a árvore atual com a base…");
let ok = run(ROOT, "none") === 0;
let unstable = []; /* [título, onde bateu]: diferiu na 1ª comparação e depois bateu */
let against = SNAPSHOTS; /* a captura da base da última comparação (as evidências são dela) */
let attempts = 0;

if (!ok) {
    const first = failedTitles();
    if (!first.length) {
        fail("a comparação falhou sem teste reprovado (veja acima).");
    }
    cpSync(RESULTS, FIRST_RESULTS, { recursive: true });
    say(`confirmando ${first.length} diferença(s): até ${ATTEMPTS} tentativas de captura da base e da versão nova…`);
    let failing = first;
    const bases = [SNAPSHOTS]; /* capturas da base, a mais nova na frente */
    for (let attempt = 1; attempt <= ATTEMPTS && failing.length; attempt++) {
        attempts = attempt;
        const dir = snapshotsOf(attempt);
        say(`tentativa ${attempt}/${ATTEMPTS}: nova captura da base de ${failing.length} teste(s) em ${rel(dir)}…`);
        if (run(BASE, "all", grepFor(failing), dir) !== 0) {
            fail("a captura da base na confirmação falhou (veja acima).");
        }
        bases.unshift(dir);
        for (const snap of bases) {
            if (!failing.length) {
                break;
            }
            say(`  versão nova (captura nova) contra ${rel(snap)}, ${failing.length} teste(s)…`);
            against = snap;
            const passed = run(ROOT, "none", grepFor(failing), snap) === 0;
            const still = passed ? [] : failedTitles();
            if (!passed && !still.length) {
                fail("a comparação falhou sem teste reprovado (veja acima).");
            }
            failing.filter((t) => !still.includes(t)).forEach((t) => {
                unstable.push([t, `${attempt}ª tentativa, contra ${rel(snap)}`]);
            });
            failing = failing.filter((t) => still.includes(t));
        }
    }
    ok = !failing.length;
}

/* ---------- 5. resumo ---------- */

const walk = (dir) =>
    existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
        )
        : [];

const seconds = Math.round((Date.now() - started) / 1000);
if (unstable.length) {
    console.log("\nab: instável (diferiu na 1ª comparação e, na confirmação, bateu com alguma captura da base):");
    unstable.forEach(([title, where]) => console.log(`    ${title} — ${where}`));
    console.log(`    evidência da 1ª comparação: ${rel(FIRST_RESULTS)}`);
}
if (ok) {
    say(`idêntico à base ${label} — ${seconds} s`);
    process.exit(0);
}

const evidence = walk(RESULTS).filter((f) => /-(diff|actual)\.[^/\\]+$/.test(f));
say(`DIFERENTE da base ${label} — diferiu em todas as comparações (a 1ª e ${attempts} tentativas de confirmação) — ${seconds} s`);
if (evidence.length) {
    console.log("   arquivos com a diferença (*-diff.png marca os pixels; *-actual.* é a árvore atual):");
    evidence.forEach((f) => console.log(`     ${rel(f)}`));
}
console.log(`   snapshots da base: ${rel(against)} (os da última comparação)`);
console.log(`   resultados:        ${rel(RESULTS)}`);
console.log("   lado a lado:       npx playwright show-report .ab/report");
process.exit(1);
