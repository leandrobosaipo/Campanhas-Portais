#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const nodeBin = process.execPath;
const captureScript = path.join(repoRoot, "scripts/src/capture-insertion-proof.cjs");
const pythonBin =
  process.env.ADOPS_CAPTURE_PYTHON ||
  "/Users/leandrobosaipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const downloadsRoot = "/Users/leandrobosaipo/Downloads";
const today = process.env.ADOPS_PACKAGE_DATE || "2026-06-25";
const govFazSauMediaUrl = "https://roonoticias.nyc3.digitaloceanspaces.com/app/uploads/2026/06/08154434/banner_site_825x120-sau-5.gif";
const govFazSauMediaSha256 = "3c909c30bd21355e8ac9d25dad4496861bbbcb913780573c0f8c28e2f35bac34";

function rangeDates(start, end) {
  const out = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function buildRetroCaptureAt(dateKey, insertionId) {
  const seed = `${dateKey}:${insertionId}`;
  let hash = 0;
  const start = 18 * 60;
  const end = 22 * 60;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % (end - start);
  }
  const totalMinutes = start + hash;
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minute = String(totalMinutes % 60).padStart(2, "0");
  return `${dateKey}T${hour}:${minute}:00-04:00`;
}

const insertions = {
  1456: {
    id: 1456,
    campanhaId: 905,
    campanhaName: "CIDADANIA",
    campanhaNome: "CIDADANIA",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "16483 - ALMT",
    clienteNome: "ALMT",
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-04",
    periodoFim: "2026-06-24",
    mediaUrl: "https://cdn.perrenguematogrosso.com/app/uploads/2026/06/825x120-almt-1.gif",
    evidences: [],
  },
  1457: {
    id: 1457,
    campanhaId: 905,
    campanhaName: "CIDADANIA",
    campanhaNome: "CIDADANIA",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "16483 - ALMT",
    clienteNome: "ALMT",
    localFormato: "VIDEO",
    localFormatoNormalizado: "VIDEO",
    periodoInicio: "2026-06-04",
    periodoFim: "2026-06-15",
    mediaUrl: "https://cdn.perrenguematogrosso.com/app/uploads/2026/06/pi-16483-cidadania-almt-vt.mp4",
    evidences: [],
  },
  1464: {
    id: 1464,
    campanhaId: 907,
    campanhaName: "GOVERNO FAZ",
    campanhaNome: "GOVERNO FAZ",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "25206186 - GOV",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-04",
    periodoFim: "2026-06-23",
    mediaUrl: "https://admin.perrenguematogrosso.com/app/uploads/2026/06/_banner_site_825x120-sau.gif",
    evidences: [],
  },
  1474: {
    id: 1474,
    campanhaId: null,
    campanhaName: "GOVERNO FAZ",
    campanhaNome: "GOVERNO FAZ",
    competencia: "JUNHO-2026",
    siteSigla: "AFL",
    piCodigo: "PI 25206206 - GOV",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-08",
    periodoFim: "2026-06-25",
    mediaUrl: govFazSauMediaUrl,
    evidences: [],
  },
  1527: {
    id: 1527,
    campanhaId: null,
    campanhaName: "GOVERNO DE MATO GROSSO FAZ",
    campanhaNome: "GOVERNO DE MATO GROSSO FAZ",
    competencia: "JUNHO-2026",
    siteSigla: "AFL",
    piCodigo: "25206206",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER TOPO - 825x120px DIARIA",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-01",
    periodoFim: "2026-06-30",
    mediaUrl: null,
    evidences: [],
  },
  1576: {
    id: 1576,
    campanhaId: 924,
    campanhaName: "MULTIRAO PREF CBA",
    campanhaNome: "MULTIRAO PREF CBA",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "PI 14579",
    clienteNome: "PREFEITURA DE CUIABA",
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-11",
    periodoFim: "2026-06-30",
    mediaUrl: "https://cdn.perrenguematogrosso.com/app/uploads/2026/06/multirao-pref-cba-825x120.gif",
    evidences: [],
  },
  1577: {
    id: 1577,
    campanhaId: 924,
    campanhaName: "MULTIRAO PREF CBA",
    campanhaNome: "MULTIRAO PREF CBA",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "PI 14579",
    clienteNome: "PREFEITURA DE CUIABA",
    localFormato: "VIDEO",
    localFormatoNormalizado: "VIDEO",
    periodoInicio: "2026-06-11",
    periodoFim: "2026-06-30",
    mediaUrl: "https://cdn.perrenguematogrosso.com/app/uploads/2026/06/multirao-pref-cba-video-30s.mp4",
    evidences: [],
  },
  1635: {
    id: 1635,
    campanhaId: 934,
    campanhaName: "ANIVERSARIO DE VG",
    campanhaNome: "ANIVERSARIO DE VG",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "672",
    clienteNome: "PREFEITURA DE VARZEA GRANDE",
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-15",
    periodoFim: "2026-06-30",
    mediaUrl: "https://cod5.nyc3.digitaloceanspaces.com/adops-media/perrengue/2026-06/vg-topo-825x120.gif",
    evidences: [],
  },
  1636: {
    id: 1636,
    campanhaId: 934,
    campanhaName: "ANIVERSARIO DE VG",
    campanhaNome: "ANIVERSARIO DE VG",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "672",
    clienteNome: "PREFEITURA DE VARZEA GRANDE",
    localFormato: "POP UP",
    localFormatoNormalizado: "POP UP",
    periodoInicio: "2026-06-15",
    periodoFim: "2026-06-22",
    mediaUrl: "https://cod5.nyc3.digitaloceanspaces.com/adops-media/perrengue/2026-06/vg-popup-970x90.gif",
    evidences: [],
  },
  1660: {
    id: 1660,
    campanhaId: 941,
    campanhaName: "VACINACAO",
    campanhaNome: "VACINACAO",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "90402 - PREF PVA",
    clienteNome: "PREFEITURA DE PRIMAVERA DO LESTE",
    localFormato: "INTERNO DE NOTICIA",
    localFormatoNormalizado: "INTERNO DE NOTICIA",
    periodoInicio: "2026-06-17",
    periodoFim: "2026-06-30",
    mediaUrl: "https://cdn.perrenguematogrosso.com/app/uploads/2026/06/pi-90402-vacinacao-728x90-pva-junho.gif",
    evidences: [],
  },
  1661: {
    id: 1661,
    campanhaId: 942,
    campanhaName: "CAMARA FAZ",
    campanhaNome: "CAMARA FAZ",
    competencia: "JUNHO-2026",
    siteSigla: "PERRENGUE",
    piCodigo: "90438 - CAMARA CBA",
    clienteNome: "CAMARA MUNICIPAL DE CUIABA",
    localFormato: "POP UP",
    localFormatoNormalizado: "POP UP",
    periodoInicio: "2026-06-19",
    periodoFim: "2026-06-30",
    mediaUrl: "https://cdn.perrenguematogrosso.com/app/uploads/2026/06/pi-90438-camara-faz-popup-970x90.gif",
    evidences: [],
  },
  1650: {
    id: 1650,
    campanhaId: 939,
    campanhaName: "VACINACAO",
    campanhaNome: "VACINACAO",
    competencia: "JUNHO-2026",
    siteSigla: "AFL",
    piCodigo: "PI 90391 - PREF PVA",
    clienteNome: "PREFEITURA DE PRIMAVERA DO LESTE",
    localFormato: "BANNER INTERNO NOTICIAS",
    localFormatoNormalizado: "INTERNO DE NOTICIAS",
    periodoInicio: "2026-06-17",
    periodoFim: "2026-06-30",
    mediaUrl: "https://perrenguematogrosso.nyc3.cdn.digitaloceanspaces.com/adops-media/afl/2026-06/728x90.gif",
    evidences: [],
  },
  252060931: {
    id: 252060931,
    campanhaId: null,
    campanhaName: "FEMINICIDIO",
    campanhaNome: "FEMINICIDIO",
    competencia: "JUNHO-2026",
    siteSigla: "PPMT",
    piCodigo: "PI 25206093 - GOV",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER HOME 1",
    localFormatoNormalizado: "MEGABANNER HOME 1",
    periodoInicio: "2026-06-18",
    periodoFim: "2026-06-30",
    mediaUrl: "https://portalpantanalmt.nyc3.digitaloceanspaces.com/app/uploads/2026/06/18230818/enfrentamento_ao_feminicidio_e_a_violencia_domestica_670X90-4.gif",
    evidences: [],
  },
  252060932: {
    id: 252060932,
    campanhaId: null,
    campanhaName: "FEMINICIDIO",
    campanhaNome: "FEMINICIDIO",
    competencia: "JUNHO-2026",
    siteSigla: "PPMT",
    piCodigo: "PI 25206093 - GOV",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER HOME 2",
    localFormatoNormalizado: "MEGABANNER HOME 2",
    periodoInicio: "2026-06-26",
    periodoFim: "2026-06-30",
    mediaUrl: "https://portalpantanalmt.nyc3.digitaloceanspaces.com/app/uploads/2026/06/18230818/enfrentamento_ao_feminicidio_e_a_violencia_domestica_670X90-4.gif",
    evidences: [],
  },
};

