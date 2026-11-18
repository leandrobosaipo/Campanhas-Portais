const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function slugifyHeading(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "secao";
}

export function buildManualManifest(generatedAt) {
  return {
    slug: "adops-manual-operacional",
    title: "Manual Operacional AdOps",
    description: "Rotinas vigentes para cadastrar, publicar, auditar, entregar e manter campanhas AdOps.",
    kind: "guia",
    generatedAt,
    updatedAt: String(generatedAt).slice(0, 10),
    visibility: "unlisted",
    thumb: "assets/thumb.png",
    favicon: "assets/favicon.png",
    logo: "assets/logo.png",
    publication: {
      preset: "corporate-base",
      density: "medium",
      hero: "compact",
      typography: "sans",
      accent: "institutional-blue",
      radius: 4,
      metricsColumns: 4,
      tableMode: "cards-on-mobile",
      evidenceLayout: "grid",
      motion: "reduced",
      audience: "mixed",
    },
  };
}

export function classifyManualDocument(filePath) {
  if (filePath.endsWith("runbook-nova-pi-evidencias.md")) return "tutorial";
  if (filePath.endsWith("ops-api-runbook.md")) return "reference";
  if (filePath.endsWith("status-do-projeto.md")) return "explanation";
  return "how-to";
}

export function extractMarkdownHeadings(markdown) {
  return String(markdown ?? "").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (!match) return [];
    const text = match[2].replace(/`([^`]+)`/g, "$1");
    return [{ level: match[1].length, text, id: slugifyHeading(text) }];
  });
}

function safeHref(value) {
  const href = String(value || "").trim();
  if (/^(?:https?:|mailto:)/i.test(href) || /^(?:#|\.\.?\/|\/)[^\\]*$/.test(href)) return escapeHtml(href);
  return null;
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const safe = safeHref(href);
      return safe ? `<a href="${safe}">${label}</a>` : `<span class="unsafe-link">${label}</span>`;
    });
}

function validatePublishNames(values) {
  const names = values.map((value) => String(value || ""));
  if (names.some((value) => !/^[A-Za-z0-9._-]+$/.test(value))) throw new Error("Nome de publicação inválido.");
  return names;
}

export function buildSafePublishCommand({ slug, stagingName, backupName }) {
  const [safeSlug, safeStaging, safeBackup] = validatePublishNames([slug, stagingName, backupName]);
  return [
    "cd /target",
    `test -d '${safeStaging}'`,
    `if [ -d '${safeSlug}' ]; then mv -- '${safeSlug}' '${safeBackup}'; fi`,
    `if ! mv -- '${safeStaging}' '${safeSlug}'; then if [ -d '${safeBackup}' ] && [ ! -d '${safeSlug}' ]; then mv -- '${safeBackup}' '${safeSlug}'; fi; exit 1; fi`,
  ].join(" && ");
}

export function buildSafeRollbackCommand({ slug, backupName, failedName }) {
  const [safeSlug, safeBackup, safeFailed] = validatePublishNames([slug, backupName, failedName]);
  return [
    "cd /target",
    `test -d '${safeBackup}'`,
    `if [ -d '${safeSlug}' ]; then mv -- '${safeSlug}' '${safeFailed}'; fi`,
    `if ! mv -- '${safeBackup}' '${safeSlug}'; then if [ -d '${safeFailed}' ] && [ ! -d '${safeSlug}' ]; then mv -- '${safeFailed}' '${safeSlug}'; fi; exit 1; fi`,
  ].join(" && ");
}

export function renderTrustedMarkdown(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const output = [];
  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];
  let list = [];
  let paragraph = [];
  let tableRows = [];
  const flushList = () => {
    if (!list.length) return;
    output.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows.map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
    const header = rows[0] || [];
    const body = rows.slice(2);
    output.push(`<div class="table-wrap"><table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    tableRows = [];
  };
  for (const line of lines) {
    const fence = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      if (!inCode) {
        flushParagraph(); flushList(); flushTable();
        inCode = true; codeLanguage = fence[1] || "text"; codeLines = [];
      } else {
        output.push(`<pre><code class="language-${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (heading) {
      flushParagraph(); flushList(); flushTable();
      const text = heading[2].replace(/`([^`]+)`/g, "$1");
      output.push(`<h${heading[1].length} id="${slugifyHeading(text)}">${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { flushParagraph(); flushTable(); list.push(bullet[1]); continue; }
    if (/^\|.+\|\s*$/.test(line)) { flushParagraph(); flushList(); tableRows.push(line.trim()); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); flushTable(); continue; }
    if (line.startsWith("> ")) {
      flushParagraph(); flushList(); flushTable(); output.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList(); flushTable();
  if (inCode) output.push(`<pre><code class="language-${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return output.join("\n");
}

export function validateManualSources(sources) {
  const labels = ["Estado:", "Público:", "Última validação:", "Release:", "Fonte autoritativa:"];
  for (const source of sources) {
    for (const label of labels) {
      if (!String(source.content).includes(label)) throw new Error(`${source.path}: metadado obrigatório ausente: ${label}`);
    }
  }
}
