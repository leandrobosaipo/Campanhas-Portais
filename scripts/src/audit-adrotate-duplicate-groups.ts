import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type SiteConfig = {
  sigla: string;
  homeUrl: string;
  articleFallbackUrl?: string | null;
};

type DuplicateResult = {
  sigla: string;
  page: string;
  duplicateGroups: Array<{ groupId: number; count: number }>;
  error?: string;
};

const PROJECT_ROOT = "/Users/leandrobosaipo/Projetos/AdOps";
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "adrotate-sites.json");
const REPORT_PATH = path.join(PROJECT_ROOT, "docs", "adrotate-duplicate-groups-audit-2026-04-10.md");

function loadConfig(): Record<string, SiteConfig> {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, SiteConfig>;
}

function findDuplicateGroups(html: string) {
  const counts = new Map<number, number>();
  for (const match of html.matchAll(/class="g g-(\d+)"/g)) {
    const id = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([groupId, count]) => ({ groupId, count }))
    .sort((a, b) => a.groupId - b.groupId);
}

async function audit() {
  const config = loadConfig();
  const results: DuplicateResult[] = [];

  for (const site of Object.values(config)) {
    for (const page of [site.homeUrl, site.articleFallbackUrl].filter(Boolean) as string[]) {
      try {
        const html = await fetch(page).then((response) => response.text());
        results.push({
          sigla: site.sigla,
          page,
          duplicateGroups: findDuplicateGroups(html),
        });
      } catch (error) {
        results.push({
          sigla: site.sigla,
          page,
          duplicateGroups: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const lines = [
    "# Auditoria de grupos duplicados do AdRotate",
    "",
    `Data da varredura: \`2026-04-10\``,
    "",
    "## Resumo",
    "",
  ];

  const sitesWithDuplicates = results.filter((item) => item.duplicateGroups.length > 0);
  if (!sitesWithDuplicates.length) {
    lines.push("- Nenhum grupo duplicado encontrado nas páginas públicas auditadas.");
  } else {
    for (const item of sitesWithDuplicates) {
      lines.push(`- \`${item.sigla}\` em \`${item.page}\`: ${item.duplicateGroups.map((group) => `grupo ${group.groupId} (${group.count}x)`).join(", ")}`);
    }
  }

  const errored = results.filter((item) => item.error);
  if (errored.length) {
    lines.push("", "## Páginas com erro na leitura", "");
    for (const item of errored) {
      lines.push(`- \`${item.sigla}\` em \`${item.page}\`: ${item.error}`);
    }
  }

  lines.push("", "## Detalhe por página", "");
  for (const item of results) {
    lines.push(`### ${item.sigla} — ${item.page}`);
    if (item.error) {
      lines.push(`- Erro: ${item.error}`, "");
      continue;
    }
    if (!item.duplicateGroups.length) {
      lines.push("- Sem grupos duplicados visíveis nessa página.", "");
      continue;
    }
    for (const group of item.duplicateGroups) {
      lines.push(`- Grupo ${group.groupId}: ${group.count} ocorrências`);
    }
    lines.push("");
  }

  lines.push("## Leitura operacional", "");
  lines.push("- A rotina de captura do AdOps já foi ajustada para escolher automaticamente o slot visível quando o mesmo grupo aparecer mais de uma vez no DOM.");
  lines.push("- Mesmo assim, esta auditoria continua útil para mapear quais portais merecem atenção extra quando novos formatos forem integrados.");
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(JSON.stringify({ ok: true, reportPath: REPORT_PATH, results }, null, 2));
}

audit().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