const packages = [
  {
    slug: `PERRENGUE-PI-14579-MULTIRAO-retroativos-oficial-${today}`,
    title: "PERRENGUE - PI 14579 - MULTIRAO PREF CBA",
    site: "PERRENGUE",
    pi: "14579",
    campaign: "MULTIRAO PREF CBA",
    insertions: [
      { insertionId: 1576, dates: rangeDates("2026-06-11", "2026-06-30") },
      { insertionId: 1577, dates: rangeDates("2026-06-11", "2026-06-30") },
    ],
    discoveryNotes: [
      "Drive confirmou PI 14579, Perrengue Mato Grosso, periodo 11/06/2026 a 30/06/2026, com MEGABANNER TOPO 825x120 e PUBLI VIDEO 30s.",
      "Pasta Drive PI 14579 contem 825x120 cuiaba.gif e PREFEITURA DE CUIABA - Mutirao Fiscal A Sem claquete.mp4.",
      "Midias publicas validadas no CDN Perrengue: multirao-pref-cba-825x120.gif e multirao-pref-cba-video-30s.mp4.",
      "Para VIDEO, o checklist exige hover/controles/progresso visivel e tempo variado por data.",
    ],
  },
  {
    slug: `PERRENGUE-PI-672-PREF-VG-retroativos-oficial-${today}`,
    title: "PERRENGUE - PI 672 - PREF VG",
    site: "PERRENGUE",
    pi: "672",
    campaign: "ANIVERSARIO DE VG",
    insertions: [
      { insertionId: 1635, dates: rangeDates("2026-06-15", "2026-06-30") },
      { insertionId: 1636, dates: rangeDates("2026-06-15", "2026-06-22") },
    ],
    discoveryNotes: [
      "Usuario mencionou VIDEO E TOPO, mas planilha e AdOps confirmam TOPO + POP UP para PI 672.",
      "Nao foi encontrada prova documental de video para esta PI; gerar video neste estado seria evidencia falsa.",
      "Midias confirmadas: vg-topo-825x120.gif e vg-popup-970x90.gif.",
    ],
    excludedInsertions: [
      {
        insertionId: "video",
        reason: "formato solicitado pelo usuario, mas nao confirmado por PDF/Drive/planilha/AdOps nesta descoberta.",
      },
    ],
  },
  {
    slug: `PERRENGUE-PI-90402-VACINACAO-retroativos-oficial-${today}`,
    title: "PERRENGUE - PI 90402 - VACINACAO",
    site: "PERRENGUE",
    pi: "90402",
    campaign: "VACINACAO",
    insertions: [
      { insertionId: 1660, dates: rangeDates("2026-06-17", "2026-06-30") },
    ],
    discoveryNotes: [
      "Drive confirmou PI 90402, SITE PERRENGUE MATO GROSSO, VACINACAO, BANNER INTERNO NOTICIAS 728x90, periodo 17/06 a 30/06.",
      "Midia publica validada: pi-90402-vacinacao-728x90-pva-junho.gif.",
      "Checklist usa pagina interna e slot .g.g-11 conforme config/adrotate-sites.json.",
    ],
  },
  {
    slug: `PERRENGUE-PI-90438-CAMARA-POP-UP-autorizado-${today}`,
    title: "PERRENGUE - PI 90438 - CAMARA FAZ",
    site: "PERRENGUE",
    pi: "90438",
    campaign: "CAMARA FAZ",
    insertions: [
      { insertionId: 1661, dates: rangeDates("2026-06-19", "2026-06-30") },
    ],
    discoveryNotes: [
      "Excecao autorizada formalmente pelo usuario em 2026-07-01: gerar evidencia como POP UP 970x90, divergindo da PI que exigia MEGABANNER TOPO 825x120.",
      "Drive conferido: pasta PI 90438 - CAMARA FAZ contem PDF da PI, evidencias antigas e 970x90 pop up (1).gif; nao foi encontrado criativo topo 825x120.",
      "AdOps/AdRotate/live HTML disponiveis confirmam POP UP 970x90 na insercao 1661, campanha 942, grupo 9.",
      "Midia publica validada: pi-90438-camara-faz-popup-970x90.gif.",
    ],
  },
  {
    slug: `AFL-PI-90391-VACINACAO-retroativos-oficial-${today}`,
    title: "AFL - PI 90391 - VACINACAO",
    site: "AFL",
    pi: "90391",
    campaign: "VACINACAO",
    insertions: [
      { insertionId: 1650, dates: rangeDates("2026-06-17", "2026-06-30") },
    ],
    discoveryNotes: [
      "Drive confirmou PI 90391, SITE A FOLHA LIVRE, VACINACAO, BANNER INTERNO NOTICIAS 728x90, periodo 17/06 a 30/06.",
      "Pasta Drive 90391 contem o criativo 728x90.gif; a URL publica equivalente no host AFL retornou 404.",
      "Para esta geracao, o arquivo bruto do Drive foi servido localmente em http://127.0.0.1:18792/728x90.gif para manter a arte canonica sem depender do CDN quebrado.",
    ],
  },
  {
    slug: `PPMT-PI-25206093-FEMINICIDIO-retroativos-oficial-${today}`,
    title: "PPMT - PI 25206093 - FEMINICIDIO",
    site: "PPMT",
    pi: "25206093",
    campaign: "FEMINICIDIO",
    insertions: [
      { insertionId: 252060931, dates: rangeDates("2026-06-18", "2026-06-30") },
      { insertionId: 252060932, dates: rangeDates("2026-06-26", "2026-06-30") },
    ],
    discoveryNotes: [
      "Drive confirmou PI_25206093_SITE_PORTAL_PANTANAL_JUN_VEICULO.pdf, Portal Pantanal MT, FEMINICIDIO.",
      "HOME 1 670x90: 18/06 a 30/06. HOME 2 670x90: 26/06 a 30/06.",
      "HTML publico do Portal Pantanal mostra a midia nos slots .g.g-2 e .g.g-3.",
      "API privada nao retornou insercao 25206093; pacote usa fallback local rastreavel por Drive, planilha, HTML publico e Spaces.",
    ],
  },
  {
    slug: `AFL-PI-25206206-GOV-FAZ-retroativos-oficial-${today}`,
    title: "AFL - PI 25206206 - GOV FAZ",
    site: "AFL",
    pi: "25206206",
    campaign: "GOVERNO FAZ",
    insertions: [
      { insertionId: 1474, dates: rangeDates("2026-06-08", "2026-06-25") },
    ],
    discoveryNotes: [
      "Google Drive confirmou PI_25206206_SITE_A_FOLHA_LIVRE_JUN_VEICULO.pdf: SITE A FOLHA LIVRE, GOVERNO DE MATO GROSSO FAZ, MEGABANNER TOPO - 825x120px DIARIA, periodo 08/06 a 25/06.",
      "A pasta da PI contem _banner_site_825x120-sau (6).gif. O arquivo tem 41.299 bytes, GIF 825x120 e sha256 3c909c30bd21355e8ac9d25dad4496861bbbcb913780573c0f8c28e2f35bac34.",
      "A URL publica usada em ROO para GOV FAZ, banner_site_825x120-sau-5.gif, tem o mesmo tamanho e o mesmo sha256 do arquivo da PI AFL. Ela foi usada como mediaUrl publica porque as tentativas equivalentes no host AFL retornaram 404.",
    ],
    excludedInsertions: [
      {
        insertionId: 1527,
        reason: "duplicada/suspeita para o pacote final: periodo 01/06 a 30/06 sem mediaUrl, enquanto a PI oficial da pasta Drive define 08/06 a 25/06 e a insercao 1474 bate com esse periodo.",
      },
    ],
  },
  {
    slug: `PERRENGUE-PI-16483-ALMT-CIDADANIA-VIDEO-retroativos-controles-oficial-${today}`,
    title: "PERRENGUE - PI 16483 - ALMT - CIDADANIA - VIDEO",
    site: "PERRENGUE",
    pi: "16483",
    campaign: "CIDADANIA",
    videoOnly: true,
    insertions: [
      { insertionId: 1457, dates: rangeDates("2026-06-04", "2026-06-15") },
    ],
  },
  {
    slug: `PERRENGUE-PI-16483-ALMT-CIDADANIA-retroativos-oficial-${today}`,
    title: "PERRENGUE - PI 16483 - ALMT - CIDADANIA",
    site: "PERRENGUE",
    pi: "16483",
    campaign: "CIDADANIA",
    insertions: [
      { insertionId: 1456, dates: rangeDates("2026-06-04", "2026-06-24") },
      { insertionId: 1457, dates: rangeDates("2026-06-04", "2026-06-15") },
    ],
  },
  {
    slug: `PERRENGUE-PI-25206186-GOV-FAZ-retroativos-dia-16-em-diante-oficial-${today}`,
    title: "PERRENGUE - PI 25206186 - GOV FAZ",
    site: "PERRENGUE",
    pi: "25206186",
    campaign: "GOVERNO FAZ",
    insertions: [
      { insertionId: 1464, dates: rangeDates("2026-06-16", "2026-06-23") },
    ],
  },
  {
    slug: `ROO-PI-25206206-GOV-FAZ-retroativos-oficial-${today}`,
    title: "ROO - PI 25206206 - GOV FAZ",
    site: "ROO",
    pi: "25206206",
    campaign: "GOVERNO FAZ",
    anti404: true,
    insertions: [],
    blockedDiscovery: {
      status: "blocked_no_canonical_roo_insertion",
      reason: "A API privada retornou PI 25206206 apenas para AFL (insercoes 1474/1527, sem mediaUrl). No ROO, a midia GOV FAZ publicada e a insercao auditada correspondem a PI 25206207/insercao 1472.",
      checkedAt: "2026-06-25T20:00:22-04:00",
      publicApiStatus: 521,
      privateApiStatus: 200,
      liveRooCreative: "https://roonoticias.nyc3.digitaloceanspaces.com/app/uploads/2026/06/08154434/banner_site_825x120-sau-5.gif",
      canonicalConflicts: [
        {
          insertionId: 1474,
          siteSigla: "AFL",
          piCodigo: "PI 25206206 - GOV",
          periodoInicio: "2026-06-08",
          periodoFim: "2026-06-25",
          mediaUrl: null,
        },
        {
          insertionId: 1527,
          siteSigla: "AFL",
          piCodigo: "25206206",
          periodoInicio: "2026-06-01",
          periodoFim: "2026-06-30",
          mediaUrl: null,
        },
        {
          insertionId: 1472,
          siteSigla: "ROO",
          piCodigo: "PI 25206207 - GOV",
          periodoInicio: "2026-06-08",
          periodoFim: "2026-06-23",
          mediaUrl: "https://roonoticias.nyc3.digitaloceanspaces.com/app/uploads/2026/06/08154434/banner_site_825x120-sau-5.gif",
        },
      ],
    },
  },
];

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function startLocalApi() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const insertionMatch = url.pathname.match(/^\/api\/insertions\/(\d+)$/);
    if (insertionMatch) {
      const insertion = insertions[Number(insertionMatch[1])];
      if (!insertion) return jsonResponse(res, 404, { error: "not_found" });
      return jsonResponse(res, 200, insertion);
    }
    if (url.pathname.startsWith("/api/capture-rules/runtime")) {
      return jsonResponse(res, 404, { error: "use_local_adrotate_sites_mapping" });
    }
    if (url.pathname.includes("/capture-proof/status")) {
      return jsonResponse(res, 200, { status: "audited", auditOk: true, issues: [] });
    }
    return jsonResponse(res, 404, { error: "not_found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, apiBase: `http://127.0.0.1:${address.port}/api` };
}

async function mkdirClean(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function sha256(file) {
  const buffer = await fs.readFile(file);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

function compact(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function configuredSlotSelectorFor(insertion) {
  if (insertion.siteSigla === "ROO" && insertion.localFormatoNormalizado === "MEGABANNER TOPO") {
    return "div.hidden.lg\\:block .g.g-1";
  }
  if (insertion.siteSigla === "PERRENGUE" && insertion.localFormatoNormalizado === "MEGABANNER TOPO") {
    return ".g.g-1";
  }
  if (insertion.siteSigla === "PERRENGUE" && insertion.localFormatoNormalizado === "VIDEO") {
    return ".g.g-6";
  }
  if (insertion.siteSigla === "PERRENGUE" && insertion.localFormatoNormalizado === "POP UP") {
    return "#cod5-bottom-popup-ad .g.g-9";
  }
  if (insertion.siteSigla === "PERRENGUE" && insertion.localFormatoNormalizado === "INTERNO DE NOTICIA") {
    return ".g.g-11";
  }
  if (insertion.siteSigla === "AFL" && insertion.localFormatoNormalizado === "MEGABANNER TOPO") {
    return ".omt-header-top .g.g-1";
  }
  if (insertion.siteSigla === "AFL" && insertion.localFormatoNormalizado === "VIDEO") {
    return ".g.g-6";
  }
  if (insertion.siteSigla === "AFL" && (
    insertion.localFormatoNormalizado === "INTERNO DE NOTICIA" ||
    insertion.localFormatoNormalizado === "INTERNO DE NOTICIAS"
  )) {
    return ".g.g-14";
  }
  if (insertion.siteSigla === "PPMT" && insertion.localFormatoNormalizado === "MEGABANNER HOME 1") {
    return ".g.g-2";
  }
  if (insertion.siteSigla === "PPMT" && insertion.localFormatoNormalizado === "MEGABANNER HOME 2") {
    return ".g.g-3";
  }
  return "";
}

function siteHomeUrl(site) {
  if (site === "ROO") return "https://roonoticias.com/";
  if (site === "PERRENGUE") return "https://perrenguematogrosso.com/";
  if (site === "AFL") return "https://afolhalivre.com/";
  if (site === "PPMT") return "https://portalpantanalmt.com/";
  return "https://perrenguematogrosso.com/";
}

async function probeUrl(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Codex-AdOps-RetroEvidence/official-2026-06-25" },
    });
    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("text/html") ? await response.text() : "";
    return {
      url,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      elapsedMs: Date.now() - startedAt,
      contentType,
      bodyBytes: text ? Buffer.byteLength(text) : null,
      looks404: /404|not found|pagina nao encontrada|p.gina n.o encontrada/i.test(text.slice(0, 8000)),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      finalUrl: null,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function assertOfficialMetadata(meta, pkg, insertion, date) {
  const issues = [];
  const expectedDate = date.split("-").reverse().join("/");
  const expectedMediaName = path.basename(new URL(insertion.mediaUrl).pathname);
  const dynamicFields = Array.isArray(meta.dynamicFields) ? meta.dynamicFields : [];

  if (meta.frameTheme !== "windows11_chrome_real_template") issues.push("frame_theme_not_official");
  if (meta.frameTemplateVersion !== "windows11-chrome-light-similar-v4") issues.push("frame_template_version_invalid");
  if (meta.chromeTopTheme !== "light") issues.push("chrome_top_theme_invalid");
  if (meta.frameStrictAssetsOk !== true) issues.push("frame_assets_not_strict");
  if (!dynamicFields.includes("addressText")) issues.push("address_text_missing");
  if (!dynamicFields.includes("tabSurface")) issues.push("tab_surface_missing");
  if (!dynamicFields.includes("tabTitle")) issues.push("tab_title_missing");
  if (!dynamicFields.includes("tabIcon")) issues.push("tab_icon_missing");
  if (!dynamicFields.includes("systemDateTimeInline")) issues.push("system_datetime_missing");
  if (meta.tabSurfaceRendered !== true) issues.push("tab_surface_not_rendered");
  if (meta.tabTitleRendered !== true) issues.push("tab_title_not_rendered");
  if (meta.tabIconRendered !== true) issues.push("tab_icon_not_rendered");
  if (meta.tabIconFallback === true) issues.push("tab_icon_fallback_used");
  if (meta.scrollbarRendered !== true) issues.push("scrollbar_not_rendered");
  if (!Number.isFinite(Number(meta.scrollbarThumbTop))) issues.push("scrollbar_thumb_top_missing");
  if (!Number.isFinite(Number(meta.scrollbarThumbHeight))) issues.push("scrollbar_thumb_height_missing");
  if (!String(meta.systemDateTime || "").includes(expectedDate)) issues.push("desktop_date_mismatch");
  if (meta.retroGate?.ok !== true) issues.push("retro_gate_failed");
  if (meta.creativePlacementAudit?.ok !== true) issues.push("creative_placement_failed");
  if (meta.finalPngSlotAudit?.ok !== true) issues.push("final_png_slot_failed");
  if (meta.headerAdPolicyAudit?.ok !== true) issues.push("header_policy_failed");
  if (meta.slotVisibility?.mostlyVisible !== true && meta.auditConfig?.requireSlotVisibleInViewport === true) {
    issues.push("slot_not_mostly_visible");
  }
  if (!String(meta.mediaBasename || "").includes(expectedMediaName)) issues.push("media_basename_mismatch");
  if (!String(meta.matchedMediaUrl || meta.mediaUrl || "").includes(expectedMediaName)) issues.push("matched_media_mismatch");
  if (
    pkg.site === "ROO" &&
    meta.slotSelector !== "div.hidden.lg\\:block .g.g-1" &&
    !/^\[data-adops-capture-slot=/.test(String(meta.slotSelector || ""))
  ) {
    issues.push("roo_slot_selector_invalid");
  }
  if (pkg.site === "ROO" && /404|not found|pagina nao encontrada|p.gina n.o encontrada/i.test(JSON.stringify(meta).slice(0, 5000))) {
    issues.push("roo_404_signal_in_metadata");
  }
  if (
    insertion.localFormatoNormalizado === "VIDEO"
  ) {
    const videoProof = meta.videoProof && typeof meta.videoProof === "object" ? meta.videoProof : {};
    const currentTime = Number(videoProof.currentTime ?? 0);
    const duration = Number(videoProof.duration ?? 0);
    const progressVisible = videoProof.progressVisible === true || videoProof.overlayInjected === true;
    if (
      pkg.site === "PERRENGUE" &&
      meta.finalProofStyle !== "viewport_with_slot_inset" &&
      !(meta.finalProofStyle === "viewport_only" && meta.auditInsetSuppressed === true && meta.finalPngSlotAudit?.ok === true)
    ) {
      issues.push("perrengue_video_proof_style_invalid");
    }
    if (videoProof.ok !== true) issues.push("video_proof_not_ok");
    if (videoProof.controls !== true) issues.push("video_controls_not_visible");
    if (!progressVisible) issues.push("video_progress_not_visible");
    if (!(currentTime > 0.5)) issues.push("video_current_time_not_advanced");
    if (!(duration > 0)) issues.push("video_duration_missing");
  }

  return issues;
}

function captureEnvFor(insertion, generatedRoot, apiBase) {
  const env = {
    ...process.env,
    ADOPS_CAPTURE_API_BASE: apiBase,
    ADOPS_GENERATED_PRINTS_ROOT: generatedRoot,
    ADOPS_CAPTURE_PYTHON: pythonBin,
    ADOPS_CAPTURE_DISABLE_ORIGIN_OVERRIDE: "1",
  };
  if (!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && existsSync(chromeExecutable)) {
    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chromeExecutable;
  }
  delete env.ADOPS_CAPTURE_API_TOKEN;
  delete env.ADOPS_INTERNAL_API_TOKEN;
  if (insertion.siteSigla === "PERRENGUE" || insertion.siteSigla === "AFL" || insertion.siteSigla === "PPMT") {
    env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION = "1";
  } else {
    delete env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION;
  }
  if (insertion.siteSigla === "PPMT" && String(insertion.piCodigo || "").includes("25206093")) {
    env.ADOPS_CAPTURE_ALLOW_SAME_MEDIA_OUTSIDE_SLOT = "1";
  } else {
    delete env.ADOPS_CAPTURE_ALLOW_SAME_MEDIA_OUTSIDE_SLOT;
  }
  return env;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(options.timeoutMs || 240_000);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2500).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, timedOut: signal === "SIGTERM" || signal === "SIGKILL" });
    });
  });
}

