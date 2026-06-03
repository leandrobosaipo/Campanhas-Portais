#!/usr/bin/env node

const API_BASE = process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev";
const OPS_API_TOKEN = process.env.OPS_API_TOKEN || process.env.ADOPS_OPS_API_TOKEN || "";
const enabled = process.env.ADOPS_CREATE_SPM_PRINT_INTAKE === "true";
const now = new Date().toISOString();

const intakes = [
  {
    slug: "PERR-ALMT-CIDADANIA-MEGABANNER-TOPO",
    name: "WhatsApp intake - PERR ALMT CIDADANIA MEGA BANNER TOPO",
    path: "/whatsapp/SPM/2026-06-03/PERR-ALMT-CIDADANIA-MEGABANNER-TOPO",
    parsedPi: {
      piCodigo: null,
      campaignName: "CIDADANIA - ALMT",
      competencia: null,
      clienteId: null,
      agenciaId: null,
      insertions: [
        {
          siteSigla: "PERRENGUE",
          localFormato: "MEGA BANNER TOPO",
          localFormatoNormalizado: "MEGA BANNER TOPO",
          periodoInicio: "2026-05-04",
          periodoFim: "2026-06-24",
          periodoOriginal: "04/05 - 24/06",
        },
      ],
      sourceNote: "Print WhatsApp: campanha CIDADANIA - ALMT; megabanner topo; PI ausente no print.",
    },
  },
  {
    slug: "PERR-ALMT-CIDADANIA-VIDEO",
    name: "WhatsApp intake - PERR ALMT CIDADANIA VIDEO",
    path: "/whatsapp/SPM/2026-06-03/PERR-ALMT-CIDADANIA-VIDEO",
    parsedPi: {
      piCodigo: null,
      campaignName: "CIDADANIA - ALMT",
      competencia: null,
      clienteId: null,
      agenciaId: null,
      insertions: [
        {
          siteSigla: "PERRENGUE",
          localFormato: "VIDEO",
          localFormatoNormalizado: "VIDEO",
          periodoInicio: "2026-05-04",
          periodoFim: "2026-06-15",
          periodoOriginal: "04/05 - 15/06",
        },
      ],
      sourceNote: "Print WhatsApp: campanha CIDADANIA - ALMT; video/VT; PI ausente no print.",
    },
  },
  {
    slug: "ROO-CAMPANHA-2026-06-05",
    name: "WhatsApp intake - ROO campanha 2026-06-05",
    path: "/whatsapp/SPM/2026-06-03/ROO-CAMPANHA-2026-06-05",
    parsedPi: {
      piCodigo: null,
      campaignName: null,
      competencia: "2026-06",
      clienteId: null,
      agenciaId: null,
      insertions: [
        {
          siteSigla: "ROO",
          periodoInicio: "2026-06-05",
          periodoFim: null,
          periodoOriginal: "começa dia 05",
        },
      ],
      sourceNote: "Print WhatsApp: operadora citou campanha ROO começando em 2026-06-05; PI ausente no print.",
    },
  },
  {
    slug: "AFL-CAMPANHA-2026-06-09",
    name: "WhatsApp intake - AFL campanha 2026-06-09",
    path: "/whatsapp/SPM/2026-06-03/AFL-CAMPANHA-2026-06-09",
    parsedPi: {
      piCodigo: null,
      campaignName: null,
      competencia: "2026-06",
      clienteId: null,
      agenciaId: null,
      insertions: [
        {
          siteSigla: "AFL",
          periodoInicio: "2026-06-09",
          periodoFim: null,
          periodoOriginal: "começa dia 09",
        },
      ],
      sourceNote: "Print WhatsApp: operadora citou campanha AFL começando em 2026-06-09; PI ausente no print.",
    },
  },
];

if (!enabled) {
  console.error("ADOPS_CREATE_SPM_PRINT_INTAKE=true é obrigatório para criar intakes do print.");
  process.exit(2);
}

if (!OPS_API_TOKEN.trim()) {
  console.error("OPS_API_TOKEN ou ADOPS_OPS_API_TOKEN é obrigatório.");
  process.exit(2);
}

async function postIntake(item) {
  const driveFileId = `whatsapp-spm-${item.slug.toLowerCase()}`;
  const payload = {
    eventId: `drive:${driveFileId}:2026-06-03T00:00:00.000Z`,
    driveFileId,
    name: item.name,
    mimeType: "application/vnd.google-apps.folder",
    path: item.path,
    parentFolderId: "whatsapp-spm-2026-06-03",
    modifiedTime: "2026-06-03T00:00:00.000Z",
    webViewLink: null,
    eventType: "folder_created",
    parsedPi: item.parsedPi,
  };
  const response = await fetch(`${API_BASE}/api/ops/drive-pi-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPS_API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const rawBody = await response.text();
  let body = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`${item.slug}: HTTP ${response.status} ${rawBody.slice(0, 1000) || JSON.stringify(body)}`);
  }
  return { slug: item.slug, status: response.status, body };
}

const results = [];
for (const item of intakes) {
  results.push(await postIntake(item));
}

console.log(JSON.stringify({
  ok: true,
  generatedAt: now,
  apiBase: API_BASE,
  count: results.length,
  results,
}, null, 2));