async function runOfficialCapture({ apiBase, outDir, insertion, date }) {
  const generatedRoot = path.join(outDir, "_generated");
  const captureAt = buildRetroCaptureAt(date, insertion.id);
  const result = await runProcess(nodeBin, [
    captureScript,
    "--apiBase", apiBase,
    "--insertionId", String(insertion.id),
    "--captureAt", captureAt,
    "--upload", "false",
    "--saveEvidence", "false",
    "--replaceExisting", "true",
  ], {
    cwd: repoRoot,
    env: captureEnvFor(insertion, generatedRoot, apiBase),
    timeoutMs: Number(process.env.ADOPS_CAPTURE_TIMEOUT_MS || 240_000),
  });

  let payload = null;
  const stdout = String(result.stdout || "").trim();
  if (stdout) {
    try {
      payload = JSON.parse(stdout.slice(stdout.indexOf("{")));
    } catch {
      payload = null;
    }
  }

  if (result.status !== 0 || !payload?.ok) {
    return {
      ok: false,
      captureAt,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: payload?.error || String(result.stderr || result.stdout || "capture_failed").slice(0, 2000),
    };
  }

  const meta = await readJson(payload.metadata);
  const issues = assertOfficialMetadata(meta, currentPackage, insertion, date);
  return {
    ok: issues.length === 0,
    captureAt,
    issues,
    payload,
    meta,
    finalPng: payload.finalPng,
    metadataPath: payload.metadata,
  };
}

async function runOfficialCaptureWithRetry({ apiBase, outDir, insertion, date }) {
  const maxAttempts = Number(process.env.ADOPS_CAPTURE_RETRY_ATTEMPTS || 3);
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await runOfficialCapture({ apiBase, outDir, insertion, date });
    if (last.ok) return { ...last, attempts: attempt };
    const errorText = `${last.error || ""}\n${last.stderr || ""}\n${last.stdout || ""}`;
    const transient = /browser.*closed|Target page|context.*closed|ECONNRESET|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION|search_index_unavailable|Timeout|timed out|SIGTERM|SIGKILL/i.test(errorText);
    if (!transient || attempt === maxAttempts) break;
    console.error(`[retry] insertion=${insertion.id} date=${date} attempt=${attempt + 1}/${maxAttempts}`);
    await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
  }
  return { ...(last || { ok: false, error: "capture_not_started" }), attempts: maxAttempts };
}

async function buildContactSheet(outDir, rows) {
  const listPath = path.join(outDir, ".contact-sheet-input.json");
  const sheetPath = path.join(outDir, "visual-contact-sheet.png");
  const items = rows.filter((row) => row.status === "audited" && row.localFile);
  await fs.writeFile(listPath, JSON.stringify({ sheetPath, items }, null, 2));
  const py = `
import json, math
from PIL import Image, ImageDraw, ImageFont
data=json.load(open(${JSON.stringify(listPath)}))
items=data["items"]
thumb_w, thumb_h = 360, 230
pad, label_h = 18, 58
cols = 3
rows = max(1, math.ceil(len(items)/cols))
W = cols*thumb_w + (cols+1)*pad
H = rows*(thumb_h+label_h) + (rows+1)*pad
sheet = Image.new("RGB", (W,H), "#f7f3ec")
draw = ImageDraw.Draw(sheet)
try:
  font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
  small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
except Exception:
  font = ImageFont.load_default()
  small = ImageFont.load_default()
for idx,item in enumerate(items):
  c=idx%cols; r=idx//cols
  x=pad+c*(thumb_w+pad); y=pad+r*(thumb_h+label_h+pad)
  try:
    im=Image.open(item["localFile"]).convert("RGB")
    im.thumbnail((thumb_w, thumb_h), Image.LANCZOS)
    bx=x+(thumb_w-im.width)//2; by=y+(thumb_h-im.height)//2
    sheet.paste(im,(bx,by))
  except Exception as e:
    draw.rectangle([x,y,x+thumb_w,y+thumb_h], fill="#ddd", outline="#999")
    draw.text((x+8,y+8), str(e)[:80], fill="#900", font=small)
  draw.rectangle([x,y+thumb_h,x+thumb_w,y+thumb_h+label_h], fill="#ffffff", outline="#d8d0c4")
  draw.text((x+8,y+thumb_h+6), f'{item["date"]} - ins {item["insertionId"]}', fill="#1c1c1c", font=font)
  draw.text((x+8,y+thumb_h+32), item.get("format","")[:46], fill="#555", font=small)
sheet.save(data["sheetPath"])
`;
  const result = spawnSync(pythonBin, ["-c", py], { encoding: "utf8" });
  await fs.rm(listPath, { force: true });
  if (result.status !== 0) throw new Error(`Falha ao criar contact sheet: ${result.stderr || result.stdout}`);
  return sheetPath;
}

async function cleanMacMetadata(dir) {
  await fs.rm(path.join(dir, ".DS_Store"), { force: true });
  spawnSync("find", [dir, "-name", ".DS_Store", "-delete"], { encoding: "utf8" });
  spawnSync("find", [dir, "-name", "._*", "-delete"], { encoding: "utf8" });
}

let currentPackage = null;

async function buildPackage(apiBase, pkg) {
  currentPackage = pkg;
  const outDir = path.join(downloadsRoot, pkg.slug);
  const printsDir = path.join(outDir, "prints");
  const metadataDir = path.join(outDir, "metadata");
  const diagnosticsDir = path.join(outDir, "diagnostics");
  const resumeExisting = process.env.ADOPS_RESUME_EXISTING === "1";
  if (resumeExisting && existsSync(outDir)) {
    await fs.mkdir(printsDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });
    await fs.mkdir(diagnosticsDir, { recursive: true });
  } else {
    await mkdirClean(outDir);
    await fs.mkdir(printsDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });
    await fs.mkdir(diagnosticsDir, { recursive: true });
  }

  const apiPublicProbe = await probeUrl("https://adops-api-public.leandro471.workers.dev/api/insertions");
  const pageProbes = [];
  const mediaProbes = [];
  const siteUrl = siteHomeUrl(pkg.site);
  pageProbes.push(await probeUrl(siteUrl));

  for (const group of pkg.insertions) {
    mediaProbes.push(await probeUrl(insertions[group.insertionId].mediaUrl));
  }

  const rows = [];
  const failures = [];
  if (pkg.blockedDiscovery) {
    await buildContactSheet(outDir, rows);
    await fs.writeFile(
      path.join(outDir, "status.csv"),
      "date,site,pi,insertionId,format,status,auditOk,issues,localFile,metadataFile,targetUrl,captureAt,mediaUrl,matchedMediaUrl,configuredSlotSelector,slotSelector,contextSelector,finalProofStyle,frameTemplateVersion,chromeTopTheme,scrollbarRendered,scrollbarThumbTop,scrollbarThumbHeight,pageStatus,pageLooks404,mediaStatus,sha256\n",
    );
    const manifest = {
      title: pkg.title,
      generatedAt: new Date().toISOString(),
      timezone: "America/Cuiaba",
      generator: "scripts/src/generate-retro-packages-2026-06-25.mjs",
      officialCaptureScript: "scripts/src/capture-insertion-proof.cjs",
      frameContract: "windows11-chrome-light-similar-v4",
      site: pkg.site,
      pi: pkg.pi,
      campaign: pkg.campaign,
      status: "blocked",
      auditOk: false,
      blockedDiscovery: pkg.blockedDiscovery,
      apiPublic: {
        status: apiPublicProbe.status,
        ok: apiPublicProbe.ok,
        note: "API publica indisponivel ou instavel; descoberta conferida por API privada e HTML publico.",
      },
      pageProbes,
      mediaProbes,
      anti404Required: pkg.anti404 === true,
      totalPrints: 0,
      auditedCount: 0,
      invalidCount: 0,
      insertions: [],
      rows,
    };
    await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await fs.writeFile(
      path.join(outDir, "00-LEIA-ME.txt"),
      [
        pkg.title,
        "",
        "Status: blocked",
        "Prints auditados localmente: 0/0",
        `Contrato visual previsto: ${manifest.frameContract}`,
        "",
      `Nao gerei prints desta PI porque a insercao canonica ${pkg.site} ainda nao tem midia/formato confirmado nas fontes consultadas.`,
      pkg.blockedDiscovery.reason,
      `Gerar PNG com PI ${pkg.pi} em ${pkg.site} neste estado seria evidencia falsa.`,
        "",
        "Arquivos:",
        "- manifest.json: diagnostico e conflitos encontrados",
        "- status.csv: vazio porque nao houve print aceito",
        "- visual-contact-sheet.png: folha vazia de controle",
        "- diagnostics/: probes adicionais, se houver",
        "",
      ].join("\n"),
    );
    await fs.writeFile(path.join(diagnosticsDir, "blocked-discovery.json"), `${JSON.stringify(pkg.blockedDiscovery, null, 2)}\n`);
    await cleanMacMetadata(outDir);
    const zipPath = `${outDir}.zip`;
    await fs.rm(zipPath, { force: true });
    const zip = spawnSync("zip", ["-X", "-r", zipPath, path.basename(outDir)], {
      cwd: path.dirname(outDir),
      encoding: "utf8",
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    if (zip.status !== 0) throw new Error(`Falha ao zipar ${outDir}: ${zip.stderr || zip.stdout}`);
    return { outDir, zipPath, manifest, failures: [{ blocked: true, reason: pkg.blockedDiscovery.reason }] };
  }
  for (const group of pkg.insertions) {
    if (process.env.ADOPS_ONLY_INSERTION && String(group.insertionId) !== String(process.env.ADOPS_ONLY_INSERTION)) {
      continue;
    }
    const insertion = insertions[group.insertionId];
    for (const date of group.dates) {
      if (process.env.ADOPS_ONLY_DATE && date !== process.env.ADOPS_ONLY_DATE) {
        continue;
      }
      const fileName = `${date}-${pkg.site}-PI-${pkg.pi}-${compact(insertion.campanhaName)}-${compact(insertion.localFormatoNormalizado)}-${group.insertionId}.png`;
      const metaName = fileName.replace(/\.png$/i, ".meta.json");
      const finalTarget = path.join(printsDir, fileName);
      const metaTarget = path.join(metadataDir, metaName);
      console.error(`[official-capture] ${pkg.slug} insertion=${group.insertionId} date=${date}`);
      let result = null;
      let reused = false;
      if (resumeExisting && existsSync(finalTarget) && existsSync(metaTarget)) {
        const meta = await readJson(metaTarget);
        const issues = assertOfficialMetadata(meta, pkg, insertion, date);
        result = {
          ok: issues.length === 0,
          captureAt: buildRetroCaptureAt(date, group.insertionId),
          issues,
          meta,
          finalPng: finalTarget,
          metadataPath: metaTarget,
          reused: true,
          attempts: 0,
        };
        reused = true;
        console.error(`[resume] using existing audited files insertion=${group.insertionId} date=${date}`);
      } else {
        result = await runOfficialCaptureWithRetry({ apiBase, outDir, insertion, date });
      }
      const mediaProbe = mediaProbes.find((probe) => probe.url === insertion.mediaUrl) || null;
      const pageProbe = pkg.anti404 ? await probeUrl(result.meta?.pageUrl || siteUrl) : null;
      const anti404Ok = !pkg.anti404 || (pageProbe?.ok === true && pageProbe?.looks404 === false);
      let copied = false;
      if (reused && result.ok && anti404Ok && existsSync(finalTarget) && existsSync(metaTarget)) {
        copied = true;
      } else if (result.ok && anti404Ok && result.finalPng && existsSync(result.finalPng)) {
        await fs.copyFile(result.finalPng, finalTarget);
        await fs.copyFile(result.metadataPath, metaTarget);
        copied = true;
      }
      const status = result.ok && anti404Ok && copied ? "audited" : "invalid_audit";
      const issues = [
        ...(Array.isArray(result.issues) ? result.issues : []),
        result.ok ? null : "official_capture_failed",
        copied ? null : "png_missing",
        mediaProbe?.ok === true ? null : "media_url_unhealthy",
        anti404Ok ? null : "page_404_or_unhealthy",
      ].filter(Boolean);
      const row = {
        date,
        site: pkg.site,
        pi: pkg.pi,
        insertionId: group.insertionId,
        format: insertion.localFormatoNormalizado,
        status,
        auditOk: status === "audited",
        issues: issues.join("|"),
        localFile: copied ? finalTarget : "",
        metadataFile: copied ? metaTarget : "",
        targetUrl: result.meta?.pageUrl || "",
        captureAt: result.captureAt,
        mediaUrl: insertion.mediaUrl,
        matchedMediaUrl: result.meta?.matchedMediaUrl || "",
        configuredSlotSelector: configuredSlotSelectorFor(insertion),
        slotSelector: result.meta?.slotSelector || "",
        contextSelector: result.meta?.contextSelector || "",
        finalProofStyle: result.meta?.finalProofStyle || "",
        frameTemplateVersion: result.meta?.frameTemplateVersion || "",
        chromeTopTheme: result.meta?.chromeTopTheme || "",
        scrollbarRendered: result.meta?.scrollbarRendered ?? "",
        scrollbarThumbTop: result.meta?.scrollbarThumbTop ?? "",
        scrollbarThumbHeight: result.meta?.scrollbarThumbHeight ?? "",
        pageStatus: pageProbe?.status ?? "",
        pageLooks404: pageProbe?.looks404 ?? "",
        mediaStatus: mediaProbe?.status ?? "",
        reused,
        attempts: result.attempts ?? "",
        sha256: copied ? await sha256(finalTarget) : "",
      };
      rows.push(row);
      if (status !== "audited") {
        const failure = {
          row,
          captureStatus: result.status ?? null,
          error: result.error || null,
          stdout: result.stdout ? String(result.stdout).slice(-4000) : null,
          stderr: result.stderr ? String(result.stderr).slice(-4000) : null,
          metadata: result.meta || null,
        };
        failures.push(failure);
        await fs.writeFile(path.join(diagnosticsDir, `${date}-${group.insertionId}-failure.json`), `${JSON.stringify(failure, null, 2)}\n`);
      }
      if (pageProbe) {
        await fs.writeFile(path.join(diagnosticsDir, `${date}-${group.insertionId}-anti404.json`), `${JSON.stringify(pageProbe, null, 2)}\n`);
      }
    }
  }

  await buildContactSheet(outDir, rows);
  const statusCsv = [
    "date,site,pi,insertionId,format,status,auditOk,issues,localFile,metadataFile,targetUrl,captureAt,mediaUrl,matchedMediaUrl,configuredSlotSelector,slotSelector,contextSelector,finalProofStyle,frameTemplateVersion,chromeTopTheme,scrollbarRendered,scrollbarThumbTop,scrollbarThumbHeight,pageStatus,pageLooks404,mediaStatus,sha256",
    ...rows.map((row) => [
      row.date,
      row.site,
      row.pi,
      row.insertionId,
      row.format,
      row.status,
      row.auditOk,
      row.issues,
      row.localFile,
      row.metadataFile,
      row.targetUrl,
      row.captureAt,
      row.mediaUrl,
      row.matchedMediaUrl,
      row.configuredSlotSelector,
      row.slotSelector,
      row.contextSelector,
      row.finalProofStyle,
      row.frameTemplateVersion,
      row.chromeTopTheme,
      row.scrollbarRendered,
      row.scrollbarThumbTop,
      row.scrollbarThumbHeight,
      row.pageStatus,
      row.pageLooks404,
      row.mediaStatus,
      row.sha256,
    ].map(csvEscape).join(",")),
  ].join("\n");
  await fs.writeFile(path.join(outDir, "status.csv"), `${statusCsv}\n`);

  const manifest = {
    title: pkg.title,
    generatedAt: new Date().toISOString(),
    timezone: "America/Cuiaba",
    generator: "scripts/src/generate-retro-packages-2026-06-25.mjs",
    officialCaptureScript: "scripts/src/capture-insertion-proof.cjs",
    frameContract: "windows11-chrome-light-similar-v4",
    site: pkg.site,
    pi: pkg.pi,
    campaign: pkg.campaign,
    status: failures.length ? "needs_review" : "audited",
    auditOk: failures.length === 0,
    apiPublic: {
      status: apiPublicProbe.status,
      ok: apiPublicProbe.ok,
      note: apiPublicProbe.status === 521 || apiPublicProbe.ok === false
        ? "API publica indisponivel ou instavel; pacote gerado com API local minima e capturador oficial."
        : "API publica respondeu durante a geracao.",
    },
    pageProbes,
    mediaProbes,
    anti404Required: pkg.anti404 === true,
    excludedInsertions: pkg.excludedInsertions || [],
    discoveryNotes: pkg.discoveryNotes || [],
    mediaEvidence: pkg.site === "AFL" && pkg.pi === "25206206" ? {
      driveFileName: "_banner_site_825x120-sau (6).gif",
      driveFileId: "1FQ-rQsnEj9Ud1Z9khMNrr2lLsJLq3gBK",
      reusedPublicMediaUrl: govFazSauMediaUrl,
      sha256: govFazSauMediaSha256,
      bytes: 41299,
      dimensions: "825x120",
      aflHostProbe: "equivalent AFL host URLs tested returned 404",
    } : null,
    totalPrints: rows.length,
    auditedCount: rows.filter((row) => row.status === "audited").length,
    invalidCount: rows.filter((row) => row.status !== "audited").length,
    insertions: pkg.insertions.map((group) => ({
      ...insertions[group.insertionId],
      evidences: undefined,
      dates: group.dates,
    })),
    rows,
  };
  await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(
    path.join(outDir, "00-LEIA-ME.txt"),
    [
      pkg.title,
      "",
      `Status: ${manifest.status}`,
      `Prints auditados localmente: ${manifest.auditedCount}/${manifest.totalPrints}`,
      `Contrato visual: ${manifest.frameContract}`,
      `API publica AdOps: ${apiPublicProbe.status || "sem resposta"}`,
      "",
      "Este pacote substitui os zips anteriores gerados por caminho direto/overlay.",
      "Todos os PNGs em prints/ foram aceitos apenas se vieram do capturador oficial capture-insertion-proof.cjs.",
      "O pacote bloqueia evidencia com moldura nao oficial, seletor errado, media divergente, 404 visual ou scrollbar ausente.",
      pkg.anti404 ? "Gate ROO ativo: pagina final precisa responder HTTP 200 e nao pode sinalizar 404." : "",
      "",
      "Arquivos:",
      "- prints/: PNGs finais para envio",
      "- metadata/: meta.json oficial de cada print",
      "- visual-contact-sheet.png: revisao visual consolidada",
      "- status.csv: status por data",
      "- manifest.json: metadados, hashes e probes",
      "- diagnostics/: falhas e probes adicionais, se houver",
      ...(pkg.discoveryNotes?.length ? ["", "Descoberta da midia:", ...pkg.discoveryNotes.map((note) => `- ${note}`)] : []),
      "",
      pkg.excludedInsertions?.length
        ? `Insercoes nao incluidas: ${pkg.excludedInsertions.map((item) => `${item.insertionId} (${item.reason})`).join("; ")}`
        : "",
      "",
    ].filter((line) => line !== null).join("\n"),
  );

  await cleanMacMetadata(outDir);
  await fs.rm(path.join(outDir, "_generated"), { recursive: true, force: true });
  const zipPath = `${outDir}.zip`;
  await fs.rm(zipPath, { force: true });
  const zip = spawnSync("zip", ["-X", "-r", zipPath, path.basename(outDir)], {
    cwd: path.dirname(outDir),
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (zip.status !== 0) throw new Error(`Falha ao zipar ${outDir}: ${zip.stderr || zip.stdout}`);
  return { outDir, zipPath, manifest, failures };
}

async function main() {
  const { server, apiBase } = await startLocalApi();
  const results = [];
  try {
    for (const pkg of packages) {
      if (process.env.ADOPS_ONLY_PACKAGE && !pkg.slug.includes(process.env.ADOPS_ONLY_PACKAGE)) continue;
      results.push(await buildPackage(apiBase, pkg));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(JSON.stringify({
    ok: results.every((item) => item.failures.length === 0),
    results: results.map((item) => ({
      outDir: item.outDir,
      zipPath: item.zipPath,
      status: item.manifest.status,
      totalPrints: item.manifest.totalPrints,
      auditedCount: item.manifest.auditedCount,
      invalidCount: item.manifest.invalidCount,
    })),
  }, null, 2));
  if (results.some((item) => item.failures.length > 0)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
